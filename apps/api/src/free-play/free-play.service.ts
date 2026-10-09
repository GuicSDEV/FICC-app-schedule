import { Injectable, Logger } from "@nestjs/common";
import { CourtStatus, LessonStatus, Prisma, QueueStatus, Role, UserStatus } from "@ficc/db";
import {
  type CheckInInput,
  type CheckInView,
  clubToday,
  type CourtNow,
  type CourtsNow,
  type DayPlan,
  type IsoDate,
  overlapsSlot,
  type QueueEntryView,
  slotEndsAt,
  slotsOfDay,
  slotStartsAt,
  toDbDate,
} from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toCourtSummary, toPlayerSummary } from "../common/mappers";
import { isUniqueViolation, serializable, type Tx } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { DayPlanService } from "../schedule/day-plan.service";
import { freezesOverlapping } from "../schedule/freezes";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

const checkInInclude = () =>
  ({
    players: { include: { user: { select: playerSelect() } } },
  }) satisfies Prisma.CourtCheckInInclude;
type CheckInRow = Prisma.CourtCheckInGetPayload<{ include: ReturnType<typeof checkInInclude> }>;

function toCheckInView(row: CheckInRow): CheckInView {
  return {
    id: row.id,
    courtId: row.courtId,
    players: row.players.map((player) => toPlayerSummary(player.user)),
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
  };
}

interface Snapshot {
  date: IsoDate;
  plan: DayPlan;
  /** Free play is running right now (free-play day, inside the day's slots). */
  open: boolean;
  courts: {
    id: string;
    name: string;
    court: CourtNow["court"];
    blockedBy: CourtNow["blockedBy"];
    closed: boolean;
  }[];
  checkIns: CheckInRow[];
  offers: { id: string; userId: string; courtId: string; expiresAt: Date }[];
}

/**
 * Free play ("uso livre"): no reservations; players check in to a free court and check out when
 * done (or are checked out after the session). When every court is busy the club can run a
 * digital queue: the first in line gets the next free court for a few minutes to claim it.
 */
@Injectable()
export class FreePlayService {
  private readonly logger = new Logger(FreePlayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly plans: DayPlanService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async courtsNow(viewer: RequestUser): Promise<CourtsNow> {
    await this.tick();
    const now = this.clock.now();
    const snap = await this.snapshot(this.prisma, now);
    const settings = clubSettings().freePlay;
    const waiting = await this.prisma.courtQueueEntry.findMany({
      where: { date: toDbDate(snap.date), status: QueueStatus.WAITING },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      select: { id: true, userId: true },
    });
    const mine = await this.prisma.courtQueueEntry.findFirst({
      where: {
        userId: viewer.id,
        date: toDbDate(snap.date),
        status: { in: [QueueStatus.WAITING, QueueStatus.OFFERED] },
      },
    });
    const myCheckIn = snap.checkIns.find((row) =>
      row.players.some((player) => player.userId === viewer.id),
    );
    return {
      date: snap.date,
      mode: snap.plan.mode,
      serverNow: now.toISOString(),
      courts: snap.courts.map((court) => {
        const checkIn = snap.checkIns.find((row) => row.courtId === court.id) ?? null;
        const offer = snap.offers.find((entry) => entry.courtId === court.id);
        return {
          court: court.court,
          state: court.closed
            ? "closed"
            : court.blockedBy
              ? "blocked"
              : checkIn
                ? "in_use"
                : offer
                  ? "offered"
                  : "free",
          checkIn: checkIn ? toCheckInView(checkIn) : null,
          blockedBy: court.blockedBy,
          offeredUntil: offer?.expiresAt.toISOString() ?? null,
        } satisfies CourtNow;
      }),
      queue: {
        enabled: settings.queueEnabled && snap.plan.mode === "FREE_PLAY",
        waiting: waiting.length,
        me: mine
          ? this.toQueueView(
              mine,
              waiting.findIndex((entry) => entry.id === mine.id),
            )
          : null,
      },
      myCheckIn: myCheckIn ? toCheckInView(myCheckIn) : null,
    };
  }

  async checkIn(viewer: RequestUser, input: CheckInInput): Promise<CheckInView> {
    const created = await serializable(this.prisma, async (tx) => {
      const now = this.clock.now();
      const snap = await this.snapshot(tx, now);
      if (!snap.open) throw conflict("NOT_FREE_PLAY_NOW", "api.notFreePlayNow");
      const court = snap.courts.find((entry) => entry.id === input.courtId);
      if (!court) throw notFound("COURT_NOT_FOUND", "api.courtNotFound");
      if (court.closed) {
        throw conflict("COURT_CLOSED_TODAY", {
          key: "api.courtClosedToday",
          params: { court: court.name },
        });
      }
      if (court.blockedBy || snap.checkIns.some((row) => row.courtId === court.id)) {
        throw conflict("COURT_BUSY", "api.courtBusy");
      }
      const offer = snap.offers.find((entry) => entry.courtId === court.id);
      if (offer && offer.userId !== viewer.id) throw conflict("COURT_HELD", "api.courtHeld");

      const playerIds = [...new Set([viewer.id, ...input.partnerIds])];
      const players = await tx.user.findMany({
        where: {
          id: { in: playerIds },
          role: Role.MEMBER,
          isActive: true,
          status: UserStatus.ACTIVE,
        },
        select: { id: true, name: true },
      });
      if (players.length !== playerIds.length) {
        throw unprocessable("INVALID_PLAYERS", "api.invalidPlayers");
      }
      const busy = snap.checkIns
        .flatMap((row) => row.players)
        .find((player) => playerIds.includes(player.userId));
      if (busy) {
        throw conflict("ALREADY_CHECKED_IN", {
          key: "api.alreadyCheckedIn",
          params: { name: busy.user.name },
        });
      }
      // Whoever checks in leaves the queue (an offer for this court is claimed).
      await tx.courtQueueEntry.updateMany({
        where: {
          userId: { in: playerIds },
          date: toDbDate(snap.date),
          status: { in: [QueueStatus.WAITING, QueueStatus.OFFERED] },
        },
        data: { status: QueueStatus.CLAIMED, resolvedAt: now },
      });
      return tx.courtCheckIn.create({
        data: {
          courtId: court.id,
          date: toDbDate(snap.date),
          startedAt: now,
          endsAt: new Date(now.getTime() + clubSettings().freePlay.sessionMinutes * 60_000),
          createdById: viewer.id,
          players: { create: playerIds.map((userId) => ({ userId })) },
        },
        include: checkInInclude(),
      });
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw conflict("COURT_BUSY", "api.courtBusy");
      throw error;
    });
    this.realtime.courtsNowUpdated({ date: fromCheckIn(created) });
    return toCheckInView(created);
  }

  /** A player of the check-in leaves the court (staff can end any check-in). */
  async checkOut(viewer: RequestUser, checkInId: string): Promise<void> {
    const row = await this.prisma.courtCheckIn.findUnique({
      where: { id: checkInId },
      include: { players: { select: { userId: true } } },
    });
    if (!row || row.endedAt) throw notFound("CHECK_IN_NOT_FOUND", "api.checkInNotFound");
    const staff = can(viewer, "COURTS_MANAGE");
    if (!staff && !row.players.some((player) => player.userId === viewer.id)) {
      throw forbidden("FORBIDDEN", "api.forbidden");
    }
    const now = this.clock.now();
    await this.prisma.courtCheckIn.updateMany({
      where: { id: checkInId, endedAt: null },
      data: {
        endedAt: now < row.endsAt ? now : row.endsAt,
        endedReason:
          staff && !row.players.some((p) => p.userId === viewer.id) ? "STAFF" : "CHECKOUT",
      },
    });
    await this.tick();
    this.realtime.courtsNowUpdated({ date: fromCheckIn(row) });
  }

  async joinQueue(viewer: RequestUser): Promise<QueueEntryView> {
    if (!clubSettings().freePlay.queueEnabled)
      throw conflict("QUEUE_DISABLED", "api.queueDisabled");
    const entry = await serializable(this.prisma, async (tx) => {
      const now = this.clock.now();
      const snap = await this.snapshot(tx, now);
      if (!snap.open) throw conflict("NOT_FREE_PLAY_NOW", "api.notFreePlayNow");
      if (snap.checkIns.some((row) => row.players.some((player) => player.userId === viewer.id))) {
        throw conflict("ALREADY_CHECKED_IN", {
          key: "api.alreadyCheckedIn",
          params: { name: viewer.name },
        });
      }
      const waiting = await tx.courtQueueEntry.count({
        where: { date: toDbDate(snap.date), status: QueueStatus.WAITING },
      });
      if (waiting === 0 && this.freeCourts(snap).length > 0) {
        throw conflict("COURTS_AVAILABLE", "api.courtsAvailable");
      }
      return tx.courtQueueEntry.create({
        data: { userId: viewer.id, date: toDbDate(snap.date), joinedAt: now },
      });
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw conflict("ALREADY_IN_QUEUE", "api.alreadyInQueue");
      throw error;
    });
    this.realtime.courtsNowUpdated({ date: fromCheckIn(entry) });
    const ahead = await this.prisma.courtQueueEntry.count({
      where: {
        date: entry.date,
        status: QueueStatus.WAITING,
        OR: [
          { joinedAt: { lt: entry.joinedAt } },
          { joinedAt: entry.joinedAt, id: { lt: entry.id } },
        ],
      },
    });
    return this.toQueueView(entry, ahead);
  }

  async leaveQueue(viewer: RequestUser): Promise<void> {
    const now = this.clock.now();
    const today = clubToday(now, clubTimeZone());
    const left = await this.prisma.courtQueueEntry.updateMany({
      where: {
        userId: viewer.id,
        date: toDbDate(today),
        status: { in: [QueueStatus.WAITING, QueueStatus.OFFERED] },
      },
      data: { status: QueueStatus.LEFT, resolvedAt: now },
    });
    if (left.count === 0) throw notFound("NOT_IN_QUEUE", "api.notInQueue");
    await this.tick();
    this.realtime.courtsNowUpdated({ date: today });
  }

  /**
   * Housekeeping, run by the job every minute and after each change: ends sessions past their
   * time, expires unclaimed offers and offers free courts to the first in line.
   */
  async tick(): Promise<{ autoCheckedOut: number; expired: number; offered: number }> {
    const now = this.clock.now();
    const result = await serializable(this.prisma, async (tx) => {
      const ended = await tx.courtCheckIn.findMany({
        where: { endedAt: null, endsAt: { lte: now } },
        select: { id: true, endsAt: true },
      });
      for (const row of ended) {
        await tx.courtCheckIn.update({
          where: { id: row.id },
          data: { endedAt: row.endsAt, endedReason: "AUTO" },
        });
      }
      const expired = await tx.courtQueueEntry.updateMany({
        where: { status: QueueStatus.OFFERED, offerExpiresAt: { lte: now } },
        data: { status: QueueStatus.EXPIRED, resolvedAt: now },
      });
      const offers: { userId: string; courtId: string; courtName: string; expiresAt: Date }[] = [];
      const settings = clubSettings().freePlay;
      const snap = await this.snapshot(tx, now);
      if (snap.open && settings.queueEnabled) {
        const free = this.freeCourts(snap);
        const waiting = await tx.courtQueueEntry.findMany({
          where: { date: toDbDate(snap.date), status: QueueStatus.WAITING },
          orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          take: free.length,
        });
        for (const [index, entry] of waiting.entries()) {
          const court = free[index]!;
          const expiresAt = new Date(now.getTime() + settings.claimMinutes * 60_000);
          await tx.courtQueueEntry.update({
            where: { id: entry.id },
            data: {
              status: QueueStatus.OFFERED,
              offeredCourtId: court.id,
              offeredAt: now,
              offerExpiresAt: expiresAt,
            },
          });
          offers.push({
            userId: entry.userId,
            courtId: court.id,
            courtName: court.name,
            expiresAt,
          });
        }
      }
      return { autoCheckedOut: ended.length, expired: expired.count, offers, date: snap.date };
    });
    for (const offer of result.offers) {
      await this.notifications.notify([offer.userId], "COURT_AVAILABLE", {
        courtId: offer.courtId,
        courtName: offer.courtName,
        expiresAt: offer.expiresAt.toISOString(),
      });
    }
    if (result.autoCheckedOut + result.expired + result.offers.length > 0) {
      this.realtime.courtsNowUpdated({ date: result.date });
    }
    return {
      autoCheckedOut: result.autoCheckedOut,
      expired: result.expired,
      offered: result.offers.length,
    };
  }

  /** Courts nobody uses, holds or blocks right now. */
  private freeCourts(snap: Snapshot) {
    return snap.courts.filter(
      (court) =>
        !court.closed &&
        !court.blockedBy &&
        !snap.checkIns.some((row) => row.courtId === court.id) &&
        !snap.offers.some((offer) => offer.courtId === court.id),
    );
  }

  /** Today's plan, courts with what blocks them now, active check-ins and held courts. */
  private async snapshot(db: Tx | PrismaService, now: Date): Promise<Snapshot> {
    const date = clubToday(now, clubTimeZone());
    const [plan, courts, allSlots, checkIns, offers, freezes] = await Promise.all([
      this.plans.plan(date, db),
      db.court.findMany({ where: { status: CourtStatus.ACTIVE }, orderBy: { sortOrder: "asc" } }),
      db.timeSlot.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      db.courtCheckIn.findMany({
        where: { endedAt: null, endsAt: { gt: now } },
        include: checkInInclude(),
      }),
      db.courtQueueEntry.findMany({
        where: {
          status: QueueStatus.OFFERED,
          offerExpiresAt: { gt: now },
          offeredCourtId: { not: null },
        },
        select: { id: true, userId: true, offeredCourtId: true, offerExpiresAt: true },
      }),
      freezesOverlapping(db, now, new Date(now.getTime() + 1)),
    ]);
    const slots = slotsOfDay(allSlots, plan);
    const zone = clubTimeZone();
    const first = slots[0];
    const last = slots.at(-1);
    const open =
      plan.mode === "FREE_PLAY" &&
      !plan.closed &&
      first !== undefined &&
      last !== undefined &&
      now >= slotStartsAt(date, first, zone) &&
      now < slotEndsAt(date, last, zone);
    const current = slots.find(
      (slot) => now >= slotStartsAt(date, slot, zone) && now < slotEndsAt(date, slot, zone),
    );
    const occupancies = current
      ? await db.slotOccupancy.findMany({
          where: { date: toDbDate(date), timeSlotId: current.id },
          include: { lesson: { select: { status: true } } },
        })
      : [];
    return {
      date,
      plan,
      open,
      courts: courts.map((court) => {
        const occupancy = occupancies.find((row) => row.courtId === court.id);
        const frozen = freezes.some(
          (freeze) =>
            freeze.courts.some((entry) => entry.courtId === court.id) &&
            (!current || overlapsSlot(freeze, date, current, zone)),
        );
        return {
          id: court.id,
          name: court.name,
          court: toCourtSummary(court),
          closed: plan.closedCourtIds.includes(court.id),
          blockedBy: frozen
            ? "frozen"
            : occupancy?.lesson && occupancy.lesson.status === LessonStatus.SCHEDULED
              ? "lesson"
              : occupancy?.tournamentMatchId
                ? "tournament"
                : null,
        };
      }),
      checkIns,
      offers: offers.map((offer) => ({
        id: offer.id,
        userId: offer.userId,
        courtId: offer.offeredCourtId!,
        expiresAt: offer.offerExpiresAt!,
      })),
    };
  }

  private toQueueView(
    entry: {
      id: string;
      status: QueueStatus;
      joinedAt: Date;
      offeredCourtId: string | null;
      offerExpiresAt: Date | null;
    },
    index: number,
  ): QueueEntryView {
    return {
      id: entry.id,
      status: entry.status,
      position: entry.status === QueueStatus.WAITING && index >= 0 ? index + 1 : null,
      joinedAt: entry.joinedAt.toISOString(),
      offeredCourtId: entry.offeredCourtId,
      offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? null,
    };
  }
}

function fromCheckIn(row: { date: Date }): IsoDate {
  return row.date.toISOString().slice(0, 10);
}
