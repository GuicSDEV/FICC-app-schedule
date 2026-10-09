import { Injectable } from "@nestjs/common";
import type { Prisma, ScheduleException } from "@ficc/db";
import {
  bookingAvailability,
  type CourtMode,
  type DateException,
  dayPlan,
  type DayPlan,
  type DayPlanInfo,
  fromDbDate,
  type IsoDate,
  isSlotInPlan,
  slotsOfDay,
  toDbDate,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { conflict, unprocessable } from "../common/domain.exception";
import type { Tx } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

type Db = Tx | PrismaService;

export function toDateException(row: ScheduleException): DateException & { id: string } {
  const times = Array.isArray(row.slotTimes)
    ? (row.slotTimes as Prisma.JsonArray).filter(
        (value): value is string => typeof value === "string",
      )
    : null;
  return {
    id: row.id,
    date: fromDbDate(row.date),
    closed: row.closed,
    slotTimes: times,
    mode: (row.mode as CourtMode | null) ?? null,
    closedCourtIds: row.closedCourtIds,
    note: row.note,
  };
}

/**
 * How each club date works: the weekday grid and court mode from ClubSettings, overridden by the
 * date's exception (holiday, event, closed courts). Every place that lists or takes slots asks here.
 */
@Injectable()
export class DayPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async plan(date: IsoDate, db: Db = this.prisma): Promise<DayPlan> {
    const row = await db.scheduleException.findFirst({ where: { date: toDbDate(date) } });
    return dayPlan(date, clubSettings(), row ? toDateException(row) : null);
  }

  /** Plans of every date in [from, to] with one query. */
  async plans(dates: readonly IsoDate[], db: Db = this.prisma): Promise<Map<IsoDate, DayPlan>> {
    const rows = await db.scheduleException.findMany({
      where: { date: { in: dates.map(toDbDate) } },
    });
    const byDate = new Map(rows.map((row) => [fromDbDate(row.date), toDateException(row)]));
    return new Map(dates.map((date) => [date, dayPlan(date, clubSettings(), byDate.get(date))]));
  }

  /** The club's active slots that exist on `date`. */
  async slots(date: IsoDate, db: Db = this.prisma) {
    const [plan, slots] = await Promise.all([
      this.plan(date, db),
      db.timeSlot.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    return { plan, slots: slotsOfDay(slots, plan) };
  }

  /** What the calendar shows about a day: mode, closures and when bookings open. */
  info(plan: DayPlan): DayPlanInfo {
    const now = this.clock.now();
    const availability = bookingAvailability(plan.date, now, clubSettings(), clubTimeZone());
    return {
      mode: plan.mode,
      closed: plan.closed,
      closedCourtIds: plan.closedCourtIds,
      note: plan.note,
      bookingOpen: availability.open && plan.mode === "BOOKING" && !plan.closed,
      inWindow: availability.inWindow,
      opensAt: availability.opensAt?.toISOString() ?? null,
      serverNow: now.toISOString(),
    };
  }

  /** Throws when the slot does not exist that day or its court is closed. */
  assertSlotInPlan(
    plan: DayPlan,
    slot: { startTime: string },
    court: { id: string; name: string },
  ): void {
    if (plan.closed) throw conflict("DAY_CLOSED", "api.dayClosed");
    if (plan.closedCourtIds.includes(court.id)) {
      throw conflict("COURT_CLOSED_TODAY", {
        key: "api.courtClosedToday",
        params: { court: court.name },
      });
    }
    if (!isSlotInPlan(plan, slot.startTime)) {
      throw unprocessable("SLOT_NOT_IN_GRID", "api.slotNotInGrid");
    }
  }
}
