import { Injectable } from "@nestjs/common";
import type { RankingSeason } from "@ficc/db";
import {
  addDays,
  clubInstant,
  clubToday,
  type IsoDate,
  type SeasonDetail,
  type SeasonListItem,
  type SeasonStandingEntry,
  type SeasonSummary,
  type StartSeasonInput,
  type UpdateSeasonInput,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { conflict, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toPlayerSummary } from "../common/mappers";
import { serializable } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";
import { RankingService } from "./ranking.service";
import { toSeasonSummary } from "./season-summary";

/**
 * Ranking seasons. A season counts wins and losses from its start; closing it saves the final
 * table (members who played in it) and puts every rating back to the club's initial Elo, and the
 * next season starts at once. A season with an end date closes on its own (job).
 */
@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ranking: RankingService,
    private readonly realtime: RealtimeService,
  ) {}

  /** The open season of the club's primary sport, if any. */
  current(): Promise<RankingSeason | null> {
    return this.prisma.rankingSeason.findFirst({
      where: { sport: clubSettings().primarySport, closedAt: null },
    });
  }

  /** Closed seasons, newest first, each with its podium. */
  async list(): Promise<SeasonListItem[]> {
    const seasons = await this.prisma.rankingSeason.findMany({
      where: { sport: clubSettings().primarySport, closedAt: { not: null } },
      orderBy: { closedAt: "desc" },
      include: {
        standings: {
          where: { rank: { lte: 3 } },
          orderBy: { rank: "asc" },
          include: { user: { select: playerSelect() } },
        },
      },
    });
    return seasons.map((season) => ({
      season: toSeasonSummary(season),
      podium: season.standings.map(toStandingEntry),
    }));
  }

  async detail(id: string): Promise<SeasonDetail> {
    const season = await this.prisma.rankingSeason.findFirst({
      where: { id },
      include: {
        standings: { orderBy: { rank: "asc" }, include: { user: { select: playerSelect() } } },
      },
    });
    if (!season) throw notFound("SEASON_NOT_FOUND", "api.seasonNotFound");
    return { season: toSeasonSummary(season), standings: season.standings.map(toStandingEntry) };
  }

  /** Ends the open season (saving its table, resetting ratings) and starts a new one. */
  async start(input: StartSeasonInput): Promise<SeasonSummary> {
    const now = this.clock.now();
    const endsAt = this.endOf(input.endDate ?? null, now);
    return this.rollOver(input.name, endsAt, now);
  }

  async update(id: string, input: UpdateSeasonInput): Promise<SeasonSummary> {
    const season = await this.prisma.rankingSeason.findFirst({ where: { id } });
    if (!season) throw notFound("SEASON_NOT_FOUND", "api.seasonNotFound");
    if (season.closedAt) throw conflict("SEASON_CLOSED", "api.seasonClosed");
    const updated = await this.prisma.rankingSeason.update({
      where: { id },
      data: { name: input.name, endsAt: this.endOf(input.endDate, this.clock.now()) },
    });
    this.announce();
    return toSeasonSummary(updated);
  }

  /** Job: a season whose end date passed closes and the next one (no end date) starts. */
  async closeExpired(): Promise<{ closed: number }> {
    const now = this.clock.now();
    const season = await this.current();
    if (!season?.endsAt || season.endsAt > now) return { closed: 0 };
    const day = clubToday(now, clubTimeZone()).split("-").reverse().join("/");
    await this.rollOver(`Temporada ${day}`, null, now);
    return { closed: 1 };
  }

  /** Last day (club date) → the instant the season ends: the start of the next day. */
  private endOf(endDate: IsoDate | null, now: Date): Date | null {
    if (!endDate) return null;
    const endsAt = clubInstant(addDays(endDate, 1), "00:00", clubTimeZone());
    if (endsAt <= now) throw unprocessable("SEASON_END_PAST", "api.seasonEndPast");
    return endsAt;
  }

  private async rollOver(name: string, endsAt: Date | null, now: Date): Promise<SeasonSummary> {
    const { primarySport: sport, eloInitialRating } = clubSettings();
    const open = await this.current();
    // The final table: everyone who played in the season, by rating.
    const board = open ? await this.ranking.leaderboard(undefined, sport) : null;
    const played = (board?.entries ?? []).filter((entry) => entry.matches > 0);
    const created = await serializable(this.prisma, async (tx) => {
      if (open) {
        await tx.seasonStanding.createMany({
          data: played.map((entry) => ({
            seasonId: open.id,
            userId: entry.player.id,
            // Competition ranking among those who played: equal ratings share a place.
            rank: 1 + played.filter((other) => other.elo > entry.elo).length,
            elo: entry.elo,
            wins: entry.wins,
            losses: entry.losses,
          })),
          skipDuplicates: true,
        });
        await tx.rankingSeason.update({ where: { id: open.id }, data: { closedAt: now } });
        await tx.playerRating.updateMany({
          where: { sport },
          data: { elo: eloInitialRating, matches: 0 },
        });
      }
      return tx.rankingSeason.create({ data: { name, sport, startsAt: now, endsAt } });
    });
    this.announce();
    return toSeasonSummary(created);
  }

  private announce(): void {
    this.realtime.leaderboardUpdated({ matchId: "", userIds: [] });
  }
}

function toStandingEntry(row: {
  rank: number;
  elo: number;
  wins: number;
  losses: number;
  user: Parameters<typeof toPlayerSummary>[0];
}): SeasonStandingEntry {
  return {
    rank: row.rank,
    player: toPlayerSummary(row.user),
    elo: row.elo,
    wins: row.wins,
    losses: row.losses,
  };
}
