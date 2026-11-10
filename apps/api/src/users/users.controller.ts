import { Controller, Get, Query } from "@nestjs/common";
import { Role, UserStatus } from "@ficc/db";
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

  /**
   * Every active member, A–Z: the pickers load it once and filter on the device, so names show as
   * soon as the field is tapped (a club has hundreds of members, not thousands).
   */
  @Get()
  async directory(): Promise<PlayerSummary[]> {
    const members = await this.prisma.user.findMany({
      // Sign-ups still waiting for approval cannot be invited yet.
      where: { role: Role.MEMBER, isActive: true, status: UserStatus.ACTIVE },
      select: playerSelect(),
      orderBy: { name: "asc" },
    });
    return members.map(toPlayerSummary);
  }

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
          ...(digits.length >= 2 ? [{ membershipId: { contains: digits } }] : []),
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
