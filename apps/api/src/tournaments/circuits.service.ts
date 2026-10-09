import { Injectable } from "@nestjs/common";
import { EntryStatus, Prisma, TournamentStatus } from "@ficc/db";
import {
  type CircuitDetail,
  type CircuitInput,
  circuitRanking,
  type CircuitResult,
  type CircuitSummary,
  DEFAULT_POINTS_TABLE,
  fromDbDate,
  placementOf,
  type PointsTable,
  pointsTableSchema,
  type UpdateCircuitInput,
} from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { forbidden, notFound } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";

const circuitInclude = {
  categories: { orderBy: { sortOrder: "asc" } },
  tournaments: {
    select: { id: true, name: true, startDate: true, status: true },
    orderBy: { startDate: "asc" },
  },
} satisfies Prisma.CircuitInclude;

type CircuitRow = Prisma.CircuitGetPayload<{ include: typeof circuitInclude }>;

/** Player key, name and photo for rankings. */
interface PlayerInfo {
  name: string;
  photoUrl: string | null;
  userId: string | null;
}

/** Season rankings built from tournament placements; separate from the Elo ladder. */
@Injectable()
export class CircuitsService {
  constructor(private readonly prisma: PrismaService) {}

  private table(row: { pointsTable: Prisma.JsonValue }): PointsTable {
    const parsed = pointsTableSchema.safeParse(row.pointsTable);
    return parsed.success ? parsed.data : DEFAULT_POINTS_TABLE;
  }

  private summary(row: CircuitRow): CircuitSummary {
    return {
      id: row.id,
      name: row.name,
      season: row.season,
      categories: row.categories.map(({ id, name }) => ({ id, name })),
      stages: row.tournaments.map((tournament) => ({
        tournamentId: tournament.id,
        name: tournament.name,
        startDate: fromDbDate(tournament.startDate),
        status: tournament.status,
      })),
    };
  }

  async list(): Promise<CircuitSummary[]> {
    const rows = await this.prisma.circuit.findMany({
      include: circuitInclude,
      orderBy: [{ season: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.summary(row));
  }

  async detail(id: string): Promise<CircuitDetail> {
    const row = await this.prisma.circuit.findUnique({ where: { id }, include: circuitInclude });
    if (!row) throw notFound("CIRCUIT_NOT_FOUND", "api.circuitNotFound");
    const table = this.table(row);
    const rankings: CircuitDetail["rankings"] = [];
    for (const category of row.categories) {
      const { results, players } = await this.results(category.id);
      rankings.push({
        categoryId: category.id,
        categoryName: category.name,
        standings: circuitRanking(results, table).map((standing) => ({
          ...standing,
          ...(players.get(standing.playerKey) ?? {
            name: standing.playerKey,
            photoUrl: null,
            userId: null,
          }),
        })),
      });
    }
    return { ...this.summary(row), pointsTable: table, rankings };
  }

  async create(user: RequestUser, input: CircuitInput): Promise<CircuitDetail> {
    if (!can(user, "TOURNAMENTS_MANAGE")) throw forbidden("FORBIDDEN", "api.forbidden");
    const created = await this.prisma.circuit.create({
      data: {
        name: input.name,
        season: input.season,
        pointsTable: input.pointsTable as unknown as Prisma.InputJsonValue,
        categories: { create: input.categories.map((name, sortOrder) => ({ name, sortOrder })) },
      },
    });
    return this.detail(created.id);
  }

  async update(user: RequestUser, id: string, input: UpdateCircuitInput): Promise<CircuitDetail> {
    if (!can(user, "TOURNAMENTS_MANAGE")) throw forbidden("FORBIDDEN", "api.forbidden");
    const circuit = await this.prisma.circuit.findUnique({
      where: { id },
      include: { categories: true },
    });
    if (!circuit) throw notFound("CIRCUIT_NOT_FOUND", "api.circuitNotFound");
    const existing = new Set(circuit.categories.map((category) => category.name));
    await this.prisma.circuit.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.season ? { season: input.season } : {}),
        ...(input.pointsTable
          ? { pointsTable: input.pointsTable as unknown as Prisma.InputJsonValue }
          : {}),
        categories: {
          create: (input.addCategories ?? [])
            .filter((name) => !existing.has(name))
            .map((name, index) => ({ name, sortOrder: circuit.categories.length + index })),
        },
      },
    });
    return this.detail(id);
  }

  /** Total circuit points per player key in one circuit category (used for seeding). */
  async pointsByPlayer(circuitCategoryId: string): Promise<Map<string, number>> {
    const category = await this.prisma.circuitCategory.findUnique({
      where: { id: circuitCategoryId },
      include: { circuit: true },
    });
    if (!category) return new Map();
    const { results } = await this.results(circuitCategoryId);
    return new Map(
      circuitRanking(results, this.table(category.circuit)).map((row) => [
        row.playerKey,
        row.total,
      ]),
    );
  }

  /**
   * Placements of every player in the finished tournament categories linked to a circuit
   * category (one stage per tournament).
   */
  private async results(
    circuitCategoryId: string,
  ): Promise<{ results: CircuitResult[]; players: Map<string, PlayerInfo> }> {
    const categories = await this.prisma.tournamentCategory.findMany({
      where: {
        circuitCategoryId,
        championEntryId: { not: null },
        tournament: { status: { not: TournamentStatus.CANCELLED } },
      },
      include: {
        entries: {
          where: { status: EntryStatus.CONFIRMED },
          include: {
            players: { include: { user: { select: { id: true, name: true, photoUrl: true } } } },
          },
        },
        matches: {
          where: { stage: "KNOCKOUT", resultStatus: "CONFIRMED" },
          select: {
            round: true,
            entryAId: true,
            entryBId: true,
            winnerEntryId: true,
            outcome: true,
          },
        },
      },
    });
    const results: CircuitResult[] = [];
    const players = new Map<string, PlayerInfo>();
    for (const category of categories) {
      const rounds = category.matches.reduce((max, match) => Math.max(max, match.round), 0);
      for (const entry of category.entries) {
        const lost = category.matches.find(
          (match) =>
            match.winnerEntryId !== entry.id &&
            (match.entryAId === entry.id || match.entryBId === entry.id),
        );
        const placement = placementOf({
          rounds,
          lostInRound: lost ? lost.round : null,
          champion: category.championEntryId === entry.id,
        });
        for (const player of entry.players) {
          const key = player.userId ?? `guest:${(player.guestName ?? "").trim().toLowerCase()}`;
          players.set(key, {
            name: player.user?.name ?? player.guestName ?? key,
            photoUrl: player.user?.photoUrl ?? null,
            userId: player.userId,
          });
          results.push({ playerKey: key, stageId: category.tournamentId, placement });
        }
      }
    }
    return { results, players };
  }
}
