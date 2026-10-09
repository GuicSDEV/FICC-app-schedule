import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { Role, UserStatus } from "@ficc/db";
import {
  type AdminMemberItem,
  holderMembershipId,
  isDependentMembershipId,
  type PendingSignup,
  type SignupDecisionInput,
  signupDecisionSchema,
  type AdminMembersQuery,
  adminMembersQuerySchema,
  type ImportMembershipsInput,
  importMembershipsSchema,
  type MembershipImportResult,
  normalizeMembershipId,
  parseMembershipCsv,
} from "@ficc/shared";

import { NoShowsService } from "../bookings/no-shows.service";
import {
  CurrentUser,
  type RequestUser,
  Roles,
  RequirePermissions,
} from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, localize, notFound } from "../common/domain.exception";
import { NotificationsService } from "../notifications/notifications.service";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { tenant } from "../tenancy/tenant-context";

@Controller("admin")
@Roles(Role.ADMIN)
export class AdminMembersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly noShows: NoShowsService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  @Get("members")
  @RequirePermissions("MEMBERS_MANAGE")
  async members(
    @Query(new ZodValidationPipe(adminMembersQuerySchema)) query: AdminMembersQuery,
  ): Promise<AdminMemberItem[]> {
    const digits = query.q ? normalizeMembershipId(query.q) : "";
    const members = await this.prisma.user.findMany({
      where: {
        role: Role.MEMBER,
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" as const } },
                ...(digits ? [{ membershipId: { startsWith: digits } }] : []),
              ],
            }
          : {}),
      },
      select: {
        ...playerSelect(),
        isActive: true,
        status: true,
        guestPassesSuspendedAt: true,
        guestPassesSuspendedReason: true,
        bookingSuspendedUntil: true,
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    const holders = members
      .map((member) => member.membershipId)
      .filter((id): id is string => id !== null && !isDependentMembershipId(id));
    const [counts, dependents] = await Promise.all([
      this.noShows.recentCounts(members.map((member) => member.id)),
      holders.length > 0
        ? this.prisma.user.findMany({
            where: {
              role: Role.MEMBER,
              OR: holders.map((id) => ({ membershipId: { startsWith: `${id}-` } })),
            },
            select: { id: true, name: true, membershipId: true },
            orderBy: { membershipId: "asc" },
          })
        : Promise.resolve([]),
    ]);
    const now = this.clock.now();
    return members.map((member) => ({
      player: toPlayerSummary(member),
      isActive: member.isActive,
      guestPassesSuspended: member.guestPassesSuspendedAt !== null,
      guestPassesSuspendedReason: member.guestPassesSuspendedReason,
      status: member.status,
      recentNoShows: counts.get(member.id) ?? 0,
      bookingSuspendedUntil:
        member.bookingSuspendedUntil && member.bookingSuspendedUntil > now
          ? member.bookingSuspendedUntil.toISOString()
          : null,
      dependents: dependents
        .filter(
          (entry) =>
            member.membershipId !== null &&
            entry.membershipId !== null &&
            holderMembershipId(entry.membershipId) === member.membershipId &&
            entry.membershipId !== member.membershipId,
        )
        .map((entry) => ({ id: entry.id, name: entry.name, membershipId: entry.membershipId! })),
    }));
  }

  /** Self sign-ups waiting for approval, oldest first. */
  @Get("members/pending")
  @RequirePermissions("MEMBERS_APPROVE")
  async pending(): Promise<PendingSignup[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: Role.MEMBER, status: UserStatus.PENDING },
      include: { membership: { select: { holderName: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      membershipId: row.membershipId ?? "",
      listedName: row.membership?.holderName ?? null,
      holderMembershipId:
        row.membershipId && isDependentMembershipId(row.membershipId)
          ? holderMembershipId(row.membershipId)
          : null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Approve (the member can log in, and is told so) or reject with a reason. */
  @Post("members/:id/decision")
  @HttpCode(204)
  @RequirePermissions("MEMBERS_APPROVE")
  async decide(
    @CurrentUser() actor: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signupDecisionSchema)) body: SignupDecisionInput,
  ): Promise<void> {
    const member = await this.prisma.user.findFirst({ where: { id, role: Role.MEMBER } });
    if (!member) throw notFound("MEMBER_NOT_FOUND", "api.memberNotFound");
    if (member.status !== UserStatus.PENDING) {
      throw conflict("SIGNUP_NOT_PENDING", "api.signupNotPending");
    }
    const approved = body.decision === "APPROVE";
    await this.prisma.user.update({
      where: { id },
      data: {
        status: approved ? UserStatus.ACTIVE : UserStatus.REJECTED,
        rejectionReason: approved ? null : body.reason,
        reviewedAt: this.clock.now(),
        reviewedById: actor.id,
      },
    });
    if (approved) {
      // Read at the first login (they could not log in before).
      await this.notifications.notify([id], "MEMBER_APPROVED", { clubName: tenant().name });
    }
  }

  /** CSV import of valid matrículas ("matricula,nome"); existing IDs get their name updated. */
  @Post("memberships/import")
  @RequirePermissions("MEMBERS_MANAGE")
  async importMemberships(
    @Body(new ZodValidationPipe(importMembershipsSchema)) body: ImportMembershipsInput,
  ): Promise<MembershipImportResult> {
    const { rows, errors } = parseMembershipCsv(body.csv);
    const existing = new Set(
      (
        await this.prisma.validMembershipId.findMany({
          where: { membershipId: { in: rows.map((row) => row.membershipId) } },
          select: { membershipId: true },
        })
      ).map((row) => row.membershipId),
    );
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.validMembershipId.upsert({
          where: {
            clubId_membershipId: { clubId: tenant().clubId, membershipId: row.membershipId },
          },
          create: { membershipId: row.membershipId, holderName: row.holderName ?? null },
          update: { isActive: true, ...(row.holderName ? { holderName: row.holderName } : {}) },
        }),
      ),
    );
    const updated = rows.filter((row) => existing.has(row.membershipId)).length;
    return {
      created: rows.length - updated,
      updated,
      errors: errors.map((error) => ({
        line: error.line,
        message: localize({
          key: "validation.invalidMembershipIdValue",
          params: { value: error.value },
        }),
      })),
    };
  }
}
