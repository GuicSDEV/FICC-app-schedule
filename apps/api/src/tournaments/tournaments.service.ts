import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { EntryStatus, Prisma, Role, TournamentStatus } from "@ficc/db";
import {
  addDays,
  type Announcement,
  type AnnouncementInput,
  clubToday,
  type CreateTournamentInput,
  fromDbDate,
  type MyTournamentItem,
  type PlayerTitle,
  type TournamentCategoryInfo,
  type TournamentCategoryInput,
  type TournamentDetail,
  type TournamentListQuery,
  type TournamentSummary,
  toDbDate,
  TOURNAMENT_TRANSITIONS,
  type UpdateTournamentInput,
} from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, localize, notFound, unprocessable } from "../common/domain.exception";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { clubTimeZone } from "../tenancy/tenant-context";
import { TournamentContextService } from "./tournament-context.service";
import {
  entryInclude,
  tMatchInclude,
  toEntrySummary,
  entryName,
  toTournamentPlayer,
} from "./tournament.mappers";

/** Entries that hold a place in a category. */
export const ACTIVE_ENTRY_STATUSES: EntryStatus[] = [
  EntryStatus.PENDING_PARTNER,
  EntryStatus.PENDING_APPROVAL,
  EntryStatus.CONFIRMED,
  EntryStatus.WAITLISTED,
];

const TRANSITIONS = TOURNAMENT_TRANSITIONS;

const tournamentListInclude = {
  categories: {
    select: { id: true, name: true, entryType: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  },
  circuit: { select: { id: true, name: true } },
} satisfies Prisma.TournamentInclude;

type TournamentListRow = Prisma.TournamentGetPayload<{ include: typeof tournamentListInclude }>;

export function isRegistrationOpen(
  tournament: {
    status: TournamentStatus;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
  },
  now: Date,
): boolean {
  return (
    tournament.status === TournamentStatus.REGISTRATION_OPEN &&
    (tournament.registrationOpensAt === null || tournament.registrationOpensAt <= now) &&
    (tournament.registrationClosesAt === null || tournament.registrationClosesAt > now)
  );
}

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly access: TournamentContextService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ── reading ────────────────────────────────────────────────────────────────

  async list(viewer: RequestUser, query: TournamentListQuery): Promise<TournamentSummary[]> {
    const organizing = can(viewer, "TOURNAMENTS_MANAGE")
      ? null
      : (await this.prisma.tournamentOrganizer.findMany({ where: { userId: viewer.id } })).map(
          (row) => row.tournamentId,
        );
    const statusFilter: Prisma.TournamentWhereInput = (() => {
      switch (query.status) {
        case "OPEN":
          return { status: TournamentStatus.REGISTRATION_OPEN };
        case "UPCOMING":
          return {
            status: { in: [TournamentStatus.REGISTRATION_CLOSED, TournamentStatus.DRAW_PUBLISHED] },
          };
        case "IN_PROGRESS":
          return { status: TournamentStatus.IN_PROGRESS };
        case "FINISHED":
          return { status: TournamentStatus.FINISHED };
        default:
          return {};
      }
    })();
    // Drafts and cancelled tournaments are only listed for the people who run them.
    const visibility: Prisma.TournamentWhereInput =
      organizing === null
        ? {}
        : {
            OR: [
              { status: { notIn: [TournamentStatus.DRAFT, TournamentStatus.CANCELLED] } },
              { id: { in: organizing } },
            ],
          };
    const rows = await this.prisma.tournament.findMany({
      where: { AND: [statusFilter, visibility] },
      include: tournamentListInclude,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    });
    return this.summaries(rows, viewer.id);
  }

  async detail(viewer: RequestUser | undefined, id: string): Promise<TournamentDetail> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        ...tournamentListInclude,
        organizers: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!tournament) throw notFound("TOURNAMENT_NOT_FOUND", "api.tournamentNotFound");
    const canManage = await this.access.canManage(viewer, id);
    if (!canManage && tournament.status === TournamentStatus.DRAFT) {
      throw notFound("TOURNAMENT_NOT_FOUND", "api.tournamentNotFound");
    }
    const [summary] = await this.summaries([tournament], viewer?.id);
    const categories = await this.categoryInfos(id);
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { category: { tournamentId: id }, status: { in: ACTIVE_ENTRY_STATUSES } },
      include: entryInclude(),
      orderBy: [{ seed: "asc" }, { createdAt: "asc" }],
    });
    const mine = viewer
      ? entries.filter((entry) => entry.players.some((player) => player.userId === viewer.id))
      : [];
    const byCategory: TournamentDetail["entries"] = {};
    for (const category of categories) byCategory[category.id] = [];
    for (const entry of entries) {
      if (entry.status !== EntryStatus.CONFIRMED && entry.status !== EntryStatus.WAITLISTED)
        continue;
      byCategory[entry.categoryId]?.push({
        id: entry.id,
        name: entryName(entry.players.map(toTournamentPlayer)),
        seed: entry.seed,
        status: entry.status,
      });
    }
    return {
      ...summary!,
      description: tournament.description,
      sponsorLogos: tournament.sponsorLogos,
      allowGuests: tournament.allowGuests,
      feeAmountCents: tournament.feeAmountCents,
      requiresApproval: tournament.requiresApproval,
      restMinutes: tournament.restMinutes,
      courtIds: tournament.courtIds,
      categories,
      organizers: tournament.organizers.map((row) => row.user),
      canManage,
      myEntries: mine.map((entry) => toEntrySummary(entry, { private: true })),
      announcements: await this.announcements(id),
      entries: byCategory,
    };
  }

  async categoryInfos(tournamentId: string): Promise<TournamentCategoryInfo[]> {
    const categories = await this.prisma.tournamentCategory.findMany({
      where: { tournamentId },
      include: {
        circuitCategory: { select: { name: true } },
        _count: { select: { entries: { where: { status: EntryStatus.CONFIRMED } } } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const waitlisted = await this.prisma.tournamentEntry.groupBy({
      by: ["categoryId"],
      where: { category: { tournamentId }, status: EntryStatus.WAITLISTED },
      _count: true,
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      entryType: category.entryType,
      drawFormat: category.drawFormat,
      groupSize: category.groupSize,
      advancePerGroup: category.advancePerGroup,
      maxEntries: category.maxEntries,
      scoreFormat: category.scoreFormat,
      countsForElo: category.countsForElo,
      seeding: category.seeding,
      circuitCategoryId: category.circuitCategoryId,
      circuitCategoryName: category.circuitCategory?.name ?? null,
      drawGenerated: category.drawGeneratedAt !== null,
      drawPublished: category.drawPublishedAt !== null,
      confirmedEntries: category._count.entries,
      waitlisted: waitlisted.find((row) => row.categoryId === category.id)?._count ?? 0,
      championEntryId: category.championEntryId,
    }));
  }

  private async summaries(
    rows: TournamentListRow[],
    viewerId: string | undefined,
  ): Promise<TournamentSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [counts, mine] = await Promise.all([
      this.prisma.tournamentEntry.groupBy({
        by: ["categoryId"],
        where: { category: { tournamentId: { in: ids } }, status: EntryStatus.CONFIRMED },
        _count: true,
      }),
      viewerId
        ? this.prisma.tournamentEntry.findMany({
            where: {
              category: { tournamentId: { in: ids } },
              status: { in: ACTIVE_ENTRY_STATUSES },
              players: { some: { userId: viewerId } },
            },
            select: { status: true, category: { select: { tournamentId: true } } },
          })
        : Promise.resolve([]),
    ]);
    const now = this.clock.now();
    return rows.map((row) => ({
      id: row.id,
      publicId: row.publicId,
      name: row.name,
      coverImageUrl: row.coverImageUrl,
      status: row.status,
      startDate: fromDbDate(row.startDate),
      endDate: fromDbDate(row.endDate),
      location: row.location,
      registrationOpensAt: row.registrationOpensAt?.toISOString() ?? null,
      registrationClosesAt: row.registrationClosesAt?.toISOString() ?? null,
      registrationOpen: isRegistrationOpen(row, now),
      categories: row.categories.map(({ id, name, entryType }) => ({ id, name, entryType })),
      entrants: counts
        .filter((count) => row.categories.some((category) => category.id === count.categoryId))
        .reduce((sum, count) => sum + count._count, 0),
      circuit: row.circuit,
      myEntryStatus: mine.find((entry) => entry.category.tournamentId === row.id)?.status ?? null,
    }));
  }

  // ── organizer: tournament ─────────────────────────────────────────────────

  async create(user: RequestUser, input: CreateTournamentInput): Promise<TournamentDetail> {
    if (!can(user, "TOURNAMENTS_MANAGE")) throw forbidden("FORBIDDEN", "api.forbidden");
    await this.assertCircuit(input.circuitId);
    const created = await this.prisma.tournament.create({
      data: {
        ...this.tournamentData(input),
        publicId: randomBytes(9).toString("base64url"),
        createdById: user.id,
      },
    });
    return this.detail(user, created.id);
  }

  async update(
    user: RequestUser,
    id: string,
    input: UpdateTournamentInput,
  ): Promise<TournamentDetail> {
    await this.access.assertCanManage(user, id);
    if (input.circuitId !== undefined) await this.assertCircuit(input.circuitId);
    const current = await this.prisma.tournament.findUniqueOrThrow({ where: { id } });
    const start = input.startDate ?? fromDbDate(current.startDate);
    const end = input.endDate ?? fromDbDate(current.endDate);
    if (end < start) throw unprocessable("INVALID_RANGE", "validation.invalidRange");
    await this.prisma.tournament.update({ where: { id }, data: this.tournamentData(input) });
    this.realtime.tournamentUpdated({ tournamentId: id, categoryId: null, kind: "info" });
    return this.detail(user, id);
  }

  private tournamentData(
    input: UpdateTournamentInput,
  ): Prisma.TournamentUncheckedUpdateInput & Prisma.TournamentUncheckedCreateInput {
    const data: Record<string, unknown> = { ...input };
    if (input.startDate) data.startDate = toDbDate(input.startDate);
    if (input.endDate) data.endDate = toDbDate(input.endDate);
    if (input.registrationOpensAt !== undefined)
      data.registrationOpensAt = input.registrationOpensAt
        ? new Date(input.registrationOpensAt)
        : null;
    if (input.registrationClosesAt !== undefined)
      data.registrationClosesAt = input.registrationClosesAt
        ? new Date(input.registrationClosesAt)
        : null;
    return data as Prisma.TournamentUncheckedUpdateInput & Prisma.TournamentUncheckedCreateInput;
  }

  private async assertCircuit(circuitId: string | null | undefined): Promise<void> {
    if (!circuitId) return;
    const circuit = await this.prisma.circuit.findUnique({ where: { id: circuitId } });
    if (!circuit) throw notFound("CIRCUIT_NOT_FOUND", "api.circuitNotFound");
  }

  async setStatus(
    user: RequestUser,
    id: string,
    status: TournamentStatus,
  ): Promise<TournamentDetail> {
    await this.access.assertCanManage(user, id);
    const tournament = await this.prisma.tournament.findUniqueOrThrow({ where: { id } });
    if (tournament.status !== status && !TRANSITIONS[tournament.status].includes(status)) {
      throw conflict("STATUS_TRANSITION", {
        key: "api.statusTransition",
        params: {
          from: localize(`labels.tournamentStatus.${tournament.status}`),
          to: localize(`labels.tournamentStatus.${status}`),
        },
      });
    }
    await this.prisma.tournament.update({ where: { id }, data: { status } });
    this.realtime.tournamentUpdated({ tournamentId: id, categoryId: null, kind: "info" });
    return this.detail(user, id);
  }

  /** Moves a tournament forward on its own (draw published, first result, last final). */
  async advanceStatus(tournamentId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { categories: { select: { drawPublishedAt: true, championEntryId: true } } },
    });
    if (!tournament || tournament.categories.length === 0) return;
    const allPublished = tournament.categories.every((category) => category.drawPublishedAt);
    const allChampions = tournament.categories.every((category) => category.championEntryId);
    const anyResult = await this.prisma.tournamentMatch.count({
      where: { tournamentId, resultStatus: "CONFIRMED", NOT: { outcome: "BYE" } },
    });
    let next: TournamentStatus | null = null;
    if (allChampions && tournament.status !== TournamentStatus.FINISHED)
      next = TournamentStatus.FINISHED;
    else if (
      anyResult > 0 &&
      (
        [
          TournamentStatus.REGISTRATION_CLOSED,
          TournamentStatus.DRAW_PUBLISHED,
        ] as TournamentStatus[]
      ).includes(tournament.status)
    )
      next = TournamentStatus.IN_PROGRESS;
    else if (allPublished && tournament.status === TournamentStatus.REGISTRATION_CLOSED)
      next = TournamentStatus.DRAW_PUBLISHED;
    if (next && next !== tournament.status) {
      await this.prisma.tournament.update({ where: { id: tournamentId }, data: { status: next } });
    }
  }

  async setOrganizers(user: RequestUser, id: string, userIds: string[]): Promise<TournamentDetail> {
    if (!can(user, "TOURNAMENTS_MANAGE")) throw forbidden("FORBIDDEN", "api.forbidden");
    const members = await this.prisma.user.findMany({
      where: { id: { in: userIds }, role: Role.MEMBER, isActive: true },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.tournamentOrganizer.deleteMany({ where: { tournamentId: id } }),
      this.prisma.tournamentOrganizer.createMany({
        data: members.map((member) => ({ tournamentId: id, userId: member.id })),
      }),
    ]);
    return this.detail(user, id);
  }

  /** A new DRAFT with the same settings and categories (no entries, no draw). */
  async duplicate(user: RequestUser, id: string): Promise<TournamentDetail> {
    if (!can(user, "TOURNAMENTS_MANAGE")) throw forbidden("FORBIDDEN", "api.forbidden");
    const source = await this.prisma.tournament.findUnique({
      where: { id },
      include: { categories: true },
    });
    if (!source) throw notFound("TOURNAMENT_NOT_FOUND", "api.tournamentNotFound");
    const copy = await this.prisma.tournament.create({
      data: {
        publicId: randomBytes(9).toString("base64url"),
        name: localize({ key: "api.tournamentCopyName", params: { name: source.name } }).slice(
          0,
          80,
        ),
        description: source.description,
        coverImageUrl: source.coverImageUrl,
        sponsorLogos: source.sponsorLogos,
        startDate: source.startDate,
        endDate: source.endDate,
        location: source.location,
        courtIds: source.courtIds,
        allowGuests: source.allowGuests,
        feeAmountCents: source.feeAmountCents,
        requiresApproval: source.requiresApproval,
        restMinutes: source.restMinutes,
        circuitId: source.circuitId,
        createdById: user.id,
        categories: {
          create: source.categories.map((category) => ({
            name: category.name,
            entryType: category.entryType,
            drawFormat: category.drawFormat,
            groupSize: category.groupSize,
            advancePerGroup: category.advancePerGroup,
            maxEntries: category.maxEntries,
            scoreFormat: category.scoreFormat,
            countsForElo: category.countsForElo,
            seeding: category.seeding,
            circuitCategoryId: category.circuitCategoryId,
            sortOrder: category.sortOrder,
          })),
        },
      },
    });
    return this.detail(user, copy.id);
  }

  // ── organizer: categories ─────────────────────────────────────────────────

  async addCategory(
    user: RequestUser,
    tournamentId: string,
    input: TournamentCategoryInput,
  ): Promise<TournamentDetail> {
    await this.access.assertCanManage(user, tournamentId);
    await this.assertCircuitCategory(tournamentId, input.circuitCategoryId);
    const count = await this.prisma.tournamentCategory.count({ where: { tournamentId } });
    await this.prisma.tournamentCategory.create({
      data: { ...input, tournamentId, sortOrder: count },
    });
    this.realtime.tournamentUpdated({ tournamentId, categoryId: null, kind: "info" });
    return this.detail(user, tournamentId);
  }

  async updateCategory(
    user: RequestUser,
    categoryId: string,
    input: TournamentCategoryInput,
  ): Promise<TournamentDetail> {
    const tournamentId = await this.access.tournamentOfCategory(categoryId);
    await this.access.assertCanManage(user, tournamentId);
    await this.assertCircuitCategory(tournamentId, input.circuitCategoryId);
    const category = await this.prisma.tournamentCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });
    const structural =
      category.entryType !== input.entryType ||
      category.drawFormat !== input.drawFormat ||
      category.groupSize !== input.groupSize ||
      category.advancePerGroup !== input.advancePerGroup;
    if (category.drawGeneratedAt && structural) {
      throw conflict("CATEGORY_LOCKED", "api.categoryLocked");
    }
    if (category.entryType !== input.entryType) {
      const entries = await this.prisma.tournamentEntry.count({
        where: { categoryId, status: { in: ACTIVE_ENTRY_STATUSES } },
      });
      if (entries > 0) throw conflict("CATEGORY_LOCKED", "api.categoryLocked");
    }
    await this.prisma.tournamentCategory.update({ where: { id: categoryId }, data: input });
    this.realtime.tournamentUpdated({ tournamentId, categoryId, kind: "info" });
    return this.detail(user, tournamentId);
  }

  async deleteCategory(user: RequestUser, categoryId: string): Promise<TournamentDetail> {
    const tournamentId = await this.access.tournamentOfCategory(categoryId);
    await this.access.assertCanManage(user, tournamentId);
    const entries = await this.prisma.tournamentEntry.count({
      where: { categoryId, status: { in: ACTIVE_ENTRY_STATUSES } },
    });
    const category = await this.prisma.tournamentCategory.findUniqueOrThrow({
      where: { id: categoryId },
    });
    if (entries > 0 || category.drawGeneratedAt)
      throw conflict("CATEGORY_LOCKED", "api.categoryLocked");
    await this.prisma.tournamentCategory.delete({ where: { id: categoryId } });
    return this.detail(user, tournamentId);
  }

  private async assertCircuitCategory(
    tournamentId: string,
    circuitCategoryId: string | null,
  ): Promise<void> {
    if (!circuitCategoryId) return;
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
    });
    const category = await this.prisma.circuitCategory.findUnique({
      where: { id: circuitCategoryId },
    });
    if (!category || category.circuitId !== tournament.circuitId) {
      throw notFound("CIRCUIT_CATEGORY_NOT_FOUND", "api.circuitCategoryNotFound");
    }
  }

  // ── announcements ──────────────────────────────────────────────────────────

  async announcements(tournamentId: string): Promise<Announcement[]> {
    const rows = await this.prisma.tournamentAnnouncement.findMany({
      where: { tournamentId },
      include: { author: { select: { name: true } }, category: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return rows.map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      body: row.body,
      authorName: row.author.name,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Posts an announcement and notifies every entrant (of one category, or of the tournament). */
  async announce(
    user: RequestUser,
    tournamentId: string,
    input: AnnouncementInput,
  ): Promise<Announcement[]> {
    await this.access.assertCanManage(user, tournamentId);
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
    });
    let categoryName: string | null = null;
    if (input.categoryId) {
      const category = await this.prisma.tournamentCategory.findUnique({
        where: { id: input.categoryId },
      });
      if (!category || category.tournamentId !== tournamentId) {
        throw notFound("TOURNAMENT_CATEGORY_NOT_FOUND", "api.tournamentCategoryNotFound");
      }
      categoryName = category.name;
    }
    await this.prisma.tournamentAnnouncement.create({
      data: {
        tournamentId,
        categoryId: input.categoryId ?? null,
        authorId: user.id,
        body: input.body,
      },
    });
    const players = await this.prisma.tournamentEntryPlayer.findMany({
      where: {
        userId: { not: null },
        entry: {
          status: { in: ACTIVE_ENTRY_STATUSES },
          category: input.categoryId ? { id: input.categoryId } : { tournamentId },
        },
      },
      select: { userId: true },
    });
    await this.notifications.notify(
      players.map((player) => player.userId!),
      "TOURNAMENT_ANNOUNCEMENT",
      { tournamentId, tournamentName: tournament.name, body: input.body, categoryName },
    );
    this.realtime.tournamentUpdated({
      tournamentId,
      categoryId: input.categoryId ?? null,
      kind: "info",
    });
    return this.announcements(tournamentId);
  }

  // ── the member's own tournaments ──────────────────────────────────────────

  async mine(viewer: RequestUser): Promise<MyTournamentItem[]> {
    const entries = await this.prisma.tournamentEntry.findMany({
      where: {
        status: { in: ACTIVE_ENTRY_STATUSES },
        players: { some: { userId: viewer.id } },
        category: {
          tournament: { status: { notIn: [TournamentStatus.CANCELLED, TournamentStatus.DRAFT] } },
        },
      },
      include: {
        ...entryInclude(),
        category: { include: { tournament: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const items: MyTournamentItem[] = [];
    const recentCutoff = addDays(clubToday(this.clock.now(), clubTimeZone()), -14);
    for (const entry of entries) {
      const tournament = entry.category.tournament;
      // Finished tournaments stay on the dashboard for two weeks.
      if (
        tournament.status === TournamentStatus.FINISHED &&
        fromDbDate(tournament.endDate) < recentCutoff
      )
        continue;
      const matches = await this.prisma.tournamentMatch.findMany({
        where: {
          categoryId: entry.categoryId,
          OR: [{ entryAId: entry.id }, { entryBId: entry.id }],
        },
        include: tMatchInclude(),
        orderBy: [{ scheduledDate: "asc" }, { round: "asc" }],
      });
      const pending = matches.filter((match) => match.resultStatus !== "CONFIRMED");
      const lostKnockout = matches.some(
        (match) =>
          match.stage === "KNOCKOUT" &&
          match.resultStatus === "CONFIRMED" &&
          match.winnerEntryId !== entry.id,
      );
      const groupsDone =
        entry.category.drawFormat === "GROUPS_THEN_KNOCKOUT" &&
        matches.length > 0 &&
        matches.every((match) => match.stage === "GROUP" && match.resultStatus === "CONFIRMED");
      const knockoutExists = await this.prisma.tournamentMatch.count({
        where: { categoryId: entry.categoryId, stage: "KNOCKOUT" },
      });
      const views = await this.access.views(pending.slice(0, 1), viewer, false);
      items.push({
        tournament: {
          id: tournament.id,
          name: tournament.name,
          status: tournament.status,
          startDate: fromDbDate(tournament.startDate),
          endDate: fromDbDate(tournament.endDate),
        },
        category: { id: entry.categoryId, name: entry.category.name },
        entry: toEntrySummary(entry, { private: true }),
        nextMatch: views[0] ?? null,
        eliminated: lostKnockout || (groupsDone && knockoutExists > 0),
        champion: entry.category.championEntryId === entry.id,
      });
    }
    return items;
  }

  /** Finals reached by a player: titles (champion) and runner-up finishes. */
  async titles(userId: string): Promise<PlayerTitle[]> {
    const finals = await this.prisma.tournamentMatch.findMany({
      where: {
        stage: "KNOCKOUT",
        nextMatchId: null,
        resultStatus: "CONFIRMED",
        category: { championEntryId: { not: null } },
        OR: [
          { entryA: { players: { some: { userId } } } },
          { entryB: { players: { some: { userId } } } },
        ],
      },
      include: {
        category: { select: { name: true } },
        tournament: { select: { id: true, name: true, endDate: true } },
        entryA: { select: { id: true, players: { select: { userId: true } } } },
      },
      orderBy: { confirmedAt: "desc" },
    });
    return finals.map((final) => {
      const onA = final.entryA?.players.some((player) => player.userId === userId) ?? false;
      const myEntry = onA ? final.entryAId : final.entryBId;
      return {
        tournamentId: final.tournament.id,
        tournamentName: final.tournament.name,
        categoryName: final.category.name,
        placement: final.winnerEntryId === myEntry ? "CHAMPION" : "FINALIST",
        date: fromDbDate(final.tournament.endDate),
      };
    });
  }
}
