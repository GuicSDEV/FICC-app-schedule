import { Injectable, Logger } from "@nestjs/common";
import { BookingStatus, MatchConfirmation, MatchStatus, Prisma, Role, TeamSide } from "@ficc/db";
import {
  addDays,
  calculateMatchElo,
  clubToday,
  formatScore,
  fromDbDate,
  type MatchDetail,
  type MatchScore,
  type MyMatchesResponse,
  type ReportMatchInput,
  type ResolveDisputeInput,
  type SetScore,
  toDbDate,
} from "@ficc/shared";

import type { RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toCourtSummary, toPlayerSummary } from "../common/mappers";
import { serializable, type Tx } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

/** Unanswered reports are auto-approved after 48 h (docs/SPEC.md). */
export const APPROVAL_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Results can be reported up to this many days after the match. */
export const REPORT_WINDOW_DAYS = 30;

const nameSelect = { select: { id: true, name: true } } as const;

export const matchInclude = {
  court: true,
  players: { include: { user: { select: playerSelect } } },
  sets: { orderBy: { setNumber: "asc" } },
  eloHistory: true,
  reportedBy: nameSelect,
  respondedBy: nameSelect,
  resolvedBy: nameSelect,
} satisfies Prisma.MatchInclude;

export type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

const otherSide = (side: TeamSide) => (side === TeamSide.A ? TeamSide.B : TeamSide.A);

export function toSetScores(match: Pick<MatchWithRelations, "sets">): SetScore[] {
  return match.sets.map((set) => ({
    a: set.sideAGames,
    b: set.sideBGames,
    tiebreak: set.isMatchTiebreak,
  }));
}

export function reporterSide(
  match: Pick<MatchWithRelations, "players" | "reportedById">,
): TeamSide {
  return match.players.find((player) => player.userId === match.reportedById)?.side ?? TeamSide.A;
}

export function toMatchDetail(match: MatchWithRelations, viewerId?: string): MatchDetail {
  const sets = toSetScores(match);
  const viewerSide = match.players.find((player) => player.userId === viewerId)?.side ?? null;
  const elo = new Map(match.eloHistory.map((row) => [row.userId, row]));
  return {
    id: match.id,
    type: match.type,
    status: match.status,
    playedOn: fromDbDate(match.playedOn),
    surface: match.surface,
    court: match.court ? toCourtSummary(match.court) : null,
    bookingId: match.bookingId,
    sets,
    score: formatScore(sets),
    winnerSide: match.winnerSide,
    players: [...match.players]
      .sort((a, b) => a.side.localeCompare(b.side) || a.user.name.localeCompare(b.user.name))
      .map((player) => {
        const row = elo.get(player.userId);
        return {
          user: toPlayerSummary(player.user),
          side: player.side,
          eloBefore: row?.before ?? null,
          eloAfter: row?.after ?? null,
          delta: row?.delta ?? null,
        };
      }),
    reportedBy: match.reportedBy,
    reportedAt: match.reportedAt.toISOString(),
    approvalDeadline: match.approvalDeadline.toISOString(),
    respondedBy: match.respondedBy,
    respondedAt: match.respondedAt?.toISOString() ?? null,
    disputeComment: match.disputeComment,
    confirmation: match.confirmation,
    confirmedAt: match.confirmedAt?.toISOString() ?? null,
    resolvedBy: match.resolvedBy,
    resolutionNote: match.resolutionNote,
    viewer: {
      side: viewerSide,
      canRespond:
        match.status === MatchStatus.PENDING &&
        viewerSide !== null &&
        viewerSide !== reporterSide(match),
    },
  };
}

/** Overall rank among active members: 1 + members with a strictly higher rating. */
async function rankOf(tx: Tx, elo: number): Promise<number> {
  return (
    1 + (await tx.user.count({ where: { role: Role.MEMBER, isActive: true, elo: { gt: elo } } }))
  );
}

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Any player of the match reports it; the other side approves or disputes. */
  async report(reporterId: string, input: ReportMatchInput): Promise<MatchDetail> {
    const now = this.clock.now();
    const today = clubToday(now);
    const playerIds = [...input.sideA, ...input.sideB];
    if (!playerIds.includes(reporterId)) {
      throw forbidden("NOT_A_PLAYER", "Só quem jogou pode lançar o resultado.");
    }
    if (input.playedOn > today)
      throw unprocessable("MATCH_IN_FUTURE", "A partida ainda não aconteceu.");
    if (input.playedOn < addDays(today, -REPORT_WINDOW_DAYS)) {
      throw unprocessable(
        "MATCH_TOO_OLD",
        `Resultados podem ser lançados até ${REPORT_WINDOW_DAYS} dias depois.`,
      );
    }
    const players = await this.prisma.user.findMany({
      where: { id: { in: playerIds }, role: Role.MEMBER, isActive: true },
      select: { id: true },
    });
    if (players.length !== playerIds.length) {
      throw unprocessable("INVALID_PLAYERS", "Algum jogador não é um sócio ativo.");
    }

    let courtId = input.courtId ?? null;
    let surface = input.surface ?? null;
    if (input.bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: input.bookingId },
        include: {
          players: true,
          court: true,
          matches: { where: { status: { not: MatchStatus.VOIDED } } },
        },
      });
      if (!booking || booking.status !== BookingStatus.CONFIRMED) {
        throw unprocessable("INVALID_BOOKING", "Reserva não encontrada ou não confirmada.");
      }
      const bookingPlayers = new Set(booking.players.map((player) => player.userId));
      if (
        bookingPlayers.size !== playerIds.length ||
        !playerIds.every((id) => bookingPlayers.has(id))
      ) {
        throw unprocessable("INVALID_BOOKING", "Os jogadores não batem com os da reserva.");
      }
      if (fromDbDate(booking.date) !== input.playedOn) {
        throw unprocessable("INVALID_BOOKING", "A data não bate com a da reserva.");
      }
      if (booking.matches.length > 0) {
        throw conflict("BOOKING_ALREADY_REPORTED", "Essa reserva já tem resultado lançado.");
      }
      courtId = booking.courtId;
      surface = booking.court.surface;
    }
    if (courtId) {
      const court = await this.prisma.court.findUnique({ where: { id: courtId } });
      if (!court) throw notFound("COURT_NOT_FOUND", "Quadra não encontrada.");
      surface = court.surface;
    }
    if (!surface) throw unprocessable("SURFACE_REQUIRED", "Informe a superfície.");

    const match = await this.prisma.match.create({
      data: {
        type: input.type,
        playedOn: toDbDate(input.playedOn),
        surface,
        courtId,
        bookingId: input.bookingId ?? null,
        winnerSide: input.score.winner,
        reportedById: reporterId,
        reportedAt: now,
        approvalDeadline: new Date(now.getTime() + APPROVAL_WINDOW_MS),
        players: {
          create: [
            ...input.sideA.map((userId) => ({ userId, side: TeamSide.A })),
            ...input.sideB.map((userId) => ({ userId, side: TeamSide.B })),
          ],
        },
        sets: { create: this.toSetRows(input.score) },
      },
      include: matchInclude,
    });

    const reporterTeam = input.sideA.includes(reporterId) ? input.sideA : input.sideB;
    const opponents = playerIds.filter((id) => !reporterTeam.includes(id));
    await this.notifications.notify(opponents, "MATCH_REPORTED", {
      matchId: match.id,
      reportedBy: match.reportedBy.name,
      score: formatScore(toSetScores(match)),
    });
    return toMatchDetail(match, reporterId);
  }

  async approve(userId: string, matchId: string): Promise<MatchDetail> {
    const match = await this.loadForResponse(userId, matchId);
    return this.confirm(
      match.id,
      MatchConfirmation.OPPONENT_APPROVED,
      { respondedById: userId },
      userId,
    );
  }

  async dispute(
    userId: string,
    matchId: string,
    comment: string | undefined,
  ): Promise<MatchDetail> {
    const match = await this.loadForResponse(userId, matchId);
    const disputed = await this.prisma.match.update({
      where: { id: match.id, status: MatchStatus.PENDING },
      data: {
        status: MatchStatus.DISPUTED,
        respondedById: userId,
        respondedAt: this.clock.now(),
        disputeComment: comment ?? null,
      },
      include: matchInclude,
    });
    const reporterTeam = disputed.players
      .filter((player) => player.side === reporterSide(disputed))
      .map((player) => player.userId);
    const disputedBy = disputed.respondedBy?.name ?? "";
    const payload = { matchId, disputedBy, comment: comment ?? null };
    await this.notifications.notify(reporterTeam, "MATCH_DISPUTED", payload);
    await this.notifications.notifyAdmins("MATCH_DISPUTED", payload);
    return toMatchDetail(disputed, userId);
  }

  /** Job: confirms reports nobody answered within 48 hours. */
  async autoApprove(now: Date = this.clock.now()): Promise<number> {
    const due = await this.prisma.match.findMany({
      where: { status: MatchStatus.PENDING, approvalDeadline: { lte: now } },
      select: { id: true },
      orderBy: { approvalDeadline: "asc" },
    });
    for (const { id } of due) {
      await this.confirm(id, MatchConfirmation.AUTO_APPROVED, {});
    }
    if (due.length > 0) this.logger.log(`auto-approved ${due.length} match(es)`);
    return due.length;
  }

  async disputes(): Promise<MatchDetail[]> {
    const matches = await this.prisma.match.findMany({
      where: { status: MatchStatus.DISPUTED },
      include: matchInclude,
      orderBy: { respondedAt: "asc" },
    });
    return matches.map((match) => toMatchDetail(match));
  }

  /** Admin decision on a disputed match: accept as reported, correct the score, or void it. */
  async resolve(
    admin: RequestUser,
    matchId: string,
    input: ResolveDisputeInput,
  ): Promise<MatchDetail> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw notFound("MATCH_NOT_FOUND", "Partida não encontrada.");
    if (match.status !== MatchStatus.DISPUTED) {
      throw conflict("MATCH_NOT_DISPUTED", "Essa partida não está em disputa.");
    }
    const now = this.clock.now();
    const resolution = {
      resolvedById: admin.id,
      resolvedAt: now,
      resolutionNote: input.note ?? null,
    };

    let result: MatchDetail;
    if (input.action === "VOID") {
      const voided = await this.prisma.match.update({
        where: { id: matchId },
        data: { status: MatchStatus.VOIDED, ...resolution },
        include: matchInclude,
      });
      result = toMatchDetail(voided);
    } else {
      if (input.action === "EDIT") {
        await this.prisma.$transaction([
          this.prisma.matchSet.deleteMany({ where: { matchId } }),
          this.prisma.match.update({
            where: { id: matchId },
            data: { winnerSide: input.score.winner, sets: { create: this.toSetRows(input.score) } },
          }),
        ]);
      }
      result = await this.confirm(matchId, MatchConfirmation.ADMIN_RESOLVED, resolution);
    }

    const players = await this.prisma.matchPlayer.findMany({
      where: { matchId },
      select: { userId: true },
    });
    await this.notifications.notify(
      players.map((player) => player.userId),
      "DISPUTE_RESOLVED",
      { matchId, action: input.action },
    );
    return result;
  }

  async get(viewer: RequestUser, matchId: string): Promise<MatchDetail> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: matchInclude,
    });
    if (!match) throw notFound("MATCH_NOT_FOUND", "Partida não encontrada.");
    const isPlayer = match.players.some((player) => player.userId === viewer.id);
    if (!isPlayer && viewer.role !== Role.ADMIN && match.status !== MatchStatus.CONFIRMED) {
      throw forbidden("NOT_A_PLAYER", "Você não participou dessa partida.");
    }
    return toMatchDetail(match, viewer.id);
  }

  async mine(userId: string): Promise<MyMatchesResponse> {
    const matches = await this.prisma.match.findMany({
      where: { players: { some: { userId } }, status: { not: MatchStatus.VOIDED } },
      include: matchInclude,
      orderBy: [{ playedOn: "desc" }, { reportedAt: "desc" }],
      take: 60,
    });
    const details = matches.map((match) => toMatchDetail(match, userId));
    const pending = details.filter((match) => match.status === "PENDING");
    return {
      awaitingMyResponse: pending.filter((match) => match.viewer.canRespond),
      awaitingOpponent: pending.filter((match) => !match.viewer.canRespond),
      disputed: details.filter((match) => match.status === "DISPUTED"),
      recent: details.filter((match) => match.status === "CONFIRMED").slice(0, 20),
    };
  }

  /**
   * Confirms a match and applies Elo for every player in one serializable transaction: current
   * ratings → shared calculateMatchElo → user ratings + EloHistory rows. Then notifies each player
   * with their personal change and rank movement, and broadcasts leaderboard.updated.
   */
  private async confirm(
    matchId: string,
    confirmation: MatchConfirmation,
    extra: Prisma.MatchUncheckedUpdateInput,
    viewerId?: string,
  ): Promise<MatchDetail> {
    const now = this.clock.now();
    const outcome = await serializable(this.prisma, async (tx) => {
      const match = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        include: {
          players: { include: { user: { select: { id: true, elo: true } } } },
          sets: true,
        },
      });
      if (match.status !== MatchStatus.PENDING && match.status !== MatchStatus.DISPUTED) {
        throw conflict("MATCH_ALREADY_RESOLVED", "Essa partida já foi resolvida.");
      }
      const sideA = match.players.filter((player) => player.side === TeamSide.A);
      const sideB = match.players.filter((player) => player.side === TeamSide.B);
      const { deltaA, deltaB } = calculateMatchElo({
        sideA: sideA.map((player) => player.user.elo),
        sideB: sideB.map((player) => player.user.elo),
        winner: match.winnerSide,
      });

      const changes = [];
      for (const player of match.players) {
        const delta = player.side === TeamSide.A ? deltaA : deltaB;
        const before = player.user.elo;
        changes.push({
          userId: player.userId,
          side: player.side,
          before,
          after: before + delta,
          delta,
          rankBefore: await rankOf(tx, before),
        });
      }
      for (const change of changes) {
        await tx.user.update({ where: { id: change.userId }, data: { elo: change.after } });
      }
      await tx.eloHistory.createMany({
        data: changes.map(({ userId, before, after, delta }) => ({
          userId,
          matchId,
          before,
          after,
          delta,
          createdAt: now,
        })),
      });
      const confirmed = await tx.match.update({
        where: { id: matchId },
        data: { ...extra, status: MatchStatus.CONFIRMED, confirmation, confirmedAt: now },
        include: matchInclude,
      });
      const withRanks = [];
      for (const change of changes) {
        withRanks.push({ ...change, rankAfter: await rankOf(tx, change.after) });
      }
      return { confirmed, changes: withRanks };
    });

    const score = formatScore(toSetScores(outcome.confirmed));
    for (const change of outcome.changes) {
      await this.notifications.notify(change.userId, "MATCH_CONFIRMED", {
        matchId,
        won: change.side === outcome.confirmed.winnerSide,
        side: change.side,
        score,
        eloBefore: change.before,
        eloAfter: change.after,
        delta: change.delta,
        rankBefore: change.rankBefore,
        rankAfter: change.rankAfter,
      });
    }
    this.realtime.leaderboardUpdated({
      matchId,
      userIds: outcome.changes.map((change) => change.userId),
    });
    return toMatchDetail(outcome.confirmed, viewerId);
  }

  private async loadForResponse(userId: string, matchId: string): Promise<MatchWithRelations> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: matchInclude,
    });
    if (!match) throw notFound("MATCH_NOT_FOUND", "Partida não encontrada.");
    const player = match.players.find((entry) => entry.userId === userId);
    if (!player) throw forbidden("NOT_A_PLAYER", "Você não participou dessa partida.");
    if (match.status !== MatchStatus.PENDING) {
      throw conflict("MATCH_NOT_PENDING", "Essa partida não está aguardando resposta.");
    }
    if (player.side !== otherSide(reporterSide(match))) {
      throw forbidden("REPORTER_SIDE", "Quem confirma é o adversário de quem lançou o resultado.");
    }
    return match;
  }

  private toSetRows(score: MatchScore) {
    return score.sets.map((set, index) => ({
      setNumber: index + 1,
      sideAGames: set.a,
      sideBGames: set.b,
      isMatchTiebreak: set.tiebreak,
    }));
  }
}
