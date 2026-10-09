import { Injectable, Logger } from "@nestjs/common";
import { BookingCancelReason, BookingStatus, LessonStatus, Prisma } from "@ficc/db";
import {
  type ActiveFreeze,
  addDays,
  type CancelAffectedInput,
  clubToday,
  type CreateFreezeInput,
  dateRange,
  type FreezeDetail,
  type FreezeSummary,
  fromDbDate,
  overlapsSlot,
  toDbDate,
} from "@ficc/shared";

import { BookingsService } from "../bookings/bookings.service";
import type { RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toCoachSummary } from "../common/mappers";
import { LessonsService } from "../lessons/lessons.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { freezeWithCourts, type FreezeWithCourts } from "../schedule/freezes";
import { SlotEventsService } from "../schedule/slot-events.service";

const freezeDetailInclude = {
  ...freezeWithCourts,
  courts: { select: { courtId: true, court: { select: { name: true, sortOrder: true } } } },
  createdBy: { select: { name: true } },
} satisfies Prisma.CourtFreezeInclude;

type FreezeRecord = Prisma.CourtFreezeGetPayload<{ include: typeof freezeDetailInclude }>;

/** Open-ended freezes are checked against this many days of bookings and lessons. */
const OPEN_ENDED_HORIZON_DAYS = 56;

/** Rain / maintenance: freezing courts, listing what it hits, bulk cancelling and lifting. */
@Injectable()
export class FreezesService {
  private readonly logger = new Logger(FreezesService.name);
  /** Ids of freezes that were active at the last expiry check. */
  private activeAtLastCheck = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly slotEvents: SlotEventsService,
    private readonly bookings: BookingsService,
    private readonly lessons: LessonsService,
  ) {}

  async create(actor: RequestUser, input: CreateFreezeInput): Promise<FreezeDetail> {
    const courts = await this.prisma.court.findMany({
      where:
        input.target.scope === "COURT"
          ? { id: input.target.courtId }
          : input.target.scope === "SURFACE"
            ? { surface: input.target.surface, status: "ACTIVE" }
            : { status: "ACTIVE" },
    });
    if (courts.length === 0) throw notFound("COURT_NOT_FOUND", "Nenhuma quadra encontrada.");

    const freeze = await this.prisma.courtFreeze.create({
      data: {
        reason: input.reason,
        scope: input.target.scope,
        surface: input.target.scope === "SURFACE" ? input.target.surface : null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        note: input.note ?? null,
        createdById: actor.id,
        courts: { create: courts.map((court) => ({ courtId: court.id })) },
      },
      include: freezeDetailInclude,
    });

    const detail = await this.toDetail(freeze);
    await this.notifications.notify(await this.impactedUserIds(detail), "COURT_FROZEN", {
      freezeId: freeze.id,
      reason: freeze.reason,
      courtNames: detail.courtNames,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
    });
    this.broadcast(freeze, "created");
    return detail;
  }

  /** Freezes that are active now or start later; lifted and expired ones are left out. */
  async list(): Promise<FreezeDetail[]> {
    const now = this.clock.now();
    const freezes = await this.prisma.courtFreeze.findMany({
      where: { liftedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      include: freezeDetailInclude,
      orderBy: { startsAt: "asc" },
    });
    return Promise.all(freezes.map((freeze) => this.toDetail(freeze)));
  }

  async get(freezeId: string): Promise<FreezeDetail> {
    return this.toDetail(await this.load(freezeId));
  }

  /** For the global banner: active freezes and those starting within 24 hours. */
  async active(): Promise<ActiveFreeze[]> {
    const now = this.clock.now();
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const freezes = await this.prisma.courtFreeze.findMany({
      where: {
        liftedAt: null,
        startsAt: { lte: soon },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: freezeDetailInclude,
      orderBy: { startsAt: "asc" },
    });
    return freezes.map((freeze) => ({
      ...this.toSummary(freeze),
      courtNames: this.courtNames(freeze),
      active: freeze.startsAt <= now,
    }));
  }

  /** Cancels the selected bookings and lessons hit by this freeze. */
  async cancelAffected(
    actor: RequestUser,
    freezeId: string,
    input: CancelAffectedInput,
  ): Promise<FreezeDetail> {
    const detail = await this.get(freezeId);
    const bookingIds = new Set(detail.affected.bookings.map((booking) => booking.id));
    const lessonIds = new Set(detail.affected.lessons.map((lesson) => lesson.id));
    const unknown = [
      ...input.bookingIds.filter((id) => !bookingIds.has(id)),
      ...input.lessonIds.filter((id) => !lessonIds.has(id)),
    ];
    if (unknown.length > 0) {
      throw unprocessable("NOT_AFFECTED", "Algum item não é afetado por essa interdição.", unknown);
    }
    for (const bookingId of input.bookingIds) {
      await this.bookings.cancel(bookingId, BookingCancelReason.COURT_FROZEN, null);
    }
    for (const lessonId of input.lessonIds) {
      await this.lessons.cancel(actor, lessonId, "THIS");
    }
    return this.get(freezeId);
  }

  async lift(actor: RequestUser, freezeId: string): Promise<FreezeDetail> {
    const freeze = await this.load(freezeId);
    if (freeze.liftedAt) throw conflict("FREEZE_LIFTED", "Essa interdição já foi encerrada.");
    const lifted = await this.prisma.courtFreeze.update({
      where: { id: freezeId },
      data: { liftedAt: this.clock.now(), liftedById: actor.id },
      include: freezeDetailInclude,
    });
    const detail = await this.toDetail(freeze);
    await this.notifications.notify(await this.impactedUserIds(detail), "COURT_UNFROZEN", {
      freezeId,
      courtNames: detail.courtNames,
    });
    this.broadcast(lifted, "lifted");
    return this.toDetail(lifted);
  }

  /** Job: announces freezes that ended on their own so banners and calendars update. */
  async announceExpired(now: Date = this.clock.now()): Promise<number> {
    const active = await this.prisma.courtFreeze.findMany({
      where: {
        liftedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true },
    });
    const activeIds = new Set(active.map((freeze) => freeze.id));
    const ended = [...this.activeAtLastCheck].filter((id) => !activeIds.has(id));
    this.activeAtLastCheck = activeIds;
    for (const id of ended) {
      const freeze = await this.prisma.courtFreeze.findUnique({
        where: { id },
        include: freezeDetailInclude,
      });
      if (freeze && !freeze.liftedAt) this.broadcast(freeze, "expired");
    }
    if (ended.length > 0) this.logger.log(`${ended.length} freeze(s) ended`);
    return ended.length;
  }

  private async load(freezeId: string): Promise<FreezeRecord> {
    const freeze = await this.prisma.courtFreeze.findUnique({
      where: { id: freezeId },
      include: freezeDetailInclude,
    });
    if (!freeze) throw notFound("FREEZE_NOT_FOUND", "Interdição não encontrada.");
    return freeze;
  }

  private toSummary(freeze: FreezeWithCourts): FreezeSummary {
    return {
      id: freeze.id,
      reason: freeze.reason,
      scope: freeze.scope,
      surface: freeze.surface,
      startsAt: freeze.startsAt.toISOString(),
      endsAt: freeze.endsAt?.toISOString() ?? null,
      note: freeze.note,
      courtIds: freeze.courts.map((entry) => entry.courtId),
    };
  }

  private courtNames(freeze: FreezeRecord): string[] {
    return [...freeze.courts]
      .sort((a, b) => a.court.sortOrder - b.court.sortOrder)
      .map((entry) => entry.court.name);
  }

  /** Club dates the freeze window touches (open-ended windows use an 8-week horizon). */
  private windowDates(freeze: FreezeWithCourts): string[] {
    const from = clubToday(freeze.startsAt);
    const to = freeze.endsAt
      ? clubToday(new Date(freeze.endsAt.getTime() - 1))
      : addDays(
          clubToday(this.clock.now()) > from ? clubToday(this.clock.now()) : from,
          OPEN_ENDED_HORIZON_DAYS,
        );
    return dateRange(from, to);
  }

  private async toDetail(freeze: FreezeRecord): Promise<FreezeDetail> {
    const dates = this.windowDates(freeze).map(toDbDate);
    const courtIds = freeze.courts.map((entry) => entry.courtId);
    const [bookings, lessons] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          courtId: { in: courtIds },
          date: { in: dates },
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        },
        include: {
          court: true,
          timeSlot: true,
          players: { include: { user: { select: playerSelect } } },
        },
        orderBy: [{ date: "asc" }, { timeSlot: { sortOrder: "asc" } }],
      }),
      this.prisma.lesson.findMany({
        where: { courtId: { in: courtIds }, date: { in: dates }, status: LessonStatus.SCHEDULED },
        include: { court: true, timeSlot: true, coach: true },
        orderBy: [{ date: "asc" }, { timeSlot: { sortOrder: "asc" } }],
      }),
    ]);
    const hits = (entry: {
      date: Date;
      timeSlot: { startTime: string; durationMinutes: number };
    }) => overlapsSlot(freeze, fromDbDate(entry.date), entry.timeSlot);

    return {
      ...this.toSummary(freeze),
      courtNames: this.courtNames(freeze),
      liftedAt: freeze.liftedAt?.toISOString() ?? null,
      createdBy: freeze.createdBy.name,
      affected: {
        bookings: bookings.filter(hits).map((booking) => ({
          id: booking.id,
          status: booking.status,
          date: fromDbDate(booking.date),
          courtName: booking.court.name,
          startTime: booking.timeSlot.startTime,
          playerNames: booking.players.map((player) => player.user.name),
        })),
        lessons: lessons.filter(hits).map((lesson) => ({
          id: lesson.id,
          date: fromDbDate(lesson.date),
          courtName: lesson.court.name,
          startTime: lesson.timeSlot.startTime,
          coach: toCoachSummary(lesson.coach),
        })),
      },
    };
  }

  /** Players of affected bookings and coaches of affected lessons. */
  private async impactedUserIds(detail: FreezeDetail): Promise<string[]> {
    const [players, coaches] = await Promise.all([
      this.prisma.bookingPlayer.findMany({
        where: { bookingId: { in: detail.affected.bookings.map((booking) => booking.id) } },
        select: { userId: true },
      }),
      this.prisma.coach.findMany({
        where: { id: { in: detail.affected.lessons.map((lesson) => lesson.coach.id) } },
        select: { userId: true },
      }),
    ]);
    return [
      ...new Set([
        ...players.map((entry) => entry.userId),
        ...coaches.map((entry) => entry.userId),
      ]),
    ];
  }

  private broadcast(freeze: FreezeWithCourts, action: "created" | "lifted" | "expired"): void {
    this.realtime.freezeUpdated({ freezeId: freeze.id, action });
    this.slotEvents.datesChanged(
      "freeze.changed",
      this.windowDates(freeze).slice(0, OPEN_ENDED_HORIZON_DAYS),
    );
  }
}
