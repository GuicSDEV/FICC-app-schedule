import { Injectable } from "@nestjs/common";
import { type Category, MatchStatus, Role, type Surface, TeamSide } from "@ficc/db";
import {
  ELO_INITIAL_RATING,
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
import { notFound } from "../common/domain.exception";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { matchInclude, toMatchDetail, toSetScores } from "../matches/matches.service";
import { PrismaService } from "../prisma/prisma.service";

const TREND_DAYS = 30;

const pct = (wins: number, matches: number) =>
  matches === 0 ? 0 : Math.round((wins / matches) * 100);

/** Leaderboards, rating history, player profiles and head-to-head comparisons. */
@Injectable()
export class RankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async leaderboard(category?: Category): Promise<LeaderboardResponse> {
    const since = new Date(this.clock.now().getTime() - TREND_DAYS * 86_400_000);
    const members = await this.prisma.user.findMany({
      where: {
        role: Role.MEMBER,
        isActive: true,
        ...(category ? { categories: { has: category } } : {}),
      },
      select: {
        ...playerSelect,
        matchPlayers: {
          where: { match: { status: MatchStatus.CONFIRMED } },
          select: { side: true, match: { select: { winnerSide: true } } },
        },
        eloHistory: { where: { createdAt: { gte: since } }, select: { delta: true } },
      },
      orderBy: [{ elo: "desc" }, { name: "asc" }],
    });

    const entries: LeaderboardEntry[] = [];
    members.forEach((member, index) => {
      const wins = member.matchPlayers.filter(
        (entry) => entry.side === entry.match.winnerSide,
      ).length;
      const matches = member.matchPlayers.length;
      const previous = entries[index - 1];
      entries.push({
        // Competition ranking: equal ratings share a rank (1, 2, 2, 4).
        rank: previous && previous.elo === member.elo ? previous.rank : index + 1,
        player: toPlayerSummary(member),
        elo: member.elo,
        wins,
        losses: matches - wins,
        matches,
        winRate: pct(wins, matches),
        trend: member.eloHistory.reduce((sum, row) => sum + row.delta, 0),
      });
    });
    return { category: category ?? null, entries, updatedAt: this.clock.now().toISOString() };
  }

  async eloHistory(userId: string): Promise<EloPoint[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (!user) throw notFound("PLAYER_NOT_FOUND", "Jogador não encontrado.");
    const rows = await this.prisma.eloHistory.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const start: EloPoint = {
      at: (rows[0]
        ? new Date(Math.min(user.createdAt.getTime(), rows[0].createdAt.getTime() - 1))
        : user.createdAt
      ).toISOString(),
      elo: rows[0]?.before ?? ELO_INITIAL_RATING,
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
    if (!entry) throw notFound("PLAYER_NOT_FOUND", "Jogador não encontrado.");
    const recent = await this.prisma.match.findMany({
      where: { status: MatchStatus.CONFIRMED, players: { some: { userId } } },
      include: matchInclude,
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

  async h2h(aId: string, bId: string): Promise<H2HResponse> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [aId, bId] }, role: Role.MEMBER },
      select: {
        ...playerSelect,
        matchPlayers: {
          where: { match: { status: MatchStatus.CONFIRMED } },
          select: { side: true, match: { select: { winnerSide: true } } },
        },
      },
    });
    const a = users.find((user) => user.id === aId);
    const b = users.find((user) => user.id === bId);
    if (!a || !b) throw notFound("PLAYER_NOT_FOUND", "Jogador não encontrado.");

    // Confirmed matches where the two played on opposite sides.
    const shared = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        AND: [{ players: { some: { userId: aId } } }, { players: { some: { userId: bId } } }],
      },
      include: matchInclude,
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
        type: match.type,
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
        history: await this.eloHistory(user.id),
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
