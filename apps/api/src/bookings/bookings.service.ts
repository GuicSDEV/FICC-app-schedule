import { Injectable, Logger } from "@nestjs/common";
import {
  BookingCancelReason,
  BookingPlayerStatus,
  BookingStatus,
  CourtStatus,
  MatchStatus,
  Prisma,
  Role,
} from "@ficc/db";
import {
  addDays,
  type BookingDetail,
  clubToday,
  type CreateBookingInput,
  fromDbDate,
  isSlotPast,
  type MyBookingsResponse,
  slotEndsAt,
  slotStartsAt,
  toDbDate,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { conflict, forbidden, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toCourtSummary, toPlayerSummary, toSlotSummary } from "../common/mappers";
import { isUniqueViolation, serializable, type Tx } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { isCourtFrozen } from "../schedule/freezes";
import { SlotEventsService } from "../schedule/slot-events.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

/** Built per call: the player select depends on the current club. */
export function bookingInclude() {
  return {
    court: true,
    timeSlot: true,
    players: { include: { user: { select: playerSelect() } }, orderBy: { user: { name: "asc" } } },
    _count: { select: { guestPasses: { where: { status: { not: "CANCELLED" } } } } },
  } satisfies Prisma.BookingInclude;
}

export type BookingWithRelations = Prisma.BookingGetPayload<{
  include: ReturnType<typeof bookingInclude>;
}>;

export function toBookingDetail(booking: BookingWithRelations, viewerId?: string): BookingDetail {
  const date = fromDbDate(booking.date);
  // Creator first, then the others.
  const players = [...booking.players].sort(
    (a, b) => Number(b.userId === booking.createdById) - Number(a.userId === booking.createdById),
  );
  return {
    id: booking.id,
    type: booking.type,
    status: booking.status,
    date,
    court: toCourtSummary(booking.court),
    slot: toSlotSummary(booking.timeSlot),
    startsAt: slotStartsAt(date, booking.timeSlot, clubTimeZone()).toISOString(),
    endsAt: slotEndsAt(date, booking.timeSlot, clubTimeZone()).toISOString(),
    expiresAt: booking.expiresAt.toISOString(),
    createdById: booking.createdById,
    myStatus: booking.players.find((player) => player.userId === viewerId)?.status ?? null,
    players: players.map((player) => ({
      user: toPlayerSummary(player.user),
      status: player.status,
    })),
    cancelReason: booking.cancelReason,
    guestCount: booking._count.guestPasses,
  };
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly slotEvents: SlotEventsService,
  ) {}

  /**
   * Creates a PENDING booking. Every rule is checked inside one serializable transaction, and the
   * court + date + slot is claimed through SlotOccupancy, so concurrent requests cannot both win.
   */
  async create(creatorId: string, input: CreateBookingInput): Promise<BookingDetail> {
    const now = this.clock.now();
    const booking = await serializable(this.prisma, async (tx) => {
      const [court, slot] = await Promise.all([
        tx.court.findUnique({ where: { id: input.courtId } }),
        tx.timeSlot.findUnique({ where: { id: input.timeSlotId } }),
      ]);
      if (!court || court.status !== CourtStatus.ACTIVE) {
        throw notFound("COURT_NOT_FOUND", "api.courtNotFound");
      }
      if (!slot || !slot.isActive) throw notFound("SLOT_NOT_FOUND", "api.slotNotFound");
      if (isSlotPast(input.date, slot, now, clubTimeZone())) {
        throw unprocessable("SLOT_IN_PAST", "api.slotInPast");
      }
      const { bookingWindowDays } = clubSettings();
      if (input.date > addDays(clubToday(now, clubTimeZone()), bookingWindowDays - 1)) {
        throw unprocessable("BEYOND_BOOKING_WINDOW", {
          key: "api.beyondBookingWindow",
          params: { days: bookingWindowDays },
        });
      }

      const startsAt = slotStartsAt(input.date, slot, clubTimeZone());
      const frozen = await isCourtFrozen(tx, court.id, input.date, slot);
      if (frozen) {
        throw conflict("COURT_FROZEN", { key: "api.courtFrozen", params: { court: court.name } });
      }

      const playerIds = [creatorId, ...input.playerIds];
      if (input.playerIds.includes(creatorId)) {
        throw unprocessable("INVALID_PLAYERS", "api.creatorIncluded");
      }
      const players = await tx.user.findMany({
        where: { id: { in: playerIds }, role: Role.MEMBER, isActive: true },
        select: { id: true, name: true },
      });
      if (players.length !== playerIds.length) {
        throw unprocessable("INVALID_PLAYERS", "api.invalidPlayers");
      }
      const nameOf = (id: string) => players.find((player) => player.id === id)?.name ?? id;

      await this.assertPlayersFree(tx, playerIds, input.date, input.timeSlotId, nameOf);
      await this.assertBookingLimit(tx, playerIds, now, nameOf);

      const occupied = await tx.slotOccupancy.findUnique({
        where: {
          courtId_date_timeSlotId: {
            courtId: court.id,
            date: toDbDate(input.date),
            timeSlotId: slot.id,
          },
        },
      });
      if (occupied) throw this.slotTaken(occupied.lessonId !== null);

      const created = await tx.booking.create({
        data: {
          type: input.type,
          courtId: court.id,
          timeSlotId: slot.id,
          date: toDbDate(input.date),
          createdById: creatorId,
          // Pending bookings expire unless everyone confirms in time (capped at the slot start).
          expiresAt: new Date(
            Math.min(
              now.getTime() + clubSettings().bookingConfirmationMinutes * 60_000,
              startsAt.getTime(),
            ),
          ),
          players: {
            create: playerIds.map((userId) => ({
              userId,
              status:
                userId === creatorId ? BookingPlayerStatus.CONFIRMED : BookingPlayerStatus.PENDING,
              respondedAt: userId === creatorId ? now : null,
            })),
          },
        },
        include: bookingInclude(),
      });
      await tx.slotOccupancy.create({
        data: { courtId: court.id, date: created.date, timeSlotId: slot.id, bookingId: created.id },
      });
      return created;
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw this.slotTaken(false);
      throw error;
    });

    const creator = booking.players.find((player) => player.userId === creatorId)?.user.name ?? "";
    await this.notifications.notify(input.playerIds, "BOOKING_INVITE", {
      ...this.slotRef(booking),
      bookingId: booking.id,
      invitedBy: creator,
    });
    this.slotEvents.changed("booking.created", [booking]);
    return toBookingDetail(booking, creatorId);
  }

  /** The caller confirms their place; the booking is confirmed once everyone has. */
  async confirm(userId: string, bookingId: string): Promise<BookingDetail> {
    const now = this.clock.now();
    const booking = await this.loadForAnswer(userId, bookingId);
    if (booking.expiresAt <= now) {
      await this.cancel(booking.id, BookingCancelReason.EXPIRED, null);
      throw conflict("BOOKING_EXPIRED", "api.bookingExpired");
    }

    const updated = await serializable(this.prisma, async (tx) => {
      await tx.bookingPlayer.update({
        where: { bookingId_userId: { bookingId, userId } },
        data: { status: BookingPlayerStatus.CONFIRMED, respondedAt: now },
      });
      const pending = await tx.bookingPlayer.count({
        where: { bookingId, status: { not: BookingPlayerStatus.CONFIRMED } },
      });
      return tx.booking.update({
        where: { id: bookingId },
        data: pending === 0 ? { status: BookingStatus.CONFIRMED, confirmedAt: now } : {},
        include: bookingInclude(),
      });
    });

    if (updated.status === BookingStatus.CONFIRMED) {
      await this.notifications.notify(
        updated.players.map((player) => player.userId),
        "BOOKING_CONFIRMED",
        { ...this.slotRef(updated), bookingId },
      );
      this.slotEvents.changed("booking.confirmed", [updated]);
    }
    return toBookingDetail(updated, userId);
  }

  /** Any decline cancels the booking and frees the slot. */
  async decline(userId: string, bookingId: string): Promise<BookingDetail> {
    await this.loadForAnswer(userId, bookingId);
    await this.prisma.bookingPlayer.update({
      where: { bookingId_userId: { bookingId, userId } },
      data: { status: BookingPlayerStatus.DECLINED, respondedAt: this.clock.now() },
    });
    return this.cancel(bookingId, BookingCancelReason.DECLINED, userId);
  }

  /** A player of the booking cancels it before it starts. */
  async cancelByPlayer(userId: string, bookingId: string): Promise<BookingDetail> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: bookingInclude(),
    });
    if (!booking) throw notFound("BOOKING_NOT_FOUND", "api.bookingNotFound");
    if (!booking.players.some((player) => player.userId === userId)) {
      throw forbidden("NOT_A_PLAYER", "api.notBookingPlayer");
    }
    if (!ACTIVE_STATUSES.includes(booking.status)) {
      throw conflict("BOOKING_NOT_ACTIVE", "api.bookingNotActive");
    }
    if (isSlotPast(fromDbDate(booking.date), booking.timeSlot, this.clock.now(), clubTimeZone())) {
      throw unprocessable("SLOT_IN_PAST", "api.slotStartedCancel");
    }
    return this.cancel(bookingId, BookingCancelReason.CANCELLED_BY_PLAYER, userId);
  }

  /**
   * Cancels an active booking, releases its slot occupancy, tells the other players and the
   * members watching the slot. Idempotent for bookings that are already cancelled.
   */
  async cancel(
    bookingId: string,
    reason: BookingCancelReason,
    byUserId: string | null,
  ): Promise<BookingDetail> {
    const now = this.clock.now();
    const result = await serializable(this.prisma, async (tx) => {
      const changed = await tx.booking.updateMany({
        where: { id: bookingId, status: { in: ACTIVE_STATUSES } },
        data: { status: BookingStatus.CANCELLED, cancelledAt: now, cancelReason: reason },
      });
      await tx.slotOccupancy.deleteMany({ where: { bookingId } });
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: bookingInclude(),
      });
      return { booking, changed: changed.count > 0 };
    });

    if (result.changed) {
      const { booking } = result;
      const byName = byUserId
        ? (booking.players.find((player) => player.userId === byUserId)?.user.name ?? null)
        : null;
      const others = booking.players.map((player) => player.userId).filter((id) => id !== byUserId);
      await this.notifications.notify(others, "BOOKING_CANCELLED", {
        ...this.slotRef(booking),
        bookingId,
        reason,
        byName,
      });
      await this.slotEvents.released(
        "booking.cancelled",
        [booking],
        booking.players.map((player) => player.userId),
      );
    }
    return toBookingDetail(result.booking, byUserId ?? undefined);
  }

  /** Scheduled job: cancels PENDING bookings whose confirmation window has passed. */
  async expirePending(now: Date = this.clock.now()): Promise<number> {
    const expired = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, expiresAt: { lte: now } },
      select: { id: true },
    });
    for (const { id } of expired) {
      await this.cancel(id, BookingCancelReason.EXPIRED, null);
    }
    if (expired.length > 0) this.logger.log(`expired ${expired.length} pending booking(s)`);
    return expired.length;
  }

  async mine(userId: string): Promise<MyBookingsResponse> {
    const now = this.clock.now();
    const today = clubToday(now, clubTimeZone());
    const bookings = await this.prisma.booking.findMany({
      where: {
        players: { some: { userId, status: { not: BookingPlayerStatus.DECLINED } } },
        date: { gte: toDbDate(addDays(today, -14)) },
        status: { in: ACTIVE_STATUSES },
      },
      include: bookingInclude(),
      orderBy: [{ date: "asc" }, { timeSlot: { sortOrder: "asc" } }],
    });
    const details = bookings.map((booking) => toBookingDetail(booking, userId));
    const upcoming = details.filter((booking) => Date.parse(booking.endsAt) > now.getTime());
    // Bookings that already have a result (voided ones excepted) can't be reported again.
    const reported = new Set(
      (
        await this.prisma.match.findMany({
          where: {
            bookingId: { in: details.map((booking) => booking.id) },
            status: { not: MatchStatus.VOIDED },
          },
          select: { bookingId: true },
        })
      ).map((match) => match.bookingId),
    );
    return {
      upcoming,
      invites: upcoming.filter(
        (booking) => booking.status === "PENDING" && booking.myStatus === "PENDING",
      ),
      recent: details
        .filter(
          (booking) =>
            booking.status === "CONFIRMED" &&
            Date.parse(booking.endsAt) <= now.getTime() &&
            booking.date <= today &&
            !reported.has(booking.id),
        )
        .reverse(),
    };
  }

  async get(viewerId: string, viewerRole: Role, bookingId: string): Promise<BookingDetail> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: bookingInclude(),
    });
    if (!booking) throw notFound("BOOKING_NOT_FOUND", "api.bookingNotFound");
    if (
      viewerRole === Role.MEMBER &&
      !booking.players.some((player) => player.userId === viewerId)
    ) {
      throw forbidden("NOT_A_PLAYER", "api.notBookingPlayer");
    }
    return toBookingDetail(booking, viewerId);
  }

  private async loadForAnswer(userId: string, bookingId: string): Promise<BookingWithRelations> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: bookingInclude(),
    });
    if (!booking) throw notFound("BOOKING_NOT_FOUND", "api.bookingNotFound");
    const player = booking.players.find((entry) => entry.userId === userId);
    if (!player) throw forbidden("NOT_A_PLAYER", "api.notBookingPlayer");
    if (booking.status !== BookingStatus.PENDING) {
      throw conflict("BOOKING_NOT_PENDING", "api.bookingNotPending");
    }
    if (player.status !== BookingPlayerStatus.PENDING) {
      throw conflict("ALREADY_ANSWERED", "api.alreadyAnswered");
    }
    return booking;
  }

  /** No player may be in two active bookings at the same date + slot (on any court). */
  private async assertPlayersFree(
    tx: Tx,
    playerIds: string[],
    date: string,
    timeSlotId: string,
    nameOf: (id: string) => string,
  ): Promise<void> {
    const busy = await tx.bookingPlayer.findFirst({
      where: {
        userId: { in: playerIds },
        status: { not: BookingPlayerStatus.DECLINED },
        booking: { date: toDbDate(date), timeSlotId, status: { in: ACTIVE_STATUSES } },
      },
      select: { userId: true },
    });
    if (busy) {
      throw conflict("PLAYER_BUSY", {
        key: "api.playerBusy",
        params: { name: nameOf(busy.userId) },
      });
    }
  }

  /** Every player may hold at most the club's maxActiveBookings future active bookings. */
  private async assertBookingLimit(
    tx: Tx,
    playerIds: string[],
    now: Date,
    nameOf: (id: string) => string,
  ): Promise<void> {
    const rows = await tx.bookingPlayer.findMany({
      where: {
        userId: { in: playerIds },
        status: { not: BookingPlayerStatus.DECLINED },
        booking: {
          status: { in: ACTIVE_STATUSES },
          date: { gte: toDbDate(clubToday(now, clubTimeZone())) },
        },
      },
      include: { booking: { include: { timeSlot: true } } },
    });
    for (const userId of playerIds) {
      const future = rows.filter(
        (row) =>
          row.userId === userId &&
          !isSlotPast(fromDbDate(row.booking.date), row.booking.timeSlot, now, clubTimeZone()),
      );
      const max = clubSettings().maxActiveBookings;
      if (future.length >= max) {
        throw unprocessable("BOOKING_LIMIT", {
          key: "api.bookingLimit",
          params: { name: nameOf(userId), max },
        });
      }
    }
  }

  private slotTaken(byLesson: boolean) {
    return conflict(
      byLesson ? "SLOT_HAS_LESSON" : "SLOT_TAKEN",
      byLesson ? "api.slotLessonTaken" : "api.slotJustTaken",
    );
  }

  private slotRef(booking: BookingWithRelations) {
    return {
      date: fromDbDate(booking.date),
      courtId: booking.courtId,
      courtName: booking.court.name,
      timeSlotId: booking.timeSlotId,
      startTime: booking.timeSlot.startTime,
    };
  }
}
