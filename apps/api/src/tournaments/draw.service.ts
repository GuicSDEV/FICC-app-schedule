import { Injectable } from "@nestjs/common";
import { EntryStatus, TeamSide, TournamentStatus } from "@ficc/db";
import {
  drawSeedCount,
  type DrawView,
  type GroupResult,
  groupCount,
  groupPots,
  groupStandings,
  knockoutFirstRound,
  knockoutPots,
  knockoutSeedsFromGroups,
  roundCount,
  roundName,
  snakeGroups,
  roundRobin,
  shuffleWithinPots,
} from "@ficc/shared";

import type { RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, notFound, unprocessable } from "../common/domain.exception";
import { Random } from "../common/random";
import { serializable, type Tx } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { EntriesService } from "./entries.service";
import { TournamentContextService } from "./tournament-context.service";
import {
  entryInclude,
  lightEntry,
  parseSets,
  tMatchInclude,
  type TMatchRow,
} from "./tournament.mappers";
import { TournamentsService } from "./tournaments.service";

const GROUP_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Draw statuses where a category's draw may be (re)generated. */
const DRAW_STATUSES: TournamentStatus[] = [
  TournamentStatus.REGISTRATION_CLOSED,
  TournamentStatus.DRAW_PUBLISHED,
  TournamentStatus.IN_PROGRESS,
];

/** Results of a group as the standings need them. */
export function groupResults(
  matches:
    | readonly TMatchRow[]
    | readonly {
        entryAId: string | null;
        entryBId: string | null;
        winnerEntryId: string | null;
        resultStatus: string;
        outcome: string | null;
        sets: unknown;
      }[],
): GroupResult[] {
  return matches.flatMap((match) =>
    match.resultStatus === "CONFIRMED" && match.entryAId && match.entryBId && match.winnerEntryId
      ? [
          {
            a: match.entryAId,
            b: match.entryBId,
            winner: match.winnerEntryId,
            sets: parseSets(match.sets as never),
            walkover: match.outcome === "WALKOVER" || match.outcome === "DISQUALIFIED",
          },
        ]
      : [],
  );
}

@Injectable()
export class DrawService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly random: Random,
    private readonly access: TournamentContextService,
    private readonly entries: EntriesService,
    private readonly tournaments: TournamentsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Builds (or rebuilds) the draft draw of a category from its confirmed entries. Seeds and byes
   * keep their protected places; everyone else is drawn by lot, a new lot on every call.
   */
  async generate(viewer: RequestUser, categoryId: string): Promise<DrawView> {
    const tournamentId = await this.access.tournamentOfCategory(categoryId);
    await this.access.assertCanManage(viewer, tournamentId);
    const category = await this.prisma.tournamentCategory.findUniqueOrThrow({
      where: { id: categoryId },
      include: { tournament: true },
    });
    if (!DRAW_STATUSES.includes(category.tournament.status)) {
      throw conflict("REGISTRATION_OPEN", "api.drawNeedsClosedRegistration");
    }
    if (category.drawPublishedAt) throw conflict("DRAW_PUBLISHED", "api.drawPublished");
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { categoryId, status: EntryStatus.CONFIRMED },
      include: {
        ...entryInclude(),
        category: { select: { seeding: true, circuitCategoryId: true } },
      },
    });
    if (entries.length < 2) throw unprocessable("NOT_ENOUGH_ENTRIES", "api.notEnoughEntries");
    const ratings = await this.entries.ratings(entries);
    const seeded = [...entries].sort(
      (a, b) =>
        (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER) ||
        (ratings.get(b.id) ?? 0) - (ratings.get(a.id) ?? 0) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const ranked = seeded.map((entry) => entry.id);
    const knockout = category.drawFormat === "SINGLE_ELIMINATION";
    const groupTotal = groupCount(ranked.length, category.groupSize);
    const pots = knockout ? knockoutPots(ranked.length) : groupPots(ranked.length, groupTotal);
    const ids = shuffleWithinPots(ranked, pots, () => this.random.next());

    await serializable(this.prisma, async (tx) => {
      await this.clear(tx, categoryId);
      // Seeds shown in the draw: the top quarter of the field (at least 2), by rank.
      const seeds = drawSeedCount(ranked.length);
      for (const [index, id] of ranked.entries()) {
        await tx.tournamentEntry.update({
          where: { id },
          data: { seed: index < seeds ? index + 1 : null },
        });
      }
      if (knockout) {
        await this.createKnockout(tx, { tournamentId, categoryId }, this.positions(ids));
      } else {
        const groups = snakeGroups(ids, groupTotal);
        for (const [index, members] of groups.entries()) {
          await this.createGroup(
            tx,
            { tournamentId, categoryId },
            GROUP_NAMES[index]!,
            index,
            members,
          );
        }
      }
      await tx.tournamentCategory.update({
        where: { id: categoryId },
        data: { drawGeneratedAt: this.clock.now() },
      });
    });
    this.realtime.tournamentUpdated({ tournamentId, categoryId, kind: "draw" });
    return this.view(viewer, categoryId);
  }

  private positions(seededIds: string[]): (string | null)[] {
    return knockoutFirstRound(seededIds).flatMap((pair) => [pair.a, pair.b]);
  }

  private async clear(tx: Tx, categoryId: string): Promise<void> {
    await tx.tournamentMatch.deleteMany({ where: { categoryId } });
    await tx.tournamentGroup.deleteMany({ where: { categoryId } });
  }

  /**
   * Creates every knockout match for these first-round positions (pairs in order, null = bye),
   * links each match to the one its winner moves on to, and sends bye winners through.
   */
  async createKnockout(
    tx: Tx,
    refs: { tournamentId: string; categoryId: string },
    positions: (string | null)[],
  ): Promise<void> {
    const size = positions.length;
    const rounds = roundCount(size);
    let later: { id: string }[] = [];
    for (let round = rounds; round >= 1; round -= 1) {
      const count = size / 2 ** round;
      const created: { id: string }[] = [];
      for (let position = 0; position < count; position += 1) {
        const next = round < rounds ? later[Math.floor(position / 2)] : undefined;
        created.push(
          await tx.tournamentMatch.create({
            data: {
              ...refs,
              stage: "KNOCKOUT",
              round,
              position,
              nextMatchId: next?.id ?? null,
              nextSide: next ? (position % 2 === 0 ? TeamSide.A : TeamSide.B) : null,
              ...(round === 1
                ? {
                    entryAId: positions[position * 2] ?? null,
                    entryBId: positions[position * 2 + 1] ?? null,
                  }
                : {}),
            },
            select: { id: true },
          }),
        );
      }
      later = created;
    }
    // Byes: the entry with no opponent goes straight to round 2.
    const firstRound = await tx.tournamentMatch.findMany({
      where: { categoryId: refs.categoryId, stage: "KNOCKOUT", round: 1 },
    });
    const now = this.clock.now();
    for (const match of firstRound) {
      const lone =
        match.entryAId && !match.entryBId
          ? match.entryAId
          : !match.entryAId && match.entryBId
            ? match.entryBId
            : null;
      if (!lone) continue;
      await tx.tournamentMatch.update({
        where: { id: match.id },
        data: { winnerEntryId: lone, outcome: "BYE", resultStatus: "CONFIRMED", confirmedAt: now },
      });
      if (match.nextMatchId) {
        await tx.tournamentMatch.update({
          where: { id: match.nextMatchId },
          data: match.nextSide === TeamSide.A ? { entryAId: lone } : { entryBId: lone },
        });
      }
    }
  }

  private async createGroup(
    tx: Tx,
    refs: { tournamentId: string; categoryId: string },
    name: string,
    sortOrder: number,
    members: string[],
  ): Promise<void> {
    const group = await tx.tournamentGroup.create({
      data: {
        categoryId: refs.categoryId,
        name,
        sortOrder,
        members: { create: members.map((entryId, position) => ({ entryId, position })) },
      },
    });
    await this.createFixtures(tx, refs, group.id, members);
  }

  private async createFixtures(
    tx: Tx,
    refs: { tournamentId: string; categoryId: string },
    groupId: string,
    members: string[],
  ): Promise<void> {
    for (const [round, pairs] of roundRobin(members).entries()) {
      for (const [position, [a, b]] of pairs.entries()) {
        await tx.tournamentMatch.create({
          data: {
            ...refs,
            stage: "GROUP",
            groupId,
            round: round + 1,
            position,
            entryAId: a,
            entryBId: b,
          },
        });
      }
    }
  }

  /** Swaps two entries in a draft draw (knockout positions, or groups). */
  async swap(
    viewer: RequestUser,
    categoryId: string,
    entryA: string,
    entryB: string,
  ): Promise<DrawView> {
    const tournamentId = await this.access.tournamentOfCategory(categoryId);
    await this.access.assertCanManage(viewer, tournamentId);
    const category = await this.prisma.tournamentCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });
    if (!category.drawGeneratedAt) throw conflict("DRAW_NOT_GENERATED", "api.drawNotGenerated");
    if (category.drawPublishedAt) throw conflict("DRAW_PUBLISHED", "api.drawPublished");
    await serializable(this.prisma, async (tx) => {
      const refs = { tournamentId, categoryId };
      if (category.drawFormat === "SINGLE_ELIMINATION") {
        const firstRound = await tx.tournamentMatch.findMany({
          where: { categoryId, stage: "KNOCKOUT", round: 1 },
          orderBy: { position: "asc" },
        });
        const positions = firstRound.flatMap((match) => [match.entryAId, match.entryBId]);
        const ia = positions.indexOf(entryA);
        const ib = positions.indexOf(entryB);
        if (ia < 0 || ib < 0) throw unprocessable("ENTRY_NOT_IN_DRAW", "api.entryNotInDraw");
        [positions[ia], positions[ib]] = [positions[ib]!, positions[ia]!];
        await tx.tournamentMatch.deleteMany({ where: { categoryId } });
        await this.createKnockout(tx, refs, positions);
      } else {
        const members = await tx.tournamentGroupMember.findMany({
          where: { group: { categoryId }, entryId: { in: [entryA, entryB] } },
        });
        const a = members.find((member) => member.entryId === entryA);
        const b = members.find((member) => member.entryId === entryB);
        if (!a || !b) throw unprocessable("ENTRY_NOT_IN_DRAW", "api.entryNotInDraw");
        if (a.groupId === b.groupId) return;
        await tx.tournamentGroupMember.delete({
          where: { groupId_entryId: { groupId: a.groupId, entryId: entryA } },
        });
        await tx.tournamentGroupMember.delete({
          where: { groupId_entryId: { groupId: b.groupId, entryId: entryB } },
        });
        await tx.tournamentGroupMember.create({
          data: { groupId: a.groupId, entryId: entryB, position: a.position },
        });
        await tx.tournamentGroupMember.create({
          data: { groupId: b.groupId, entryId: entryA, position: b.position },
        });
        for (const groupId of [a.groupId, b.groupId]) {
          await tx.tournamentMatch.deleteMany({ where: { groupId } });
          const list = await tx.tournamentGroupMember.findMany({
            where: { groupId },
            orderBy: { position: "asc" },
          });
          await this.createFixtures(
            tx,
            refs,
            groupId,
            list.map((member) => member.entryId),
          );
        }
      }
    });
    this.realtime.tournamentUpdated({ tournamentId, categoryId, kind: "draw" });
    return this.view(viewer, categoryId);
  }

  /** Publishes the draw: entrants see it and get notified. */
  async publish(viewer: RequestUser, categoryId: string): Promise<DrawView> {
    const tournamentId = await this.access.tournamentOfCategory(categoryId);
    await this.access.assertCanManage(viewer, tournamentId);
    const category = await this.prisma.tournamentCategory.findUniqueOrThrow({
      where: { id: categoryId },
      include: { tournament: true },
    });
    if (!category.drawGeneratedAt) throw conflict("DRAW_NOT_GENERATED", "api.drawNotGenerated");
    if (category.drawPublishedAt) throw conflict("DRAW_PUBLISHED", "api.drawPublished");
    await this.prisma.tournamentCategory.update({
      where: { id: categoryId },
      data: { drawPublishedAt: this.clock.now() },
    });
    const players = await this.prisma.tournamentEntryPlayer.findMany({
      where: { userId: { not: null }, entry: { categoryId, status: EntryStatus.CONFIRMED } },
      select: { userId: true },
    });
    await this.notifications.notify(
      players.map((player) => player.userId!),
      "TOURNAMENT_DRAW_PUBLISHED",
      { tournamentId, tournamentName: category.tournament.name, categoryName: category.name },
    );
    await this.tournaments.advanceStatus(tournamentId);
    this.realtime.tournamentUpdated({ tournamentId, categoryId, kind: "draw" });
    return this.view(viewer, categoryId);
  }

  /**
   * When every group match of a category is decided, builds its knockout from the group tables.
   * Returns the entries that went through and those knocked out (empty when nothing changed).
   */
  async knockoutFromGroups(
    tx: Tx,
    categoryId: string,
  ): Promise<{ advanced: string[]; eliminated: string[] }> {
    const none = { advanced: [], eliminated: [] };
    const category = await tx.tournamentCategory.findUniqueOrThrow({ where: { id: categoryId } });
    if (category.drawFormat !== "GROUPS_THEN_KNOCKOUT") return none;
    const existing = await tx.tournamentMatch.count({ where: { categoryId, stage: "KNOCKOUT" } });
    if (existing > 0) return none;
    const groups = await tx.tournamentGroup.findMany({
      where: { categoryId },
      include: { members: { orderBy: { position: "asc" } }, matches: true },
      orderBy: { sortOrder: "asc" },
    });
    if (groups.some((group) => group.matches.some((match) => match.resultStatus !== "CONFIRMED")))
      return none;
    const tables = groups.map((group) =>
      groupStandings(
        group.members.map((member) => member.entryId),
        groupResults(group.matches),
      ).map((row) => row.entryId),
    );
    const seeds = knockoutSeedsFromGroups(tables, category.advancePerGroup);
    const all = tables.flat();
    if (seeds.length < 2) {
      // A single qualifier wins the category outright.
      if (seeds[0])
        await tx.tournamentCategory.update({
          where: { id: categoryId },
          data: { championEntryId: seeds[0] },
        });
      return { advanced: seeds, eliminated: all.filter((id) => !seeds.includes(id)) };
    }
    await this.createKnockout(
      tx,
      { tournamentId: category.tournamentId, categoryId },
      this.positions(seeds),
    );
    return { advanced: seeds, eliminated: all.filter((id) => !seeds.includes(id)) };
  }

  /** The draw as players see it (empty until published, except for organizers). */
  async view(
    viewer: RequestUser | undefined,
    categoryId: string,
    canManageHint?: boolean,
  ): Promise<DrawView> {
    const tournamentId = await this.access.tournamentOfCategory(categoryId);
    const canManage = canManageHint ?? (await this.access.canManage(viewer, tournamentId));
    const [info] = (await this.tournaments.categoryInfos(tournamentId)).filter(
      (entry) => entry.id === categoryId,
    );
    if (!info) throw notFound("TOURNAMENT_CATEGORY_NOT_FOUND", "api.tournamentCategoryNotFound");
    if (!info.drawPublished && !canManage) {
      return { category: info, groups: [], rounds: [], championEntryId: null };
    }
    const [groups, matches] = await Promise.all([
      this.prisma.tournamentGroup.findMany({
        where: { categoryId },
        include: {
          members: {
            include: { entry: { include: entryInclude() } },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.tournamentMatch.findMany({
        where: { categoryId },
        include: tMatchInclude(),
        orderBy: [{ stage: "asc" }, { round: "asc" }, { position: "asc" }],
      }),
    ]);
    const views = await this.access.views(matches, viewer, canManage);
    const viewById = new Map(views.map((view) => [view.id, view]));
    const knockout = matches.filter((match) => match.stage === "KNOCKOUT");
    const rounds = knockout.reduce((max, match) => Math.max(max, match.round), 0);
    return {
      category: info,
      groups: groups.map((group) => {
        const groupMatches = matches.filter((match) => match.groupId === group.id);
        const table = groupStandings(
          group.members.map((member) => member.entryId),
          groupResults(groupMatches),
        );
        const entries = new Map(group.members.map((member) => [member.entryId, member.entry]));
        return {
          id: group.id,
          name: group.name,
          standings: table.map((row) => ({
            ...row,
            entry: lightEntry(entries.get(row.entryId) ?? null)!,
          })),
          matches: groupMatches.map((match) => viewById.get(match.id)!),
          finished: groupMatches.every((match) => match.resultStatus === "CONFIRMED"),
        };
      }),
      rounds: Array.from({ length: rounds }, (_, index) => index + 1).map((round) => ({
        round,
        name: roundName(round, rounds),
        matches: knockout
          .filter((match) => match.round === round)
          .map((match) => viewById.get(match.id)!),
      })),
      championEntryId: info.championEntryId,
    };
  }
}
