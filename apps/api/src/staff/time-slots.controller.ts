import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type AdminTimeSlotItem,
  clubToday,
  type CreateTimeSlotInput,
  createTimeSlotSchema,
  type TimeSlotActiveInput,
  timeSlotActiveSchema,
  toDbDate,
} from "@ficc/shared";

import { RequirePermissions, Roles } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, notFound } from "../common/domain.exception";
import { toSlotSummary } from "../common/mappers";
import { serializable, type Tx } from "../common/transactions";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { assertGridsValid } from "../schedule/grid-validation";
import { SlotEventsService } from "../schedule/slot-events.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

const toItem = (slot: {
  id: string;
  startTime: string;
  durationMinutes: number;
  sortOrder: number;
  isActive: boolean;
}): AdminTimeSlotItem => ({ ...toSlotSummary(slot), isActive: slot.isActive });

/**
 * The club's slot catalogue: the start times each weekday grid (ClubSettings) and date exception
 * pick from. Slots are never deleted (bookings, lessons and history point at them): an unused one
 * is retired instead.
 */
@Controller("admin/time-slots")
@Roles(Role.ADMIN)
@RequirePermissions("SETTINGS_MANAGE")
export class TimeSlotsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly slotEvents: SlotEventsService,
  ) {}

  @Get()
  async list(): Promise<AdminTimeSlotItem[]> {
    const slots = await this.prisma.timeSlot.findMany({ orderBy: { startTime: "asc" } });
    return slots.map(toItem);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createTimeSlotSchema)) body: CreateTimeSlotInput,
  ): Promise<AdminTimeSlotItem> {
    const created = await serializable(this.prisma, async (tx) => {
      const existing = await tx.timeSlot.findFirst({ where: { startTime: body.startTime } });
      if (existing) {
        throw conflict("TIME_SLOT_EXISTS", {
          key: "api.timeSlotExists",
          params: { time: body.startTime },
        });
      }
      const active = await tx.timeSlot.findMany({ where: { isActive: true } });
      assertGridsValid(clubSettings().scheduleGrids, [...active, body]);
      const slot = await tx.timeSlot.create({
        data: { startTime: body.startTime, durationMinutes: body.durationMinutes, sortOrder: 0 },
      });
      return this.renumber(tx, slot.id);
    });
    this.slotEvents.datesChanged("plan.changed", []);
    return toItem(created);
  }

  @Patch(":id")
  async setActive(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(timeSlotActiveSchema)) body: TimeSlotActiveInput,
  ): Promise<AdminTimeSlotItem> {
    const updated = await serializable(this.prisma, async (tx) => {
      const slot = await tx.timeSlot.findFirst({ where: { id } });
      if (!slot) throw notFound("TIME_SLOT_NOT_FOUND", "api.notFound");
      if (slot.isActive === body.isActive) return slot;
      if (body.isActive) {
        const active = await tx.timeSlot.findMany({ where: { isActive: true } });
        assertGridsValid(clubSettings().scheduleGrids, [...active, slot]);
      } else {
        await this.assertUnused(tx, slot.id, slot.startTime);
      }
      return tx.timeSlot.update({ where: { id }, data: { isActive: body.isActive } });
    });
    this.slotEvents.datesChanged("plan.changed", []);
    return toItem(updated);
  }

  /** A slot in a grid, a future exception, a future booking or lesson, or a running series stays. */
  private async assertUnused(tx: Tx, slotId: string, startTime: string): Promise<void> {
    const today = toDbDate(clubToday(this.clock.now(), clubTimeZone()));
    const inGrid = Object.values(clubSettings().scheduleGrids).some((times) =>
      times?.includes(startTime),
    );
    const [occupied, series, exceptions] = await Promise.all([
      tx.slotOccupancy.count({ where: { timeSlotId: slotId, date: { gte: today } } }),
      tx.lessonSeries.count({
        where: { timeSlotId: slotId, OR: [{ endDate: null }, { endDate: { gte: today } }] },
      }),
      tx.scheduleException.findMany({
        where: { date: { gte: today } },
        select: { slotTimes: true },
      }),
    ]);
    const inException = exceptions.some(
      (entry) => Array.isArray(entry.slotTimes) && entry.slotTimes.includes(startTime),
    );
    if (inGrid || occupied > 0 || series > 0 || inException) {
      throw conflict("TIME_SLOT_IN_USE", "api.timeSlotInUse");
    }
  }

  /** Display order follows the start time. */
  private async renumber(tx: Tx, createdId: string) {
    const all = await tx.timeSlot.findMany({ orderBy: { startTime: "asc" } });
    await Promise.all(
      all.map((slot, index) =>
        slot.sortOrder === index + 1
          ? Promise.resolve()
          : tx.timeSlot.update({ where: { id: slot.id }, data: { sortOrder: index + 1 } }),
      ),
    );
    return {
      ...all.find((slot) => slot.id === createdId)!,
      sortOrder: all.findIndex((slot) => slot.id === createdId) + 1,
    };
  }
}
