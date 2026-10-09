import { Injectable } from "@nestjs/common";
import { BookingPlayerStatus, BookingStatus, NoShowKind } from "@ficc/db";
import {
  fromDbDate,
  type MemberNoShows,
  type NoShowInput,
  type NoShowItem,
  slotStartsAt,
} from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, notFound, unprocessable } from "../common/domain.exception";
import { isUniqueViolation } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * No-shows and late cancellations. Staff (or a co-player of the booking) mark a no-show once the
 * slot started; cancelling a confirmed booking inside the club's window records a late
 * cancellation. With the penalty enabled, N of them in the window suspend new bookings.
 */
@Injectable()
export class NoShowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  async mark(actor: RequestUser, bookingId: string, input: NoShowInput): Promise<NoShowItem> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { players: true, court: true, timeSlot: true },
    });
    if (!booking) throw notFound("BOOKING_NOT_FOUND", "api.bookingNotFound");
    const target = booking.players.find((player) => player.userId === input.userId);
    if (!target || target.status === BookingPlayerStatus.DECLINED) {
      throw unprocessable("NO_SHOW_NOT_PLAYER", "api.noShowNotPlayer");
    }
    const coPlayer = booking.players.some(
      (player) => player.userId === actor.id && player.userId !== input.userId,
    );
    if (!can(actor, "BOOKINGS_MANAGE") && !coPlayer) {
      throw forbidden("NO_SHOW_FORBIDDEN", "api.noShowForbidden");
    }
    const startsAt = slotStartsAt(fromDbDate(booking.date), booking.timeSlot, clubTimeZone());
    if (this.clock.now() < startsAt || booking.status === BookingStatus.CANCELLED) {
      throw unprocessable("NO_SHOW_TOO_EARLY", "api.noShowTooEarly");
    }
    const row = await this.prisma.noShow
      .create({
        data: {
          userId: input.userId,
          bookingId,
          kind: NoShowKind.NO_SHOW,
          markedById: actor.id,
          note: input.note ?? null,
          createdAt: this.clock.now(),
        },
        include: { markedBy: { select: { name: true } } },
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflict("NO_SHOW_EXISTS", "api.noShowAlreadyMarked");
        throw error;
      });
    await this.applyPenalty(input.userId);
    return {
      id: row.id,
      kind: row.kind,
      date: fromDbDate(booking.date),
      courtName: booking.court.name,
      startTime: booking.timeSlot.startTime,
      markedBy: row.markedBy?.name ?? null,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Called when a player cancels: records a late cancellation inside the window. */
  async recordLateCancellation(
    booking: {
      id: string;
      status: BookingStatus;
      date: Date;
      timeSlot: { startTime: string; durationMinutes: number };
    },
    userId: string,
  ): Promise<boolean> {
    if (booking.status !== BookingStatus.CONFIRMED) return false;
    const windowMinutes = clubSettings().lateCancellationMinutes;
    if (windowMinutes <= 0) return false;
    const startsAt = slotStartsAt(fromDbDate(booking.date), booking.timeSlot, clubTimeZone());
    if (startsAt.getTime() - this.clock.now().getTime() >= windowMinutes * 60_000) return false;
    await this.prisma.noShow
      .create({
        data: {
          userId,
          bookingId: booking.id,
          kind: NoShowKind.LATE_CANCEL,
          createdAt: this.clock.now(),
        },
      })
      .catch((error: unknown) => {
        if (!isUniqueViolation(error)) throw error;
      });
    await this.applyPenalty(userId);
    return true;
  }

  /** No-shows of the members in the penalty window. */
  async recentCounts(userIds: readonly string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const since = new Date(
      this.clock.now().getTime() - clubSettings().noShowPenalty.windowDays * DAY_MS,
    );
    const rows = await this.prisma.noShow.groupBy({
      by: ["userId"],
      where: { userId: { in: [...userIds] }, createdAt: { gte: since } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.userId, row._count._all]));
  }

  async history(userId: string): Promise<MemberNoShows> {
    const [rows, user, counts] = await Promise.all([
      this.prisma.noShow.findMany({
        where: { userId },
        include: {
          booking: { include: { court: true, timeSlot: true } },
          markedBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { bookingSuspendedUntil: true },
      }),
      this.recentCounts([userId]),
    ]);
    if (!user) throw notFound("MEMBER_NOT_FOUND", "api.memberNotFound");
    const now = this.clock.now();
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        date: fromDbDate(row.booking.date),
        courtName: row.booking.court.name,
        startTime: row.booking.timeSlot.startTime,
        markedBy: row.markedBy?.name ?? null,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      recent: counts.get(userId) ?? 0,
      bookingSuspendedUntil:
        user.bookingSuspendedUntil && user.bookingSuspendedUntil > now
          ? user.bookingSuspendedUntil.toISOString()
          : null,
    };
  }

  /** Suspends bookings when the (enabled) penalty threshold is reached. */
  private async applyPenalty(userId: string): Promise<void> {
    const penalty = clubSettings().noShowPenalty;
    if (!penalty.enabled) return;
    const count = (await this.recentCounts([userId])).get(userId) ?? 0;
    if (count < penalty.count) return;
    const now = this.clock.now();
    const until = new Date(now.getTime() + penalty.suspensionDays * DAY_MS);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bookingSuspendedUntil: true },
    });
    if (user?.bookingSuspendedUntil && user.bookingSuspendedUntil >= until) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { bookingSuspendedUntil: until },
    });
    await this.notifications.notify([userId], "BOOKING_SUSPENDED", {
      until: until.toISOString(),
      count,
      windowDays: penalty.windowDays,
    });
  }
}
