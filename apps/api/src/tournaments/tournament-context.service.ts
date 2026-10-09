import { Injectable } from "@nestjs/common";
import { Role } from "@ficc/db";
import { fromDbDate, slotEndsAt, slotStartsAt, type TournamentMatchView } from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { forbidden, notFound } from "../common/domain.exception";
import type { Tx } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";
import { freezesOverlapping } from "../schedule/freezes";
import { clubTimeZone } from "../tenancy/tenant-context";
import { type MatchViewContext, type TMatchRow, toMatchView } from "./tournament.mappers";

/** Results are overdue this long after the slot ended. */
export const OVERDUE_AFTER_MS = 2 * 60 * 60_000;

/** Permissions and the context every tournament match view needs. */
@Injectable()
export class TournamentContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Admins manage every tournament; members only those they organize. */
  async canManage(
    user: RequestUser | undefined,
    tournamentId: string,
    client: Tx = this.prisma,
  ): Promise<boolean> {
    if (!user) return false;
    if (can(user, "TOURNAMENTS_MANAGE")) return true;
    if (user.role !== Role.MEMBER) return false;
    const row = await client.tournamentOrganizer.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: user.id } },
    });
    return row !== null;
  }

  async assertCanManage(
    user: RequestUser,
    tournamentId: string,
    client: Tx = this.prisma,
  ): Promise<void> {
    const tournament = await client.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });
    if (!tournament) throw notFound("TOURNAMENT_NOT_FOUND", "api.tournamentNotFound");
    if (!(await this.canManage(user, tournamentId, client))) {
      throw forbidden("NOT_ORGANIZER", "api.notOrganizer");
    }
  }

  /** The tournament a match / category / entry belongs to. */
  async tournamentOfMatch(matchId: string): Promise<string> {
    const match = await this.prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      select: { tournamentId: true },
    });
    if (!match) throw notFound("TOURNAMENT_MATCH_NOT_FOUND", "api.tournamentMatchNotFound");
    return match.tournamentId;
  }

  async tournamentOfCategory(categoryId: string): Promise<string> {
    const category = await this.prisma.tournamentCategory.findUnique({
      where: { id: categoryId },
      select: { tournamentId: true },
    });
    if (!category)
      throw notFound("TOURNAMENT_CATEGORY_NOT_FOUND", "api.tournamentCategoryNotFound");
    return category.tournamentId;
  }

  async tournamentOfEntry(entryId: string): Promise<string> {
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { id: entryId },
      select: { category: { select: { tournamentId: true } } },
    });
    if (!entry) throw notFound("TOURNAMENT_ENTRY_NOT_FOUND", "api.tournamentEntryNotFound");
    return entry.category.tournamentId;
  }

  /** Builds views for matches (round names, published days, overdue and frozen flags). */
  async views(
    matches: readonly TMatchRow[],
    viewer: RequestUser | undefined,
    canManage: boolean,
  ): Promise<TournamentMatchView[]> {
    const context = await this.context(matches, viewer, canManage);
    return matches.map((match) => toMatchView(match, context));
  }

  async context(
    matches: readonly TMatchRow[],
    viewer: RequestUser | undefined,
    canManage: boolean,
  ): Promise<MatchViewContext> {
    const categoryIds = [...new Set(matches.map((match) => match.categoryId))];
    const tournamentIds = [...new Set(matches.map((match) => match.tournamentId))];
    const [rounds, days] = await Promise.all([
      categoryIds.length
        ? this.prisma.tournamentMatch.groupBy({
            by: ["categoryId"],
            where: { categoryId: { in: categoryIds }, stage: "KNOCKOUT" },
            _max: { round: true },
          })
        : Promise.resolve([]),
      tournamentIds.length
        ? this.prisma.tournamentScheduleDay.findMany({
            where: { tournamentId: { in: tournamentIds } },
          })
        : Promise.resolve([]),
    ]);
    const now = this.clock.now();
    const zone = clubTimeZone();
    const scheduled = matches.filter(
      (match) =>
        match.scheduledDate &&
        match.timeSlot &&
        match.courtId &&
        match.resultStatus !== "CONFIRMED",
    );
    const overdueMatchIds = new Set(
      scheduled
        .filter(
          (match) =>
            slotEndsAt(fromDbDate(match.scheduledDate!), match.timeSlot!, zone).getTime() +
              OVERDUE_AFTER_MS <=
            now.getTime(),
        )
        .map((match) => match.id),
    );
    const frozenMatchIds = new Set<string>();
    if (scheduled.length > 0) {
      const starts = scheduled.map((match) =>
        slotStartsAt(fromDbDate(match.scheduledDate!), match.timeSlot!, zone),
      );
      const ends = scheduled.map((match) =>
        slotEndsAt(fromDbDate(match.scheduledDate!), match.timeSlot!, zone),
      );
      const freezes = await freezesOverlapping(
        this.prisma,
        new Date(Math.min(...starts.map(Number))),
        new Date(Math.max(...ends.map(Number))),
      );
      scheduled.forEach((match, index) => {
        const hit = freezes.some(
          (freeze) =>
            freeze.courts.some((court) => court.courtId === match.courtId) &&
            freeze.startsAt < ends[index]! &&
            (freeze.endsAt === null || freeze.endsAt > starts[index]!),
        );
        if (hit) frozenMatchIds.add(match.id);
      });
    }
    return {
      viewerId: viewer?.id,
      canManage,
      koRounds: new Map(rounds.map((row) => [row.categoryId, row._max.round ?? 0])),
      publishedDays: new Set(days.map((day) => `${day.tournamentId}:${fromDbDate(day.date)}`)),
      frozenMatchIds,
      overdueMatchIds,
    };
  }
}
