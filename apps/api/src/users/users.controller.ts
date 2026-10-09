import { Controller, Get, Query } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type MemberSearchQuery,
  memberSearchQuerySchema,
  normalizeMembershipId,
  type PlayerSummary,
} from "@ficc/shared";

import { CurrentUser, type RequestUser } from "../common/auth.decorators";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";

@Controller("members")
export class MembersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Active members by name or matrícula (for booking, reporting and H2H pickers). */
  @Get("search")
  async search(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(memberSearchQuerySchema)) query: MemberSearchQuery,
  ): Promise<PlayerSummary[]> {
    const digits = normalizeMembershipId(query.q);
    const members = await this.prisma.user.findMany({
      where: {
        role: Role.MEMBER,
        isActive: true,
        OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          ...(digits.length >= 2 ? [{ membershipId: { startsWith: digits } }] : []),
        ],
      },
      select: playerSelect(),
      orderBy: { name: "asc" },
      take: 12,
    });
    // The caller comes last so pickers default to other people.
    return members
      .sort((a, b) => Number(a.id === user.id) - Number(b.id === user.id))
      .map(toPlayerSummary);
  }
}
