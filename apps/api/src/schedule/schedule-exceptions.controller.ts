import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from "@nestjs/common";
import { Prisma, Role } from "@ficc/db";
import {
  exceptionRangeQuerySchema,
  type IsoDate,
  type ScheduleExceptionInput,
  type ScheduleExceptionItem,
  scheduleExceptionSchema,
  toDbDate,
} from "@ficc/shared";
import { z } from "zod";

import {
  CurrentUser,
  RequirePermissions,
  type RequestUser,
  Roles,
} from "../common/auth.decorators";
import { notFound, unprocessable } from "../common/domain.exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { toDateException } from "./day-plan.service";
import { assertNoOverlap } from "./grid-validation";
import { SlotEventsService } from "./slot-events.service";

/** Date exceptions: holidays, events and courts closed for a day. Everyone reads, staff edit. */
@Controller("schedule-exceptions")
export class ScheduleExceptionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotEvents: SlotEventsService,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(exceptionRangeQuerySchema))
    query: z.infer<typeof exceptionRangeQuerySchema>,
  ): Promise<ScheduleExceptionItem[]> {
    const rows = await this.prisma.scheduleException.findMany({
      where: { date: { gte: toDbDate(query.from), lte: toDbDate(query.to) } },
      orderBy: { date: "asc" },
    });
    return rows.map(toDateException);
  }

  /** Creates or replaces the exception of a date. */
  @Put()
  @Roles(Role.ADMIN)
  @RequirePermissions("COURTS_MANAGE")
  async upsert(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(scheduleExceptionSchema)) body: ScheduleExceptionInput,
  ): Promise<ScheduleExceptionItem> {
    if (body.slotTimes) {
      const known = await this.prisma.timeSlot.findMany({
        where: { startTime: { in: body.slotTimes } },
        select: { startTime: true, durationMinutes: true },
      });
      const missing = body.slotTimes.find((time) => !known.some((slot) => slot.startTime === time));
      if (missing) {
        throw unprocessable("GRID_SLOT_UNKNOWN", {
          key: "api.gridSlotUnknown",
          params: { time: missing },
        });
      }
      assertNoOverlap(known);
    }
    const data = {
      closed: body.closed,
      slotTimes: body.slotTimes ?? Prisma.DbNull,
      mode: body.mode,
      closedCourtIds: body.closedCourtIds,
      note: body.note,
    };
    const existing = await this.prisma.scheduleException.findFirst({
      where: { date: toDbDate(body.date) },
    });
    const row = existing
      ? await this.prisma.scheduleException.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.scheduleException.create({
          data: { ...data, date: toDbDate(body.date), createdById: user.id },
        });
    this.slotEvents.datesChanged("plan.changed", [body.date as IsoDate]);
    return toDateException(row);
  }

  @Delete(":id")
  @HttpCode(204)
  @Roles(Role.ADMIN)
  @RequirePermissions("COURTS_MANAGE")
  async remove(@Param("id") id: string): Promise<void> {
    const row = await this.prisma.scheduleException.findUnique({ where: { id } });
    if (!row) throw notFound("EXCEPTION_NOT_FOUND", "api.exceptionNotFound");
    await this.prisma.scheduleException.delete({ where: { id } });
    this.slotEvents.datesChanged("plan.changed", [toDateException(row).date]);
  }
}
