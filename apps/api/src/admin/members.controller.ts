import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type AdminMemberItem,
  type AdminMembersQuery,
  adminMembersQuerySchema,
  type ImportMembershipsInput,
  importMembershipsSchema,
  type MembershipImportResult,
  normalizeMembershipId,
  parseMembershipCsv,
} from "@ficc/shared";

import { Roles } from "../common/auth.decorators";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";

@Controller("admin")
@Roles(Role.ADMIN)
export class AdminMembersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("members")
  async members(
    @Query(new ZodValidationPipe(adminMembersQuerySchema)) query: AdminMembersQuery,
  ): Promise<AdminMemberItem[]> {
    const digits = query.q ? normalizeMembershipId(query.q) : "";
    const members = await this.prisma.user.findMany({
      where: {
        role: Role.MEMBER,
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
        ...playerSelect,
        isActive: true,
        guestPassesSuspendedAt: true,
        guestPassesSuspendedReason: true,
      },
      orderBy: { name: "asc" },
      take: 200,
    });
    return members.map((member) => ({
      player: toPlayerSummary(member),
      isActive: member.isActive,
      guestPassesSuspended: member.guestPassesSuspendedAt !== null,
      guestPassesSuspendedReason: member.guestPassesSuspendedReason,
    }));
  }

  /** CSV import of valid matrículas ("matricula,nome"); existing IDs get their name updated. */
  @Post("memberships/import")
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
          where: { membershipId: row.membershipId },
          create: { membershipId: row.membershipId, holderName: row.holderName ?? null },
          update: { isActive: true, ...(row.holderName ? { holderName: row.holderName } : {}) },
        }),
      ),
    );
    const updated = rows.filter((row) => existing.has(row.membershipId)).length;
    return { created: rows.length - updated, updated, errors };
  }
}
