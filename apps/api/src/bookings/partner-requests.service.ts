import { Injectable } from "@nestjs/common";
import { PartnerRequestStatus, type Prisma } from "@ficc/db";
import {
  bookingAvailability,
  type CreatePartnerRequestInput,
  fromDbDate,
  type IsoDate,
  isSlotPast,
  type PartnerRequestItem,
  slotEndTime,
  slotStartsAt,
  toDbDate,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { conflict, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { isUniqueViolation, serializable, type Tx } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";
import { DayPlanService } from "../schedule/day-plan.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";
import { BookingsService } from "./bookings.service";
import { PartnerRequestStore } from "./partner-request.store";
import { SlotHoldsService } from "./slot-holds.service";

const include = () =>
  ({ user: { select: playerSelect() }, timeSlot: true }) satisfies Prisma.PartnerRequestInclude;
type Row = Prisma.PartnerRequestGetPayload<{ include: ReturnType<typeof include> }>;

function toItem(row: Row, viewerId: string): PartnerRequestItem {
  return {
    id: row.id,
    player: toPlayerSummary(row.user),
    date: fromDbDate(row.date),
    timeSlotId: row.timeSlotId,
    startTime: row.timeSlot.startTime,
    endTime: slotEndTime(row.timeSlot),
    type: row.type,
    note: row.note,
    mine: row.userId === viewerId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * "Looking for a partner": a member with nobody to play with posts a date + slot (any free court);
 * others see it on that day and book with them, which sends the usual booking invitation. The
 * request closes by itself once the member is in a booking at that time (PartnerRequestStore).
 */
@Injectable()
export class PartnerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly plans: DayPlanService,
    private readonly bookings: BookingsService,
    private readonly holds: SlotHoldsService,
    private readonly store: PartnerRequestStore,
  ) {}

  /** Open requests for a date whose slot has not started, earliest first. */
  async list(viewerId: string, date: IsoDate): Promise<PartnerRequestItem[]> {
    const rows = await this.prisma.partnerRequest.findMany({
      where: {
        date: toDbDate(date),
        status: PartnerRequestStatus.OPEN,
        startsAt: { gt: this.clock.now() },
      },
      include: include(),
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => toItem(row, viewerId));
  }

  async create(userId: string, input: CreatePartnerRequestInput): Promise<PartnerRequestItem> {
    const now = this.clock.now();
    // Posting means the member stopped booking a court of their own: free it for the others.
    await this.holds.release(userId);
    const slot = await this.assertSlotOpen(this.prisma, input.date, input.timeSlotId, now);
    const free = await this.bookings.alternatives(input.date, input.timeSlotId, "");
    if (!free.some((option) => option.timeSlotId === input.timeSlotId)) {
      throw conflict("NO_FREE_COURT", "api.partnerRequestNoCourt");
    }
    const created = await serializable(this.prisma, async (tx) => {
      await this.bookings.assertMemberCanPlay(tx, userId, input.date, input.timeSlotId, now);
      const open = await tx.partnerRequest.findMany({
        where: { userId, status: PartnerRequestStatus.OPEN, startsAt: { gt: now } },
        select: { date: true, timeSlotId: true },
      });
      if (
        open.some(
          (row) => row.timeSlotId === input.timeSlotId && fromDbDate(row.date) === input.date,
        )
      ) {
        throw conflict("PARTNER_REQUEST_EXISTS", "api.partnerRequestExists");
      }
      const max = clubSettings().partnerRequestMaxOpen;
      if (open.length >= max) {
        throw unprocessable("PARTNER_REQUEST_LIMIT", {
          key: "api.partnerRequestLimit",
          params: { max },
        });
      }
      return tx.partnerRequest.create({
        data: {
          userId,
          date: toDbDate(input.date),
          timeSlotId: slot.id,
          type: input.type,
          note: input.note ? input.note : null,
          startsAt: slotStartsAt(input.date, slot, clubTimeZone()),
        },
        include: include(),
      });
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw conflict("PARTNER_REQUEST_EXISTS", "api.partnerRequestExists");
      }
      throw error;
    });
    this.store.announce(input.date);
    return toItem(created, userId);
  }

  /** The member withdraws their own open request. */
  async cancel(userId: string, id: string): Promise<void> {
    const row = await this.prisma.partnerRequest.findFirst({
      where: { id, userId, status: PartnerRequestStatus.OPEN },
    });
    if (!row) throw notFound("PARTNER_REQUEST_NOT_FOUND", "api.partnerRequestNotFound");
    await this.prisma.partnerRequest.update({
      where: { id },
      data: { status: PartnerRequestStatus.CANCELLED, closedAt: this.clock.now() },
    });
    this.store.announce(fromDbDate(row.date));
  }

  /** The slot exists on that day, has not started and the day takes bookings. */
  private async assertSlotOpen(
    db: Tx | PrismaService,
    date: IsoDate,
    timeSlotId: string,
    now: Date,
  ) {
    const { plan, slots } = await this.plans.slots(date, db);
    if (plan.closed) throw conflict("DAY_CLOSED", "api.dayClosed");
    if (plan.mode === "FREE_PLAY") throw conflict("FREE_PLAY_DAY", "api.freePlayDay");
    const slot = slots.find((entry) => entry.id === timeSlotId);
    if (!slot) throw notFound("SLOT_NOT_FOUND", "api.slotNotInDay");
    if (isSlotPast(date, slot, now, clubTimeZone())) {
      throw unprocessable("SLOT_IN_PAST", "api.slotInPast");
    }
    const settings = clubSettings();
    if (!bookingAvailability(date, now, settings, clubTimeZone()).inWindow) {
      throw unprocessable("BEYOND_BOOKING_WINDOW", {
        key: "api.beyondBookingWindow",
        params: { days: settings.bookingWindowDays },
      });
    }
    return slot;
  }
}
