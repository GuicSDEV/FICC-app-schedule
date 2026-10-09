import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type AgendaQuery,
  agendaQuerySchema,
  type CancelLessonInput,
  type CancelLessonResult,
  cancelLessonSchema,
  type CopyWeekInput,
  type CopyWeekResult,
  copyWeekSchema,
  type CreateLessonInput,
  type CreateLessonResult,
  createLessonSchema,
  type LessonAuditItem,
  type LessonAuditQuery,
  lessonAuditQuerySchema,
  type LessonDetail,
  type LessonsQuery,
  lessonsQuerySchema,
  type ScheduleDay,
  type UpdateLessonInput,
  updateLessonSchema,
} from "@ficc/shared";

import { CurrentUser, type RequestUser, Roles } from "../common/auth.decorators";
import { forbidden } from "../common/domain.exception";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { ScheduleService } from "../schedule/schedule.service";
import { LessonsService } from "./lessons.service";

/** Coach portal: a coach manages only their own lessons, on their allowed courts. */
@Controller("coach")
@Roles(Role.COACH)
export class CoachController {
  constructor(
    private readonly lessons: LessonsService,
    private readonly schedule: ScheduleService,
    private readonly prisma: PrismaService,
  ) {}

  /** The grid of the coach's allowed courts for one date. */
  @Get("agenda")
  async agenda(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(agendaQuerySchema)) query: AgendaQuery,
  ): Promise<ScheduleDay> {
    const coachId = this.coachIdOf(user);
    const courts = await this.prisma.coachCourt.findMany({
      where: { coachId },
      select: { courtId: true },
    });
    return this.schedule.getDay(query.date, {
      courtIds: courts.map((entry) => entry.courtId),
      lessonDetailsFor: [coachId],
    });
  }

  @Get("lessons")
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(lessonsQuerySchema)) query: LessonsQuery,
  ): Promise<LessonDetail[]> {
    return this.lessons.list({ coachId: this.coachIdOf(user), from: query.from, to: query.to });
  }

  @Post("lessons")
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createLessonSchema)) body: CreateLessonInput,
  ): Promise<CreateLessonResult> {
    return this.lessons.create(user, body);
  }

  @Post("lessons/copy-week")
  @HttpCode(200)
  copyWeek(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(copyWeekSchema)) body: CopyWeekInput,
  ): Promise<CopyWeekResult> {
    return this.lessons.copyWeek(user, body.weekStart);
  }

  @Patch("lessons/:id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLessonSchema)) body: UpdateLessonInput,
  ): Promise<LessonDetail> {
    return this.lessons.update(user, id, body);
  }

  @Post("lessons/:id/cancel")
  @HttpCode(200)
  cancel(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelLessonSchema)) body: CancelLessonInput,
  ): Promise<CancelLessonResult> {
    return this.lessons.cancel(user, id, body.scope);
  }

  @Post("lessons/:id/restore")
  @HttpCode(200)
  restore(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<LessonDetail> {
    return this.lessons.restore(user, id);
  }

  private coachIdOf(user: RequestUser): string {
    if (!user.coachId) throw forbidden("NOT_A_COACH", "Conta sem perfil de professor.");
    return user.coachId;
  }
}

/** Admins manage every coach's lessons and can read the change log. */
@Controller("admin/lessons")
@Roles(Role.ADMIN)
export class AdminLessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(lessonsQuerySchema)) query: LessonsQuery,
  ): Promise<LessonDetail[]> {
    return this.lessons.list({
      coachId: query.coachId,
      from: query.from,
      to: query.to,
      includeCancelled: true,
    });
  }

  @Get("audit")
  audit(
    @Query(new ZodValidationPipe(lessonAuditQuerySchema)) query: LessonAuditQuery,
  ): Promise<LessonAuditItem[]> {
    return this.lessons.auditLog(query);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createLessonSchema)) body: CreateLessonInput,
  ): Promise<CreateLessonResult> {
    return this.lessons.create(user, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLessonSchema)) body: UpdateLessonInput,
  ): Promise<LessonDetail> {
    return this.lessons.update(user, id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelLessonSchema)) body: CancelLessonInput,
  ): Promise<CancelLessonResult> {
    return this.lessons.cancel(user, id, body.scope);
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<LessonDetail> {
    return this.lessons.restore(user, id);
  }
}
