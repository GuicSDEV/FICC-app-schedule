import { Injectable } from "@nestjs/common";
import { EntryStatus, Prisma, Role } from "@ficc/db";
import {
  type EntrySummary,
  type ManageEntryInput,
  type OrganizerEntryInput,
  type RegisterEntryInput,
  type UpdateEntryInput,
} from "@ficc/shared";

import type { RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, notFound, unprocessable } from "../common/domain.exception";
import { serializable, type Tx } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CircuitsService } from "./circuits.service";
import { TournamentContextService } from "./tournament-context.service";
import {
  entryInclude,
  entryName,
  type EntryRow,
  toEntrySummary,
  toTournamentPlayer,
} from "./tournament.mappers";
import { ACTIVE_ENTRY_STATUSES, isRegistrationOpen } from "./tournaments.service";

/** CSV cell, quoted when needed (organizer export). */
const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly access: TournamentContextService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly circuits: CircuitsService,
  ) {}

  private async loadCategory(client: Tx, categoryId: string) {
    const category = await client.tournamentCategory.findUnique({
      where: { id: categoryId },
      include: { tournament: true },
    });
    if (!category)
      throw notFound("TOURNAMENT_CATEGORY_NOT_FOUND", "api.tournamentCategoryNotFound");
    return category;
  }

  /** CONFIRMED, or WAITLISTED when the category is full. */
  private async placeStatus(
    client: Tx,
    categoryId: string,
    maxEntries: number,
  ): Promise<EntryStatus> {
    const confirmed = await client.tournamentEntry.count({
      where: { categoryId, status: EntryStatus.CONFIRMED },
    });
    return confirmed < maxEntries ? EntryStatus.CONFIRMED : EntryStatus.WAITLISTED;
  }

  private async assertNotEntered(
    client: Tx,
    categoryId: string,
    userId: string,
    message: "api.alreadyRegistered" | "api.partnerAlreadyRegistered",
  ) {
    const existing = await client.tournamentEntry.findFirst({
      where: { categoryId, status: { in: ACTIVE_ENTRY_STATUSES }, players: { some: { userId } } },
    });
    if (existing)
      throw conflict(
        message === "api.alreadyRegistered" ? "ALREADY_REGISTERED" : "PARTNER_REGISTERED",
        message,
      );
  }

  async register(
    viewer: RequestUser,
    categoryId: string,
    input: RegisterEntryInput,
  ): Promise<EntrySummary> {
    if (viewer.role !== Role.MEMBER) throw forbidden("FORBIDDEN", "api.forbidden");
    const result = await serializable(this.prisma, async (tx) => {
      const category = await this.loadCategory(tx, categoryId);
      const tournament = category.tournament;
      if (!isRegistrationOpen(tournament, this.clock.now())) {
        throw conflict("REGISTRATION_CLOSED", "api.registrationClosed");
      }
      const doubles = category.entryType === "DOUBLES";
      if (doubles && !input.partnerId && !input.partnerGuest) {
        throw unprocessable("PARTNER_REQUIRED", "api.partnerRequired");
      }
      if (!doubles && (input.partnerId || input.partnerGuest)) {
        throw unprocessable("PARTNER_NOT_ALLOWED", "api.partnerNotAllowed");
      }
      if (input.partnerGuest && !tournament.allowGuests) {
        throw unprocessable("GUESTS_NOT_ALLOWED", "api.guestsNotAllowed");
      }
      if (input.partnerId === viewer.id) throw unprocessable("PARTNER_IS_YOU", "api.partnerIsYou");
      await this.assertNotEntered(tx, categoryId, viewer.id, "api.alreadyRegistered");
      if (input.partnerId) {
        const partner = await tx.user.findFirst({
          where: { id: input.partnerId, role: Role.MEMBER, isActive: true },
        });
        if (!partner) throw notFound("PLAYER_NOT_FOUND", "api.playerNotFound");
        await this.assertNotEntered(tx, categoryId, partner.id, "api.partnerAlreadyRegistered");
      }
      const now = this.clock.now();
      const status = input.partnerId
        ? EntryStatus.PENDING_PARTNER
        : tournament.requiresApproval
          ? EntryStatus.PENDING_APPROVAL
          : await this.placeStatus(tx, categoryId, category.maxEntries);
      const entry = await tx.tournamentEntry.create({
        data: {
          categoryId,
          status,
          note: input.note ?? null,
          restrictions: input.restrictions as unknown as Prisma.InputJsonValue,
          createdById: viewer.id,
          players: {
            create: [
              { position: 0, userId: viewer.id, acceptedAt: now },
              ...(input.partnerId ? [{ position: 1, userId: input.partnerId }] : []),
              ...(input.partnerGuest
                ? [
                    {
                      position: 1,
                      guestName: input.partnerGuest.name,
                      guestPhone: input.partnerGuest.phone,
                      acceptedAt: now,
                    },
                  ]
                : []),
            ],
          },
        },
        include: entryInclude(),
      });
      return { entry, category };
    });
    const { entry, category } = result;
    if (entry.status === EntryStatus.PENDING_PARTNER) {
      await this.notifications.notify(input.partnerId!, "TOURNAMENT_PARTNER_INVITE", {
        tournamentId: category.tournamentId,
        tournamentName: category.tournament.name,
        categoryName: category.name,
        entryId: entry.id,
        invitedBy: viewer.name,
      });
    } else if (entry.status === EntryStatus.CONFIRMED || entry.status === EntryStatus.WAITLISTED) {
      await this.notifyPlaced(entry, category);
    }
    this.changed(category.tournamentId, categoryId);
    return toEntrySummary(entry, { private: true });
  }

  private async notifyPlaced(
    entry: EntryRow,
    category: { name: string; tournamentId: string; tournament: { name: string } },
  ) {
    const users = entry.players.flatMap((player) => (player.userId ? [player.userId] : []));
    await this.notifications.notify(users, "TOURNAMENT_ENTRY_CONFIRMED", {
      tournamentId: category.tournamentId,
      tournamentName: category.tournament.name,
      categoryName: category.name,
      waitlisted: entry.status === EntryStatus.WAITLISTED,
    });
  }

  private changed(tournamentId: string, categoryId: string | null) {
    this.realtime.tournamentUpdated({ tournamentId, categoryId, kind: "entries" });
  }

  /** The invited partner accepts: the entry goes on to approval, a place or the waitlist. */
  async accept(viewer: RequestUser, entryId: string): Promise<EntrySummary> {
    const { entry, category } = await serializable(this.prisma, async (tx) => {
      const entry = await tx.tournamentEntry.findUnique({
        where: { id: entryId },
        include: entryInclude(),
      });
      if (!entry) throw notFound("TOURNAMENT_ENTRY_NOT_FOUND", "api.tournamentEntryNotFound");
      const invite = entry.players.find(
        (player) => player.userId === viewer.id && player.acceptedAt === null,
      );
      if (!invite) throw forbidden("NOT_PARTNER", "api.notPartner");
      if (entry.status !== EntryStatus.PENDING_PARTNER)
        throw conflict("ENTRY_NOT_PENDING", "api.entryNotPending");
      const category = await this.loadCategory(tx, entry.categoryId);
      await tx.tournamentEntryPlayer.update({
        where: { id: invite.id },
        data: { acceptedAt: this.clock.now() },
      });
      const status = category.tournament.requiresApproval
        ? EntryStatus.PENDING_APPROVAL
        : await this.placeStatus(tx, entry.categoryId, category.maxEntries);
      const updated = await tx.tournamentEntry.update({
        where: { id: entryId },
        data: { status },
        include: entryInclude(),
      });
      return { entry: updated, category };
    });
    if (entry.status !== EntryStatus.PENDING_APPROVAL) await this.notifyPlaced(entry, category);
    this.changed(category.tournamentId, entry.categoryId);
    return toEntrySummary(entry, { private: true });
  }

  async decline(viewer: RequestUser, entryId: string): Promise<void> {
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { id: entryId },
      include: entryInclude(),
    });
    if (!entry) throw notFound("TOURNAMENT_ENTRY_NOT_FOUND", "api.tournamentEntryNotFound");
    if (
      !entry.players.some((player) => player.userId === viewer.id && player.acceptedAt === null)
    ) {
      throw forbidden("NOT_PARTNER", "api.notPartner");
    }
    if (entry.status !== EntryStatus.PENDING_PARTNER)
      throw conflict("ENTRY_NOT_PENDING", "api.entryNotPending");
    await this.prisma.tournamentEntry.update({
      where: { id: entryId },
      data: { status: EntryStatus.WITHDRAWN },
    });
    const tournamentId = await this.access.tournamentOfEntry(entryId);
    this.changed(tournamentId, entry.categoryId);
  }

  /** A player leaves before the draw; the first waitlisted entry takes the place. */
  async withdraw(viewer: RequestUser, entryId: string): Promise<void> {
    const promoted = await serializable(this.prisma, async (tx) => {
      const entry = await tx.tournamentEntry.findUnique({
        where: { id: entryId },
        include: entryInclude(),
      });
      if (!entry) throw notFound("TOURNAMENT_ENTRY_NOT_FOUND", "api.tournamentEntryNotFound");
      if (!entry.players.some((player) => player.userId === viewer.id)) {
        throw forbidden("NOT_A_PLAYER", "api.notTournamentPlayer");
      }
      if (!ACTIVE_ENTRY_STATUSES.includes(entry.status))
        throw conflict("ENTRY_CLOSED", "api.entryClosed");
      const category = await this.loadCategory(tx, entry.categoryId);
      if (category.drawGeneratedAt) throw conflict("WITHDRAW_AFTER_DRAW", "api.withdrawAfterDraw");
      await tx.tournamentEntry.update({
        where: { id: entryId },
        data: { status: EntryStatus.WITHDRAWN },
      });
      return entry.status === EntryStatus.CONFIRMED ? this.promoteWaitlist(tx, category) : null;
    });
    if (promoted) await this.notifyPlaced(promoted.entry, promoted.category);
    const tournamentId = await this.access.tournamentOfEntry(entryId);
    this.changed(tournamentId, null);
  }

  private async promoteWaitlist(
    tx: Tx,
    category: Awaited<ReturnType<EntriesService["loadCategory"]>>,
  ) {
    const confirmed = await tx.tournamentEntry.count({
      where: { categoryId: category.id, status: EntryStatus.CONFIRMED },
    });
    if (confirmed >= category.maxEntries) return null;
    const next = await tx.tournamentEntry.findFirst({
      where: { categoryId: category.id, status: EntryStatus.WAITLISTED },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;
    const entry = await tx.tournamentEntry.update({
      where: { id: next.id },
      data: { status: EntryStatus.CONFIRMED },
      include: entryInclude(),
    });
    return { entry, category };
  }

  async update(
    viewer: RequestUser,
    entryId: string,
    input: UpdateEntryInput,
  ): Promise<EntrySummary> {
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { id: entryId },
      include: entryInclude(),
    });
    if (!entry) throw notFound("TOURNAMENT_ENTRY_NOT_FOUND", "api.tournamentEntryNotFound");
    const tournamentId = await this.access.tournamentOfEntry(entryId);
    const own = entry.players.some((player) => player.userId === viewer.id);
    if (!own && !(await this.access.canManage(viewer, tournamentId))) {
      throw forbidden("NOT_A_PLAYER", "api.notTournamentPlayer");
    }
    const updated = await this.prisma.tournamentEntry.update({
      where: { id: entryId },
      data: {
        ...(input.restrictions
          ? { restrictions: input.restrictions as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
      },
      include: entryInclude(),
    });
    return toEntrySummary(updated, { private: true });
  }

  // ── organizer ──────────────────────────────────────────────────────────────

  async list(viewer: RequestUser, tournamentId: string): Promise<EntrySummary[]> {
    await this.access.assertCanManage(viewer, tournamentId);
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { category: { tournamentId } },
      include: {
        ...entryInclude(),
        category: { select: { seeding: true, circuitCategoryId: true } },
      },
      orderBy: [{ categoryId: "asc" }, { createdAt: "asc" }],
    });
    const ratings = await this.ratings(entries);
    return entries.map((entry) =>
      toEntrySummary(entry, { private: true, rating: ratings.get(entry.id) }),
    );
  }

  /** Seeding strength: average Elo, or the sum of circuit points when the category seeds by circuit. */
  async ratings(
    entries: (EntryRow & { category: { seeding: string; circuitCategoryId: string | null } })[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const circuitCategories = [
      ...new Set(
        entries
          .filter(
            (entry) => entry.category.seeding === "CIRCUIT" && entry.category.circuitCategoryId,
          )
          .map((entry) => entry.category.circuitCategoryId!),
      ),
    ];
    const points = new Map<string, Map<string, number>>();
    for (const id of circuitCategories) points.set(id, await this.circuits.pointsByPlayer(id));
    for (const entry of entries) {
      const table = entry.category.circuitCategoryId
        ? points.get(entry.category.circuitCategoryId)
        : undefined;
      if (entry.category.seeding === "CIRCUIT" && table) {
        const total = entry.players.reduce(
          (sum, player) =>
            sum +
            (table.get(player.userId ?? `guest:${(player.guestName ?? "").trim().toLowerCase()}`) ??
              0),
          0,
        );
        result.set(entry.id, total);
      } else {
        result.set(entry.id, toEntrySummary(entry).rating);
      }
    }
    return result;
  }

  async add(
    viewer: RequestUser,
    categoryId: string,
    input: OrganizerEntryInput,
  ): Promise<EntrySummary> {
    const tournamentId = await this.access.tournamentOfCategory(categoryId);
    await this.access.assertCanManage(viewer, tournamentId);
    const entry = await serializable(this.prisma, async (tx) => {
      const category = await this.loadCategory(tx, categoryId);
      const expected = category.entryType === "DOUBLES" ? 2 : 1;
      if (input.players.length !== expected)
        throw unprocessable("ENTRY_PLAYERS", "api.entryPlayersMismatch");
      const hasGuest = input.players.some((player) => !("userId" in player));
      if (hasGuest && !category.tournament.allowGuests) {
        throw unprocessable("GUESTS_NOT_ALLOWED", "api.guestsNotAllowed");
      }
      for (const player of input.players) {
        if ("userId" in player) {
          const user = await tx.user.findFirst({ where: { id: player.userId, role: Role.MEMBER } });
          if (!user) throw notFound("PLAYER_NOT_FOUND", "api.playerNotFound");
          await this.assertNotEntered(tx, categoryId, player.userId, "api.alreadyRegistered");
        }
      }
      const now = this.clock.now();
      return tx.tournamentEntry.create({
        data: {
          categoryId,
          status: EntryStatus.CONFIRMED,
          paymentStatus: input.paymentStatus,
          note: input.note ?? null,
          restrictions: input.restrictions as unknown as Prisma.InputJsonValue,
          createdById: viewer.id,
          players: {
            create: input.players.map((player, position) =>
              "userId" in player
                ? { position, userId: player.userId, acceptedAt: now }
                : { position, guestName: player.name, guestPhone: player.phone, acceptedAt: now },
            ),
          },
        },
        include: entryInclude(),
      });
    });
    this.changed(tournamentId, categoryId);
    return toEntrySummary(entry, { private: true });
  }

  async manage(
    viewer: RequestUser,
    entryId: string,
    input: ManageEntryInput,
  ): Promise<EntrySummary> {
    const tournamentId = await this.access.tournamentOfEntry(entryId);
    await this.access.assertCanManage(viewer, tournamentId);
    const { entry, notify, promoted } = await serializable(this.prisma, async (tx) => {
      const current = await tx.tournamentEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: entryInclude(),
      });
      const category = await this.loadCategory(tx, current.categoryId);
      let targetCategory = category;
      if (input.categoryId && input.categoryId !== current.categoryId) {
        targetCategory = await this.loadCategory(tx, input.categoryId);
        if (targetCategory.tournamentId !== tournamentId) {
          throw notFound("TOURNAMENT_CATEGORY_NOT_FOUND", "api.tournamentCategoryNotFound");
        }
        if (targetCategory.entryType !== category.entryType)
          throw unprocessable("ENTRY_TYPE", "api.entryTypeMismatch");
        if (category.drawGeneratedAt || targetCategory.drawGeneratedAt)
          throw conflict("CATEGORY_LOCKED", "api.categoryLocked");
      }
      let status = input.status ?? current.status;
      const freedPlace =
        current.status === EntryStatus.CONFIRMED &&
        (status !== EntryStatus.CONFIRMED || targetCategory.id !== category.id);
      if (input.status === EntryStatus.CONFIRMED && current.status !== EntryStatus.CONFIRMED) {
        // Approving fills a place when there is one; otherwise the entry waits.
        status = await this.placeStatus(tx, targetCategory.id, targetCategory.maxEntries);
      }
      const updated = await tx.tournamentEntry.update({
        where: { id: entryId },
        data: {
          status,
          ...(input.paymentStatus ? { paymentStatus: input.paymentStatus } : {}),
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
          ...(targetCategory.id !== category.id
            ? { categoryId: targetCategory.id, seed: null }
            : {}),
        },
        include: entryInclude(),
      });
      const notify =
        (status === EntryStatus.CONFIRMED || status === EntryStatus.WAITLISTED) &&
        status !== current.status
          ? targetCategory
          : null;
      const promoted = freedPlace ? await this.promoteWaitlist(tx, category) : null;
      return { entry: updated, notify, promoted };
    });
    if (notify) await this.notifyPlaced(entry, notify);
    if (promoted) await this.notifyPlaced(promoted.entry, promoted.category);
    this.changed(tournamentId, null);
    return toEntrySummary(entry, { private: true });
  }

  /** CSV of every entry (organizer export), separated by semicolons for spreadsheets in pt-BR. */
  async csv(viewer: RequestUser, tournamentId: string): Promise<string> {
    await this.access.assertCanManage(viewer, tournamentId);
    const entries = await this.prisma.tournamentEntry.findMany({
      where: { category: { tournamentId } },
      include: { ...entryInclude(), category: { select: { name: true } } },
      orderBy: [{ category: { sortOrder: "asc" } }, { createdAt: "asc" }],
    });
    const header = [
      "categoria",
      "inscricao",
      "jogador1",
      "matricula1",
      "telefone1",
      "jogador2",
      "matricula2",
      "telefone2",
      "status",
      "pagamento",
      "cabeca",
      "observacao",
      "inscrito_em",
    ];
    const lines = entries.map((entry) => {
      const players = [0, 1].map((index) => entry.players[index]);
      const cells = players.flatMap((player) => [
        player ? (player.user?.name ?? player.guestName ?? "") : "",
        player?.user?.membershipId ?? "",
        player?.guestPhone ?? "",
      ]);
      return [
        entry.category.name,
        entryName(entry.players.map(toTournamentPlayer)),
        ...cells,
        entry.status,
        entry.paymentStatus,
        entry.seed,
        entry.note,
        entry.createdAt.toISOString(),
      ]
        .map(csvCell)
        .join(";");
    });
    return [header.join(";"), ...lines].join("\n") + "\n";
  }
}
