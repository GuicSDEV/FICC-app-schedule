import { Controller, Get, Query } from "@nestjs/common";
import {
  clubToday,
  type CourtsResponse,
  type ScheduleDay,
  type ScheduleQuery,
  scheduleQuerySchema,
} from "@ficc/shared";

import { can, CurrentUser, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { toCourtSummary, toSlotSummary } from "../common/mappers";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleService } from "./schedule.service";
import { clubTimeZone } from "../tenancy/tenant-context";

@Controller()
export class ScheduleController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Courts × slots grid for a date, every cell with its state. */
  @Get("schedule")
  getSchedule(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(scheduleQuerySchema)) query: ScheduleQuery,
  ): Promise<ScheduleDay> {
    return this.schedule.getDay(query.date, {
      surface: query.surface,
      viewerId: user.id,
      lessonDetailsFor: can(user, "LESSONS_MANAGE") ? "all" : user.coachId ? [user.coachId] : [],
    });
  }

  /** Static club layout: courts, the slot grid and today's club date. */
  @Get("courts")
  async courts(): Promise<CourtsResponse> {
    const [courts, slots] = await Promise.all([
      this.prisma.court.findMany({ where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } }),
      this.prisma.timeSlot.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    return {
      courts: courts.map(toCourtSummary),
      slots: slots.map(toSlotSummary),
      today: clubToday(this.clock.now(), clubTimeZone()),
    };
  }
}
