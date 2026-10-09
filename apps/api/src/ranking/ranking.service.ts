import { HttpStatus, Injectable } from "@nestjs/common";
import { MatchStatus, Role, type Sport, type Surface, TeamSide } from "@ficc/db";
import {
  type EloPoint,
  formatScore,
  fromDbDate,
  type H2HResponse,
  type H2HSideStats,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type PlayerProfile,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { DomainException, localize, notFound } from "../common/domain.exception";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { matchInclude, toMatchDetail, toSetScores } from "../matches/matches.service";
import { PrismaService } from "../prisma/prisma.service";
import { clubSettings } from "../tenancy/tenant-context";

const pct = (wins: number, matches: number) =>
  matches === 0 ? 0 : Math.round((wins / matches) * 100);

/** Leaderboards, rating history, player profiles and head-to-head comparisons. */
@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Members ranked by their rating in `sport` (the club's primary sport by default). */
  async leaderboard(categoryKey?: string, sportParam?: Sport): Promise<LeaderboardResponse> {
    const { primarySport, eloInitialRating } = clubSettings();
    const sport = sportParam ?? primarySport;
    if (categoryKey) {
      const category = await this.prisma.category.findFirst({ where: { key: categoryKey } });
      if (!category) {
        // Same answer as any invalid query value (categories used to be a fixed enum).
        const message = localize("api.unknownCategory");
        throw new DomainException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", { text: message }, [
          { path: "category", message },
        ]);
      }
    }
    const trendDays = clubSettings().rankingTrendDays;
    const since = new Date(this.clock.now().getTime() - trendDays * 86_400_000);
    const members = await this.prisma.user.findMany({
      where: {
        role: Role.MEMBER,
        isActive: true,
        ...(categoryKey ? { categories: { some: { category: { key: categoryKey } } } } : {}),
      },
      select: {
        ...playerSelect(),
        // This board's sport (the summary's elo then shows the same rating).
        ratings: { where: { sport }, select: { elo: true } },
        matchPlayers: {
          where: { match: { status: MatchStatus.CONFIRMED, sport } },
          select: { side: true, match: { select: { winnerSide: true } } },
        },
        eloHistory: { where: { sport, createdAt: { gte: since } }, select: { delta: true } },
      },
    });
    const ratingOf = (member: (typeof members)[number]) =>
      member.ratings[0]?.elo ?? eloInitialRating;
    members.sort((a, b) => ratingOf(b) - ratingOf(a) || a.name.localeCompare(b.name));

    const entries: LeaderboardEntry[] = [];
    members.forEach((member, index) => {
      const wins = member.matchPlayers.filter(
        (entry) => entry.side === entry.match.winnerSide,
      ).length;
      const matches = member.matchPlayers.length;
      const elo = ratingOf(member);
      const previous = entries[index - 1];
      entries.push({
        // Competition ranking: equal ratings share a rank (1, 2, 2, 4).
        rank: previous && previous.elo === elo ? previous.rank : index + 1,
        player: toPlayerSummary(member),
        elo,
        wins,
        losses: matches - wins,
        matches,
        winRate: pct(wins, matches),
        trend: member.eloHistory.reduce((sum, row) => sum + row.delta, 0),
      });
    });
    return {
      category: categoryKey ?? null,
      sport,
      entries,
      updatedAt: this.clock.now().toISOString(),
    };
  }

  /** Rating over time in `sport` (primary by default), starting from the initial rating. */
  async eloHistory(userId: string, sportParam?: Sport): Promise<EloPoint[]> {
    const { primarySport, eloInitialRating } = clubSettings();
    const sport = sportParam ?? primarySport;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (!user) throw notFound("PLAYER_NOT_FOUND", "api.playerNotFound");
    const rows = await this.prisma.eloHistory.findMany({
      where: { userId, sport },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const start: EloPoint = {
      at: (rows[0]
        ? new Date(Math.min(user.createdAt.getTime(), rows[0].createdAt.getTime() - 1))
        : user.createdAt
      ).toISOString(),
      elo: rows[0]?.before ?? eloInitialRating,
      delta: 0,
      matchId: null,
    };
    return [
      start,
      ...rows.map((row) => ({
        at: row.createdAt.toISOString(),
        elo: row.after,
        delta: row.delta,
        matchId: row.matchId,
      })),
    ];
  }

  async profile(userId: string, viewerId?: string): Promise<PlayerProfile> {
    const board = await this.leaderboard();
    const entry = board.entries.find((candidate) => candidate.player.id === userId);
    if (!entry) throw notFound("PLAYER_NOT_FOUND", "api.playerNotFound");
    const recent = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        sport: clubSettings().primarySport,
        players: { some: { userId } },
      },
      include: matchInclude(),
      orderBy: [{ playedOn: "desc" }, { confirmedAt: "desc" }],
      take: 5,
    });
    return {
      player: entry.player,
      rank: entry.rank,
      wins: entry.wins,
      losses: entry.losses,
      winRate: entry.winRate,
      trend: entry.trend,
      recentMatches: recent.map((match) => toMatchDetail(match, viewerId)),
    };
  }

  /** Head-to-head in the club's primary sport. */
  async h2h(aId: string, bId: string): Promise<H2HResponse> {
    const sport = clubSettings().primarySport;
    const users = await this.prisma.user.findMany({
      where: { id: { in: [aId, bId] }, role: Role.MEMBER },
      select: {
        ...playerSelect(),
        matchPlayers: {
          where: { match: { status: MatchStatus.CONFIRMED, sport } },
          select: { side: true, match: { select: { winnerSide: true } } },
        },
      },
    });
    const a = users.find((user) => user.id === aId);
    const b = users.find((user) => user.id === bId);
    if (!a || !b) throw notFound("PLAYER_NOT_FOUND", "api.playerNotFound");

    // Confirmed matches where the two played on opposite sides.
    const shared = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        sport,
        AND: [{ players: { some: { userId: aId } } }, { players: { some: { userId: bId } } }],
      },
      include: matchInclude(),
      orderBy: [{ playedOn: "desc" }, { confirmedAt: "desc" }],
    });
    const meetings = shared.filter((match) => {
      const sideOf = (id: string) => match.players.find((player) => player.userId === id)?.side;
      return sideOf(aId) !== sideOf(bId);
    });

    const surfaces: H2HResponse["surfaces"] = {
      HARTRU: { played: 0, aWins: 0, bWins: 0 },
      SAIBRO: { played: 0, aWins: 0, bWins: 0 },
    };
    let aWins = 0;
    const lastMeetings = meetings.map((match) => {
      const aSide = match.players.find((player) => player.userId === aId)!.side;
      const aWon = match.winnerSide === aSide;
      if (aWon) aWins += 1;
      const surface = surfaces[match.surface as Surface];
      surface.played += 1;
      surface[aWon ? "aWins" : "bWins"] += 1;
      const sets = toSetScores(match);
      const fromA =
        aSide === TeamSide.A ? sets : sets.map((set) => ({ ...set, a: set.b, b: set.a }));
      return {
        matchId: match.id,
        playedOn: fromDbDate(match.playedOn),
        format: match.format,
        surface: match.surface,
        score: formatScore(fromA),
        winner: aWon ? ("a" as const) : ("b" as const),
      };
    });

    const side = async (user: typeof a, h2hWins: number): Promise<H2HSideStats> => {
      const wins = user.matchPlayers.filter(
        (entry) => entry.side === entry.match.winnerSide,
      ).length;
      return {
        player: toPlayerSummary(user),
        h2hWins,
        winRate: pct(wins, user.matchPlayers.length),
        matches: user.matchPlayers.length,
        history: await this.eloHistory(user.id, sport),
      };
    };

    return {
      a: await side(a, aWins),
      b: await side(b, meetings.length - aWins),
      meetings: meetings.length,
      lastMeetings: lastMeetings.slice(0, 5),
      surfaces,
    };
  }
}
