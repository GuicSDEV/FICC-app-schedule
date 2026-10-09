import { Injectable } from "@nestjs/common";
import { LessonStatus, Prisma, Role } from "@ficc/db";
import {
  type CoachAdminItem,
  clubToday,
  type CreateCoachInput,
  toDbDate,
  type UpdateCoachInput,
} from "@ficc/shared";
import { hash } from "argon2";

import { Clock } from "../common/clock";
import { conflict, notFound, unprocessable } from "../common/domain.exception";
import { toCoachSummary } from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { clubTimeZone } from "../tenancy/tenant-context";

const coachInclude = {
  user: { select: { id: true, name: true, email: true, isActive: true } },
  allowedCourts: { select: { courtId: true } },
} satisfies Prisma.CoachInclude;

/** Admin management of coach accounts and their allowed courts. */
@Injectable()
export class CoachesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(): Promise<CoachAdminItem[]> {
    const today = toDbDate(clubToday(this.clock.now(), clubTimeZone()));
    const coaches = await this.prisma.coach.findMany({
      include: {
        ...coachInclude,
        _count: {
          select: {
            lessonSeries: { where: { OR: [{ endDate: null }, { endDate: { gte: today } }] } },
            lessons: { where: { status: LessonStatus.SCHEDULED, date: { gte: today } } },
          },
        },
      },
      orderBy: { displayName: "asc" },
    });
    return coaches.map((coach) => ({
      ...toCoachSummary(coach),
      userId: coach.user.id,
      name: coach.user.name,
      email: coach.user.email,
      isActive: coach.isActive && coach.user.isActive,
      courtIds: coach.allowedCourts.map((entry) => entry.courtId).sort(),
      activeSeries: coach._count.lessonSeries,
      upcomingLessons: coach._count.lessons,
    }));
  }

  async create(input: CreateCoachInput): Promise<CoachAdminItem> {
    await this.assertCourtsExist(input.courtIds);
    try {
      const coach = await this.prisma.coach.create({
        data: {
          displayName: input.displayName,
          color: input.color,
          photoUrl: input.photoUrl ?? null,
          user: {
            create: {
              role: Role.COACH,
              name: input.name,
              email: input.email,
              passwordHash: await hash(input.password),
            },
          },
          allowedCourts: { create: input.courtIds.map((courtId) => ({ courtId })) },
        },
      });
      return this.get(coach.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("EMAIL_TAKEN", "api.emailTaken");
      }
      throw error;
    }
  }

  async update(coachId: string, input: UpdateCoachInput): Promise<CoachAdminItem> {
    const coach = await this.prisma.coach.findUnique({ where: { id: coachId } });
    if (!coach) throw notFound("COACH_NOT_FOUND", "api.coachNotFound");
    if (input.courtIds) await this.assertCourtsExist(input.courtIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.coach.update({
        where: { id: coachId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      await tx.user.update({
        where: { id: coach.userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.password !== undefined ? { passwordHash: await hash(input.password) } : {}),
        },
      });
      if (input.isActive === false || input.password !== undefined) {
        await tx.refreshToken.updateMany({
          where: { userId: coach.userId, revokedAt: null },
          data: { revokedAt: this.clock.now() },
        });
      }
      if (input.courtIds) {
        await tx.coachCourt.deleteMany({ where: { coachId } });
        await tx.coachCourt.createMany({
          data: input.courtIds.map((courtId) => ({ coachId, courtId })),
        });
      }
    });
    return this.get(coachId);
  }

  private async get(coachId: string): Promise<CoachAdminItem> {
    const item = (await this.list()).find((coach) => coach.id === coachId);
    if (!item) throw notFound("COACH_NOT_FOUND", "api.coachNotFound");
    return item;
  }

  private async assertCourtsExist(courtIds: string[]): Promise<void> {
    const count = await this.prisma.court.count({ where: { id: { in: courtIds } } });
    if (count !== new Set(courtIds).size)
      throw unprocessable("COURT_NOT_FOUND", "api.courtInvalid");
  }
}
