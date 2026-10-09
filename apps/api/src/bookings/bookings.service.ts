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
  bookingAvailability,
  clubInstant,
  clubTimeOfDay,
  clubToday,
  type CreateBookingInput,
  fromDbDate,
  isSlotPast,
  type MyBookingsResponse,
  overlapsSlot,
  type SlotAlternative,
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
import { NoShowsService } from "./no-shows.service";
import { PartnerRequestStore } from "./partner-request.store";
import { SlotHoldStore } from "./slot-hold.store";
import { DayPlanService } from "../schedule/day-plan.service";
import { freezesOverlapping, isCourtFrozen } from "../schedule/freezes";
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
    private readonly plans: DayPlanService,
    private readonly noShows: NoShowsService,
    private readonly holds: SlotHoldStore,
    private readonly partnerRequests: PartnerRequestStore,
  ) {}

  /**
   * Creates a PENDING booking. Every rule is checked inside one serializable transaction, and the
   * court + date + slot is claimed through SlotOccupancy, so concurrent requests cannot both win.
   */
  async create(creatorId: string, input: CreateBookingInput): Promise<BookingDetail> {
    const now = this.clock.now();
    // Cheap check before the transaction: in an opening rush most requests end here.
    const held = await this.prisma.slotOccupancy.findUnique({
      where: {
        courtId_date_timeSlotId: {
          courtId: input.courtId,
          date: toDbDate(input.date),
          timeSlotId: input.timeSlotId,
        },
      },
    });
    if (held && held.lessonId === null) {
      throw this.slotTaken(
        false,
        await this.alternatives(input.date, input.timeSlotId, input.courtId),
      );
    }
    const slotKey = { courtId: input.courtId, date: input.date, timeSlotId: input.timeSlotId };
    // Hand the court over if its holder's time ran out, before checking who may book it.
    await this.holds.settleAndAnnounce(slotKey);
    const booking = await serializable(this.prisma, async (tx) => {
      const { court, slot, startsAt } = await this.assertBookable(tx, input, now);
      await this.holds.assertNotHeldByOther(tx, creatorId, slotKey, now);

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

      await this.assertNotSuspended(tx, creatorId, playerIds, now, nameOf);
      await this.assertPlayersFree(tx, playerIds, input.date, input.timeSlotId, nameOf);
      await this.assertBookingLimit(tx, playerIds, now, nameOf);
      await this.assertDailyLimit(tx, playerIds, input.date, nameOf);

      const occupied = await tx.slotOccupancy.findUnique({
        where: {
          courtId_date_timeSlotId: {
            courtId: court.id,
            date: toDbDate(input.date),
            timeSlotId: slot.id,
          },
        },
      });
      if (occupied) {
        if (occupied.lessonId !== null) throw this.slotTaken(true);
        throw this.slotTaken(false);
      }

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
    }).catch(async (error: unknown) => {
      const taken =
        isUniqueViolation(error) ||
        (error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "SLOT_TAKEN");
      if (!taken) throw error;
      // Someone got there first: answer with the next free options right away.
      throw this.slotTaken(
        false,
        await this.alternatives(input.date, input.timeSlotId, input.courtId),
      );
    });

    const creator = booking.players.find((player) => player.userId === creatorId)?.user.name ?? "";
    await this.notifications.notify(input.playerIds, "BOOKING_INVITE", {
      ...this.slotRef(booking),
      bookingId: booking.id,
      invitedBy: creator,
    });
    this.slotEvents.changed("booking.created", [booking]);
    // Members who were looking for a partner at this time found one.
    await this.partnerRequests.closeMatched(
      booking.players.map((player) => player.userId),
      input.date,
      input.timeSlotId,
      booking.id,
    );
    // Whoever was waiting for this court is told right away, with other free options.
    await this.holds.clearBooked(
      slotKey,
      creatorId,
      await this.alternatives(input.date, input.timeSlotId, input.courtId),
    );
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
    const detail = await this.cancel(bookingId, BookingCancelReason.CANCELLED_BY_PLAYER, userId);
    // Inside the club's window this counts as a late cancellation (after the slot is freed).
    await this.noShows.recordLateCancellation(booking, userId);
    return detail;
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

  /**
   * The court + date + slot exists and can be booked now: active court and slot, not started, in
   * the day's plan (not a free-play day), inside the booking window and already open, not frozen.
   */
  async assertBookable(
    tx: Tx,
    input: { courtId: string; timeSlotId: string; date: string },
    now: Date,
  ) {
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
    const settings = clubSettings();
    const plan = await this.plans.plan(input.date, tx);
    this.plans.assertSlotInPlan(plan, slot, court);
    if (plan.mode === "FREE_PLAY") throw conflict("FREE_PLAY_DAY", "api.freePlayDay");
    // The server's clock decides when a day opens; the phone's clock is never trusted.
    const availability = bookingAvailability(input.date, now, settings, clubTimeZone());
    if (!availability.inWindow) {
      throw unprocessable("BEYOND_BOOKING_WINDOW", {
        key: "api.beyondBookingWindow",
        params: { days: settings.bookingWindowDays },
      });
    }
    if (!availability.open && availability.opensAt) {
      const opensAt = availability.opensAt;
      const day = clubToday(opensAt, clubTimeZone());
      const when = `${day === clubToday(now, clubTimeZone()) ? "hoje" : `em ${day.slice(8, 10)}/${day.slice(5, 7)}`} às ${clubTimeOfDay(opensAt, clubTimeZone())}`;
      throw unprocessable(
        "BOOKING_NOT_OPEN_YET",
        { key: "api.bookingNotOpenYet", params: { when } },
        { opensAt: opensAt.toISOString(), serverNow: now.toISOString() },
      );
    }

    const startsAt = slotStartsAt(input.date, slot, clubTimeZone());
    const frozen = await isCourtFrozen(tx, court.id, input.date, slot);
    if (frozen) {
      throw conflict("COURT_FROZEN", { key: "api.courtFrozen", params: { court: court.name } });
    }

    return { court, slot, startsAt };
  }

  /**
   * A member may start booking this slot (tapping it keeps it for them): the slot is bookable and
   * free, and they could book it themselves (not suspended, not busy at that time, under limits).
   */
  async assertCanStart(
    tx: Tx,
    userId: string,
    input: { courtId: string; timeSlotId: string; date: string },
    now: Date,
  ): Promise<void> {
    await this.assertBookable(tx, input, now);
    const occupied = await tx.slotOccupancy.findUnique({
      where: {
        courtId_date_timeSlotId: {
          courtId: input.courtId,
          date: toDbDate(input.date),
          timeSlotId: input.timeSlotId,
        },
      },
    });
    if (occupied) {
      throw this.slotTaken(
        occupied.lessonId !== null,
        occupied.lessonId !== null
          ? undefined
          : await this.alternatives(input.date, input.timeSlotId, input.courtId),
      );
    }
    await this.assertMemberCanPlay(tx, userId, input.date, input.timeSlotId, now);
  }

  /**
   * The member could play at this date + slot: not suspended, not in another booking then, under
   * the active and daily booking limits.
   */
  async assertMemberCanPlay(
    tx: Tx,
    userId: string,
    date: string,
    timeSlotId: string,
    now: Date,
  ): Promise<void> {
    const me = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
    const nameOf = () => me?.name ?? "";
    await this.assertNotSuspended(tx, userId, [userId], now, nameOf);
    await this.assertPlayersFree(tx, [userId], date, timeSlotId, nameOf);
    await this.assertBookingLimit(tx, [userId], now, nameOf);
    await this.assertDailyLimit(tx, [userId], date, nameOf);
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

  private slotTaken(byLesson: boolean, alternatives?: SlotAlternative[]) {
    return conflict(
      byLesson ? "SLOT_HAS_LESSON" : "SLOT_TAKEN",
      byLesson ? "api.slotLessonTaken" : "api.slotJustTaken",
      alternatives ? { alternatives } : undefined,
    );
  }

  /**
   * Up to four free options after a slot was just taken: the same time on other courts first,
   * then later times of the day on any court.
   */
  async alternatives(
    date: string,
    timeSlotId: string,
    courtId: string,
  ): Promise<SlotAlternative[]> {
    const now = this.clock.now();
    const { plan, slots } = await this.plans.slots(date);
    if (plan.closed || plan.mode !== "BOOKING") return [];
    const [courts, occupied, freezes] = await Promise.all([
      this.prisma.court.findMany({
        where: { status: CourtStatus.ACTIVE },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.slotOccupancy.findMany({ where: { date: toDbDate(date) } }),
      freezesOverlapping(
        this.prisma,
        clubInstant(date, "00:00", clubTimeZone()),
        clubInstant(addDays(date, 1), "00:00", clubTimeZone()),
      ),
    ]);
    const taken = new Set(occupied.map((row) => `${row.courtId}:${row.timeSlotId}`));
    // Courts other members are booking right now are not offered either.
    for (const cell of await this.holds.heldCells(date, now)) taken.add(cell);
    const wanted = slots.find((slot) => slot.id === timeSlotId);
    const ordered = [
      ...(wanted ? [wanted] : []),
      ...slots.filter(
        (slot) => slot.id !== timeSlotId && (!wanted || slot.sortOrder > wanted.sortOrder),
      ),
    ];
    const options: SlotAlternative[] = [];
    for (const slot of ordered) {
      if (isSlotPast(date, slot, now, clubTimeZone())) continue;
      for (const court of courts) {
        if (court.id === courtId && slot.id === timeSlotId) continue;
        if (plan.closedCourtIds.includes(court.id) || taken.has(`${court.id}:${slot.id}`)) continue;
        const frozen = freezes.some(
          (freeze) =>
            freeze.courts.some((entry) => entry.courtId === court.id) &&
            overlapsSlot(freeze, date, slot, clubTimeZone()),
        );
        if (frozen) continue;
        options.push({
          courtId: court.id,
          courtName: court.name,
          timeSlotId: slot.id,
          startTime: slot.startTime,
        });
        if (options.length >= 4) return options;
      }
    }
    return options;
  }

  /** Members suspended by the no-show penalty cannot book (nor be booked). */
  private async assertNotSuspended(
    tx: Tx,
    creatorId: string,
    playerIds: string[],
    now: Date,
    nameOf: (id: string) => string,
  ): Promise<void> {
    const suspended = await tx.user.findMany({
      where: { id: { in: playerIds }, bookingSuspendedUntil: { gt: now } },
      select: { id: true, bookingSuspendedUntil: true },
    });
    const own = suspended.find((user) => user.id === creatorId);
    if (own) {
      const until = own.bookingSuspendedUntil!;
      throw forbidden("BOOKING_SUSPENDED", {
        key: "api.bookingSuspended",
        params: {
          until: `${clubToday(until, clubTimeZone()).split("-").reverse().slice(0, 2).join("/")} ${clubTimeOfDay(until, clubTimeZone())}`,
        },
      });
    }
    if (suspended[0]) {
      throw forbidden("BOOKING_SUSPENDED", {
        key: "api.bookingSuspendedPlayer",
        params: { name: nameOf(suspended[0].id) },
      });
    }
  }

  /** At most the club's maxBookingsPerDay active bookings per player on one date. */
  private async assertDailyLimit(
    tx: Tx,
    playerIds: string[],
    date: string,
    nameOf: (id: string) => string,
  ): Promise<void> {
    const max = clubSettings().maxBookingsPerDay;
    const rows = await tx.bookingPlayer.groupBy({
      by: ["userId"],
      where: {
        userId: { in: playerIds },
        status: { not: BookingPlayerStatus.DECLINED },
        booking: { date: toDbDate(date), status: { in: ACTIVE_STATUSES } },
      },
      _count: { _all: true },
    });
    const over = rows.find((row) => row._count._all >= max);
    if (over) {
      throw unprocessable("MAX_BOOKINGS_PER_DAY", {
        key: "api.maxBookingsPerDay",
        params: { name: nameOf(over.userId), max },
      });
    }
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
