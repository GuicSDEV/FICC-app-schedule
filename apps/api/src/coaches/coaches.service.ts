import { Injectable } from "@nestjs/common";
import { LessonStatus } from "@ficc/db";
import {
  addDays,
  clubToday,
  type CoachProfile,
  fromDbDate,
  isSlotPast,
  toDbDate,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { notFound } from "../common/domain.exception";
import { toCoachSummary, toCourtSummary, toSlotSummary } from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { clubTimeZone } from "../tenancy/tenant-context";

const UPCOMING_LIMIT = 6;

@Injectable()
export class CoachesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Public profile of an active coach, shown when a member taps a lesson. */
  async profile(id: string): Promise<CoachProfile> {
    const now = this.clock.now();
    const today = clubToday(now, clubTimeZone());
    const coach = await this.prisma.coach.findFirst({
      where: { id, isActive: true },
      include: { allowedCourts: { include: { court: true } } },
    });
    if (!coach) throw notFound("COACH_NOT_FOUND", "api.coachNotFound");

    const lessons = await this.prisma.lesson.findMany({
      where: {
        coachId: id,
        status: LessonStatus.SCHEDULED,
        date: { gte: toDbDate(today), lt: toDbDate(addDays(today, 7)) },
      },
      include: { court: true, timeSlot: true },
      orderBy: [
        { date: "asc" },
        { timeSlot: { sortOrder: "asc" } },
        { court: { sortOrder: "asc" } },
      ],
    });
    const remaining = lessons.filter(
      (lesson) => !isSlotPast(fromDbDate(lesson.date), lesson.timeSlot, now, clubTimeZone()),
    );

    return {
      coach: toCoachSummary(coach),
      courts: coach.allowedCourts
        .map((entry) => toCourtSummary(entry.court))
        .sort((a, b) => a.sortOrder - b.sortOrder),
      lessonsThisWeek: lessons.length,
      upcoming: remaining.slice(0, UPCOMING_LIMIT).map((lesson) => ({
        date: fromDbDate(lesson.date),
        court: toCourtSummary(lesson.court),
        slot: toSlotSummary(lesson.timeSlot),
      })),
    };
  }
}
