import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { LessonAuditAction, LessonStatus, Prisma, Role, type TimeSlot } from "@ficc/db";
import {
  addDays,
  type CancelLessonResult,
  clubToday,
  type CopyWeekResult,
  type CreateLessonInput,
  type CreateLessonResult,
  dateRange,
  fromDbDate,
  type IsoDate,
  isSlotPast,
  type LessonAuditItem,
  type LessonAuditQuery,
  type LessonCancelScope,
  type LessonDetail,
  type MessageRef,
  type SlotBlockReason,
  slotStartsAt,
  toDbDate,
  type UpdateLessonInput,
  weekdayOf,
  isSlotInPlan,
} from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import {
  conflict,
  DomainException,
  forbidden,
  notFound,
  unprocessable,
} from "../common/domain.exception";
import { toCoachSummary, toCourtSummary, toSlotSummary } from "../common/mappers";
import { serializable, type Tx } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { DayPlanService } from "../schedule/day-plan.service";
import { isCourtFrozen } from "../schedule/freezes";
import { SlotEventsService } from "../schedule/slot-events.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";

export const lessonInclude = {
  court: true,
  timeSlot: true,
  coach: true,
  series: { select: { weekdays: true, startDate: true, endDate: true } },
} satisfies Prisma.LessonInclude;

export type LessonWithRelations = Prisma.LessonGetPayload<{ include: typeof lessonInclude }>;

export function toLessonDetail(lesson: LessonWithRelations): LessonDetail {
  const date = fromDbDate(lesson.date);
  return {
    id: lesson.id,
    seriesId: lesson.seriesId,
    date,
    status: lesson.status,
    court: toCourtSummary(lesson.court),
    slot: toSlotSummary(lesson.timeSlot),
    coach: toCoachSummary(lesson.coach),
    startsAt: slotStartsAt(date, lesson.timeSlot, clubTimeZone()).toISOString(),
    studentNames: lesson.studentNames,
    note: lesson.note,
    series: lesson.series
      ? {
          weekdays: lesson.series.weekdays,
          startDate: fromDbDate(lesson.series.startDate),
          endDate: lesson.series.endDate ? fromDbDate(lesson.series.endDate) : null,
        }
      : null,
  };
}

interface Target {
  coachId: string;
  courtId: string;
  courtName: string;
  slot: TimeSlot;
  date: IsoDate;
  /** Lesson being moved, ignored by the coach-busy check. */
  ignoreLessonId?: string;
}

/** Why a slot cannot take a lesson, or null when it is free. */
type Blocker = { code: string; message: MessageRef; reason: SlotBlockReason };

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly slotEvents: SlotEventsService,
    private readonly plans: DayPlanService,
  ) {}

  /** One-off lesson, or a weekly series with its occurrences for the rolling window. */
  async create(actor: RequestUser, input: CreateLessonInput): Promise<CreateLessonResult> {
    const now = this.clock.now();
    const coach = await this.resolveCoach(actor, input.coachId);
    this.assertCourtAllowed(coach, input.courtId);

    const result = await serializable(this.prisma, async (tx) => {
      const { court, slot } = await this.loadCourtAndSlot(tx, input.courtId, input.timeSlotId);
      const first: Target = {
        coachId: coach.id,
        courtId: court.id,
        courtName: court.name,
        slot,
        date: input.date,
      };
      const blocker = await this.blockerFor(tx, first, now);
      if (blocker) throw this.toError(blocker);

      if (!input.repeat) {
        const lesson = await this.insertLesson(tx, first, null, input);
        await this.audit(
          tx,
          actor,
          LessonAuditAction.CREATED,
          { lessonId: lesson.id },
          { date: input.date },
        );
        return { lessons: [lesson], series: null };
      }

      const today = clubToday(now, clubTimeZone());
      const horizon = addDays(today, clubSettings().lessonWindowDays - 1);
      const windowEnd = maxDate(input.date, minDate(input.repeat.endDate ?? horizon, horizon));
      const series = await tx.lessonSeries.create({
        data: {
          coachId: coach.id,
          courtId: court.id,
          timeSlotId: slot.id,
          weekdays: input.repeat.weekdays,
          startDate: toDbDate(input.date),
          endDate: input.repeat.endDate ? toDbDate(input.repeat.endDate) : null,
          studentNames: input.studentNames ?? null,
          note: input.note ?? null,
          generatedUntil: toDbDate(windowEnd),
        },
      });

      const lessons: LessonWithRelations[] = [];
      const skippedDates: IsoDate[] = [];
      for (const date of dateRange(input.date, windowEnd)) {
        if (!input.repeat.weekdays.includes(weekdayOf(date))) continue;
        const target = { ...first, date };
        if (date !== input.date && (await this.blockerFor(tx, target, now))) {
          skippedDates.push(date);
          continue;
        }
        lessons.push(await this.insertLesson(tx, target, series.id, input));
      }
      await this.audit(
        tx,
        actor,
        LessonAuditAction.SERIES_CREATED,
        { seriesId: series.id, lessonId: lessons[0]?.id ?? null },
        {
          weekdays: input.repeat.weekdays,
          startDate: input.date,
          endDate: input.repeat.endDate ?? null,
          generated: lessons.length,
          skippedDates,
        },
      );
      return { lessons, series: { id: series.id, generated: lessons.length, skippedDates } };
    });

    this.slotEvents.changed("lesson.created", result.lessons);
    return { lesson: toLessonDetail(result.lessons[0]!), series: result.series };
  }

  /** Cancels one occurrence, or this one and every later one of its series (ending the series). */
  async cancel(
    actor: RequestUser,
    lessonId: string,
    scope: LessonCancelScope,
  ): Promise<CancelLessonResult> {
    const now = this.clock.now();
    const lesson = await this.loadLesson(lessonId);
    this.assertCanManage(actor, lesson);
    if (lesson.status !== LessonStatus.SCHEDULED) {
      throw conflict("LESSON_ALREADY_CANCELLED", "api.lessonAlreadyCancelled");
    }
    if (isSlotPast(fromDbDate(lesson.date), lesson.timeSlot, now, clubTimeZone())) {
      throw unprocessable("SLOT_IN_PAST", "api.lessonStarted");
    }

    const cancelled = await serializable(this.prisma, async (tx) => {
      const ids =
        scope === "THIS_AND_FUTURE" && lesson.seriesId
          ? (
              await tx.lesson.findMany({
                where: {
                  seriesId: lesson.seriesId,
                  date: { gte: lesson.date },
                  status: LessonStatus.SCHEDULED,
                },
                select: { id: true },
              })
            ).map((entry) => entry.id)
          : [lesson.id];
      await tx.lesson.updateMany({
        where: { id: { in: ids } },
        data: { status: LessonStatus.CANCELLED, cancelledAt: now },
      });
      await tx.slotOccupancy.deleteMany({ where: { lessonId: { in: ids } } });

      if (scope === "THIS_AND_FUTURE" && lesson.seriesId && lesson.series) {
        const startDate = fromDbDate(lesson.series.startDate);
        const endDate = maxDate(startDate, addDays(fromDbDate(lesson.date), -1));
        await tx.lessonSeries.update({
          where: { id: lesson.seriesId },
          data: { endDate: toDbDate(endDate) },
        });
        await this.audit(
          tx,
          actor,
          LessonAuditAction.SERIES_ENDED,
          { seriesId: lesson.seriesId, lessonId: lesson.id },
          { fromDate: fromDbDate(lesson.date), cancelled: ids.length },
        );
      } else {
        await this.audit(
          tx,
          actor,
          LessonAuditAction.CANCELLED,
          { lessonId: lesson.id, seriesId: lesson.seriesId },
          {
            date: fromDbDate(lesson.date),
          },
        );
      }
      return tx.lesson.findMany({
        where: { id: { in: ids } },
        include: lessonInclude,
        orderBy: { date: "asc" },
      });
    });

    await this.slotEvents.released("lesson.cancelled", cancelled);
    if (can(actor, "LESSONS_MANAGE")) {
      await this.notifications.notify(lesson.coach.userId, "LESSON_CANCELLED", {
        lessonId: lesson.id,
        byName: actor.name,
        date: fromDbDate(lesson.date),
        courtId: lesson.courtId,
        courtName: lesson.court.name,
        timeSlotId: lesson.timeSlotId,
        startTime: lesson.timeSlot.startTime,
      });
    }
    return { cancelled: cancelled.length, lessons: cancelled.map(toLessonDetail) };
  }

  /** Undo for a single cancelled occurrence, if its slot is still free. */
  async restore(actor: RequestUser, lessonId: string): Promise<LessonDetail> {
    const now = this.clock.now();
    const lesson = await this.loadLesson(lessonId);
    this.assertCanManage(actor, lesson);
    if (lesson.status !== LessonStatus.CANCELLED) {
      throw conflict("LESSON_NOT_CANCELLED", "api.lessonNotCancelled");
    }
    if (lesson.series?.endDate && lesson.series.endDate < lesson.date) {
      throw conflict("SERIES_ENDED", "api.seriesEnded");
    }

    const restored = await serializable(this.prisma, async (tx) => {
      const blocker = await this.blockerFor(
        tx,
        {
          coachId: lesson.coachId,
          courtId: lesson.courtId,
          courtName: lesson.court.name,
          slot: lesson.timeSlot,
          date: fromDbDate(lesson.date),
          ignoreLessonId: lesson.id,
        },
        now,
      );
      if (blocker) throw this.toError(blocker);
      await tx.slotOccupancy.create({
        data: {
          courtId: lesson.courtId,
          date: lesson.date,
          timeSlotId: lesson.timeSlotId,
          lessonId: lesson.id,
        },
      });
      await this.audit(
        tx,
        actor,
        LessonAuditAction.RESTORED,
        { lessonId: lesson.id, seriesId: lesson.seriesId },
        null,
      );
      return tx.lesson.update({
        where: { id: lesson.id },
        data: { status: LessonStatus.SCHEDULED, cancelledAt: null },
        include: lessonInclude,
      });
    });

    this.slotEvents.changed("lesson.restored", [restored]);
    return toLessonDetail(restored);
  }

  /**
   * Edits details or moves a lesson to another slot, date, court (or coach, admins only). A moved
   * occurrence that changes date leaves its series and becomes a one-off.
   */
  async update(
    actor: RequestUser,
    lessonId: string,
    input: UpdateLessonInput,
  ): Promise<LessonDetail> {
    const now = this.clock.now();
    const lesson = await this.loadLesson(lessonId);
    this.assertCanManage(actor, lesson);
    if (input.coachId && !can(actor, "LESSONS_MANAGE")) {
      throw forbidden("FORBIDDEN", "api.onlyAdminChangesCoach");
    }
    if (lesson.status !== LessonStatus.SCHEDULED) {
      throw conflict("LESSON_ALREADY_CANCELLED", "api.lessonCancelled");
    }
    if (isSlotPast(fromDbDate(lesson.date), lesson.timeSlot, now, clubTimeZone())) {
      throw unprocessable("SLOT_IN_PAST", "api.lessonStarted");
    }

    const coachId = input.coachId ?? lesson.coachId;
    const courtId = input.courtId ?? lesson.courtId;
    const timeSlotId = input.timeSlotId ?? lesson.timeSlotId;
    const date = input.date ?? fromDbDate(lesson.date);
    const moved =
      coachId !== lesson.coachId ||
      courtId !== lesson.courtId ||
      timeSlotId !== lesson.timeSlotId ||
      date !== fromDbDate(lesson.date);
    if (moved) {
      const coach = await this.prisma.coach.findUnique({
        where: { id: coachId },
        include: { allowedCourts: true },
      });
      if (!coach || !coach.isActive) throw notFound("COACH_NOT_FOUND", "api.coachNotFound");
      this.assertCourtAllowed(coach, courtId);
    }

    const updated = await serializable(this.prisma, async (tx) => {
      if (moved) {
        const { court, slot } = await this.loadCourtAndSlot(tx, courtId, timeSlotId);
        await tx.slotOccupancy.deleteMany({ where: { lessonId: lesson.id } });
        const blocker = await this.blockerFor(
          tx,
          {
            coachId,
            courtId: court.id,
            courtName: court.name,
            slot,
            date,
            ignoreLessonId: lesson.id,
          },
          now,
        );
        if (blocker) throw this.toError(blocker);
      }
      const result = await tx.lesson.update({
        where: { id: lesson.id },
        data: {
          coachId,
          courtId,
          timeSlotId,
          date: toDbDate(date),
          ...(date !== fromDbDate(lesson.date) ? { seriesId: null } : {}),
          ...(input.studentNames !== undefined ? { studentNames: input.studentNames || null } : {}),
          ...(input.note !== undefined ? { note: input.note || null } : {}),
        },
        include: lessonInclude,
      });
      if (moved) {
        await tx.slotOccupancy.create({
          data: { courtId, date: result.date, timeSlotId, lessonId: lesson.id },
        });
      }
      await this.audit(
        tx,
        actor,
        LessonAuditAction.UPDATED,
        { lessonId: lesson.id, seriesId: lesson.seriesId },
        {
          before: {
            coachId: lesson.coachId,
            courtId: lesson.courtId,
            timeSlotId: lesson.timeSlotId,
            date: fromDbDate(lesson.date),
            studentNames: lesson.studentNames,
            note: lesson.note,
          },
          after: {
            coachId,
            courtId,
            timeSlotId,
            date,
            studentNames: result.studentNames,
            note: result.note,
          },
        },
      );
      return result;
    });

    if (moved) {
      await this.slotEvents.released("lesson.moved", [lesson]);
      this.slotEvents.changed("lesson.moved", [updated]);
    } else {
      this.slotEvents.changed("lesson.moved", [updated]);
    }
    return toLessonDetail(updated);
  }

  /** Copies the coach's one-off lessons of a week to the next week, skipping taken slots. */
  async copyWeek(
    actor: RequestUser,
    weekStart: IsoDate,
    coachId?: string,
  ): Promise<CopyWeekResult> {
    const now = this.clock.now();
    const coach = await this.resolveCoach(actor, coachId);
    const sources = await this.prisma.lesson.findMany({
      where: {
        coachId: coach.id,
        seriesId: null,
        status: LessonStatus.SCHEDULED,
        date: { gte: toDbDate(weekStart), lte: toDbDate(addDays(weekStart, 6)) },
      },
      include: lessonInclude,
      orderBy: [{ date: "asc" }, { timeSlot: { sortOrder: "asc" } }],
    });

    const created: LessonWithRelations[] = [];
    const skipped: CopyWeekResult["skipped"] = [];
    for (const source of sources) {
      const date = addDays(fromDbDate(source.date), 7);
      const lesson = await serializable(this.prisma, async (tx) => {
        const target: Target = {
          coachId: coach.id,
          courtId: source.courtId,
          courtName: source.court.name,
          slot: source.timeSlot,
          date,
        };
        const blocker = await this.blockerFor(tx, target, now);
        if (blocker) {
          skipped.push({
            date,
            courtName: source.court.name,
            startTime: source.timeSlot.startTime,
            reason: blocker.reason,
          });
          return null;
        }
        const copy = await this.insertLesson(tx, target, null, source);
        await this.audit(
          tx,
          actor,
          LessonAuditAction.CREATED,
          { lessonId: copy.id },
          { date, copiedFrom: source.id },
        );
        return copy;
      });
      if (lesson) created.push(lesson);
    }

    this.slotEvents.changed("lesson.created", created);
    return { created: created.map(toLessonDetail), skipped };
  }

  /**
   * Scheduled job: materialises occurrences of active series up to 8 weeks ahead. Dates already
   * generated (including cancelled ones) are never re-created; taken or frozen slots are skipped.
   */
  async generateSeriesOccurrences(
    now: Date = this.clock.now(),
  ): Promise<{ created: number; skipped: number }> {
    const today = clubToday(now, clubTimeZone());
    const horizon = addDays(today, clubSettings().lessonWindowDays - 1);
    const seriesList = await this.prisma.lessonSeries.findMany({
      where: {
        coach: { isActive: true },
        OR: [{ endDate: null }, { endDate: { gte: toDbDate(today) } }],
      },
      include: { court: true, timeSlot: true },
    });

    const created: LessonWithRelations[] = [];
    let skipped = 0;
    for (const series of seriesList) {
      const startDate = fromDbDate(series.startDate);
      const from = maxDate(
        startDate,
        today,
        series.generatedUntil ? addDays(fromDbDate(series.generatedUntil), 1) : startDate,
      );
      const to = minDate(series.endDate ? fromDbDate(series.endDate) : horizon, horizon);
      if (from > to) continue;

      await serializable(this.prisma, async (tx) => {
        for (const date of dateRange(from, to)) {
          if (!series.weekdays.includes(weekdayOf(date))) continue;
          const exists = await tx.lesson.findUnique({
            where: { seriesId_date: { seriesId: series.id, date: toDbDate(date) } },
          });
          if (exists) continue;
          const target: Target = {
            coachId: series.coachId,
            courtId: series.courtId,
            courtName: series.court.name,
            slot: series.timeSlot,
            date,
          };
          if (await this.blockerFor(tx, target, now)) {
            skipped += 1;
            continue;
          }
          created.push(await this.insertLesson(tx, target, series.id, series));
        }
        await tx.lessonSeries.update({
          where: { id: series.id },
          data: { generatedUntil: toDbDate(to) },
        });
      });
    }

    if (created.length > 0) {
      this.slotEvents.changed("lesson.created", created);
      this.logger.log(`generated ${created.length} lesson occurrence(s), skipped ${skipped}`);
    }
    return { created: created.length, skipped };
  }

  async list(where: {
    coachId?: string;
    from: IsoDate;
    to: IsoDate;
    includeCancelled?: boolean;
  }): Promise<LessonDetail[]> {
    const lessons = await this.prisma.lesson.findMany({
      where: {
        ...(where.coachId ? { coachId: where.coachId } : {}),
        date: { gte: toDbDate(where.from), lte: toDbDate(where.to) },
        ...(where.includeCancelled ? {} : { status: LessonStatus.SCHEDULED }),
      },
      include: lessonInclude,
      orderBy: [
        { date: "asc" },
        { timeSlot: { sortOrder: "asc" } },
        { court: { sortOrder: "asc" } },
      ],
    });
    return lessons.map(toLessonDetail);
  }

  async auditLog(query: LessonAuditQuery): Promise<LessonAuditItem[]> {
    const entries = await this.prisma.lessonAuditLog.findMany({
      where: {
        ...(query.lessonId ? { lessonId: query.lessonId } : {}),
        ...(query.seriesId ? { seriesId: query.seriesId } : {}),
        ...(query.coachId
          ? { OR: [{ lesson: { coachId: query.coachId } }, { series: { coachId: query.coachId } }] }
          : {}),
      },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actor: entry.actor,
      lessonId: entry.lessonId,
      seriesId: entry.seriesId,
      details: entry.details,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async resolveCoach(actor: RequestUser, requestedCoachId?: string) {
    let coachId: string;
    if (actor.role === Role.COACH) {
      if (!actor.coachId) throw forbidden("NOT_A_COACH", "api.notACoach");
      if (requestedCoachId && requestedCoachId !== actor.coachId) {
        throw forbidden("NOT_YOUR_LESSON", "api.notYourLessonCreate");
      }
      coachId = actor.coachId;
    } else {
      if (!requestedCoachId) throw unprocessable("COACH_REQUIRED", "api.coachRequired");
      coachId = requestedCoachId;
    }
    const coach = await this.prisma.coach.findUnique({
      where: { id: coachId },
      include: { allowedCourts: true },
    });
    if (!coach || !coach.isActive) throw notFound("COACH_NOT_FOUND", "api.coachNotFound");
    return coach;
  }

  private assertCourtAllowed(
    coach: { displayName: string; allowedCourts: { courtId: string }[] },
    courtId: string,
  ) {
    if (!coach.allowedCourts.some((entry) => entry.courtId === courtId)) {
      throw forbidden("COURT_NOT_ALLOWED", {
        key: "api.courtNotAllowed",
        params: { coach: coach.displayName },
      });
    }
  }

  private assertCanManage(actor: RequestUser, lesson: { coachId: string }) {
    if (can(actor, "LESSONS_MANAGE")) return;
    if (actor.role !== Role.COACH || actor.coachId !== lesson.coachId) {
      throw forbidden("NOT_YOUR_LESSON", "api.notYourLessonEdit");
    }
  }

  private async loadLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { ...lessonInclude, series: true },
    });
    if (!lesson) throw notFound("LESSON_NOT_FOUND", "api.lessonNotFound");
    return lesson;
  }

  private async loadCourtAndSlot(tx: Tx, courtId: string, timeSlotId: string) {
    const [court, slot] = await Promise.all([
      tx.court.findUnique({ where: { id: courtId } }),
      tx.timeSlot.findUnique({ where: { id: timeSlotId } }),
    ]);
    if (!court || court.status !== "ACTIVE") throw notFound("COURT_NOT_FOUND", "api.courtNotFound");
    if (!slot || !slot.isActive) throw notFound("SLOT_NOT_FOUND", "api.slotNotFound");
    return { court, slot };
  }

  /** Read-only checks that a lesson may take this slot (inside the caller's transaction). */
  private async blockerFor(tx: Tx, target: Target, now: Date): Promise<Blocker | null> {
    if (isSlotPast(target.date, target.slot, now, clubTimeZone())) {
      return {
        code: "SLOT_IN_PAST",
        message: "api.slotInPast",
        reason: "SLOT_PAST",
      };
    }
    const plan = await this.plans.plan(target.date, tx);
    if (
      plan.closed ||
      plan.closedCourtIds.includes(target.courtId) ||
      !isSlotInPlan(plan, target.slot.startTime)
    ) {
      return {
        code: plan.closed
          ? "DAY_CLOSED"
          : plan.closedCourtIds.includes(target.courtId)
            ? "COURT_CLOSED_TODAY"
            : "SLOT_NOT_IN_GRID",
        message: plan.closed
          ? "api.dayClosed"
          : plan.closedCourtIds.includes(target.courtId)
            ? { key: "api.courtClosedToday", params: { court: target.courtName } }
            : "api.slotNotInGrid",
        reason: "NOT_IN_PLAN",
      };
    }
    if (await isCourtFrozen(tx, target.courtId, target.date, target.slot)) {
      return {
        code: "COURT_FROZEN",
        message: { key: "api.courtFrozen", params: { court: target.courtName } },
        reason: "COURT_FROZEN",
      };
    }
    const occupied = await tx.slotOccupancy.findUnique({
      where: {
        courtId_date_timeSlotId: {
          courtId: target.courtId,
          date: toDbDate(target.date),
          timeSlotId: target.slot.id,
        },
      },
    });
    if (occupied) {
      return occupied.lessonId
        ? {
            code: "SLOT_HAS_LESSON",
            message: "api.slotHasLesson",
            reason: "LESSON",
          }
        : {
            code: "SLOT_TAKEN",
            message: "api.slotHasBooking",
            reason: "BOOKING",
          };
    }
    const busy = await tx.lesson.findFirst({
      where: {
        coachId: target.coachId,
        date: toDbDate(target.date),
        timeSlotId: target.slot.id,
        status: LessonStatus.SCHEDULED,
        ...(target.ignoreLessonId ? { id: { not: target.ignoreLessonId } } : {}),
      },
      select: { id: true },
    });
    if (busy) {
      return {
        code: "COACH_BUSY",
        message: "api.coachBusy",
        reason: "COACH_BUSY",
      };
    }
    return null;
  }

  private toError(blocker: Blocker): DomainException {
    const status =
      blocker.code === "SLOT_IN_PAST" ? HttpStatus.UNPROCESSABLE_ENTITY : HttpStatus.CONFLICT;
    return new DomainException(status, blocker.code, blocker.message);
  }

  private async insertLesson(
    tx: Tx,
    target: Target,
    seriesId: string | null,
    details: { studentNames?: string | null; note?: string | null },
  ): Promise<LessonWithRelations> {
    const lesson = await tx.lesson.create({
      data: {
        seriesId,
        coachId: target.coachId,
        courtId: target.courtId,
        timeSlotId: target.slot.id,
        date: toDbDate(target.date),
        studentNames: details.studentNames ?? null,
        note: details.note ?? null,
      },
      include: lessonInclude,
    });
    await tx.slotOccupancy.create({
      data: {
        courtId: lesson.courtId,
        date: lesson.date,
        timeSlotId: lesson.timeSlotId,
        lessonId: lesson.id,
      },
    });
    return lesson;
  }

  private audit(
    tx: Tx,
    actor: RequestUser,
    action: LessonAuditAction,
    refs: { lessonId?: string | null; seriesId?: string | null },
    details: Record<string, unknown> | null,
  ) {
    return tx.lessonAuditLog.create({
      data: {
        actorId: actor.id,
        action,
        lessonId: refs.lessonId ?? null,
        seriesId: refs.seriesId ?? null,
        details: details === null ? Prisma.JsonNull : (details as Prisma.InputJsonValue),
      },
    });
  }
}

const maxDate = (...dates: IsoDate[]) => dates.reduce((a, b) => (a > b ? a : b));
const minDate = (...dates: IsoDate[]) => dates.reduce((a, b) => (a < b ? a : b));
