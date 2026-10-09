import { Injectable, Logger } from "@nestjs/common";
import {
  BookingStatus,
  MatchConfirmation,
  MatchStatus,
  MatchType,
  Prisma,
  Role,
  type Sport,
  TeamSide,
} from "@ficc/db";
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
  sportRules,
  toDbDate,
} from "@ficc/shared";

import { can, type RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, notFound, unprocessable } from "../common/domain.exception";
import { playerSelect, toCourtSummary, toPlayerSummary } from "../common/mappers";
import type { Tx } from "../common/transactions";
import { validationException } from "../common/zod-validation.pipe";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { clubSettings, clubTimeZone, tenant } from "../tenancy/tenant-context";

/** Validates sets with the sport's rules; answers 400 VALIDATION_FAILED like the request pipe. */
function parseScoreFor(sport: Sport, sets: SetScore[]): MatchScore {
  const result = sportRules(sport).scoreSchema.safeParse(sets);
  if (!result.success) throw validationException(result.error);
  return result.data;
}

/**
 * Whether confirming this match moves the Elo ladder. Friendlies never do; tournament matches
 * will follow their category's setting (Phase 9.5).
 */
export function countsForRating(match: { type: MatchType }): boolean {
  return match.type === MatchType.RANKED;
}

const nameSelect = { select: { id: true, name: true } } as const;

/** Built per call: the player select depends on the current club. */
export function matchInclude() {
  return {
    court: true,
    players: { include: { user: { select: playerSelect() } } },
    sets: { orderBy: { setNumber: "asc" } },
    eloHistory: true,
    reportedBy: nameSelect,
    respondedBy: nameSelect,
    resolvedBy: nameSelect,
  } satisfies Prisma.MatchInclude;
}

export type MatchWithRelations = Prisma.MatchGetPayload<{
  include: ReturnType<typeof matchInclude>;
}>;

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
    format: match.format,
    type: match.type,
    sport: match.sport,
    tournamentId: match.tournamentId,
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

/** Rank in a sport among active members: 1 + members with a strictly higher rating. */
async function rankOf(tx: Tx, sport: Sport, elo: number): Promise<number> {
  const higher = await tx.playerRating.count({
    where: { sport, elo: { gt: elo }, user: { role: Role.MEMBER, isActive: true } },
  });
  return 1 + higher;
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
    const today = clubToday(now, clubTimeZone());
    const playerIds = [...input.sideA, ...input.sideB];
    if (!playerIds.includes(reporterId)) {
      throw forbidden("NOT_A_PLAYER", "api.onlyPlayersReport");
    }
    if (input.playedOn > today) throw unprocessable("MATCH_IN_FUTURE", "api.matchInFuture");
    const { matchReportMaxDaysAgo, matchAutoApproveHours, primarySport } = clubSettings();
    if (input.playedOn < addDays(today, -matchReportMaxDaysAgo)) {
      throw unprocessable("MATCH_TOO_OLD", {
        key: "api.matchTooOld",
        params: { days: matchReportMaxDaysAgo },
      });
    }
    const players = await this.prisma.user.findMany({
      where: { id: { in: playerIds }, role: Role.MEMBER, isActive: true },
      select: { id: true },
    });
    if (players.length !== playerIds.length) {
      throw unprocessable("INVALID_PLAYERS", "api.invalidPlayers");
    }

    let courtId = input.courtId ?? null;
    let surface = input.surface ?? null;
    // The court decides the sport; without one it is the club's primary sport.
    let sport: Sport = primarySport;
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
        throw unprocessable("INVALID_BOOKING", "api.bookingNotConfirmed");
      }
      const bookingPlayers = new Set(booking.players.map((player) => player.userId));
      if (
        bookingPlayers.size !== playerIds.length ||
        !playerIds.every((id) => bookingPlayers.has(id))
      ) {
        throw unprocessable("INVALID_BOOKING", "api.bookingPlayersMismatch");
      }
      if (fromDbDate(booking.date) !== input.playedOn) {
        throw unprocessable("INVALID_BOOKING", "api.bookingDateMismatch");
      }
      if (booking.matches.length > 0) {
        throw conflict("BOOKING_ALREADY_REPORTED", "api.bookingAlreadyReported");
      }
      courtId = booking.courtId;
      surface = booking.court.surface;
    }
    if (courtId) {
      const court = await this.prisma.court.findUnique({ where: { id: courtId } });
      if (!court) throw notFound("COURT_NOT_FOUND", "api.courtNotFound");
      surface = court.surface;
      sport = court.sport;
    }
    if (!surface) throw unprocessable("SURFACE_REQUIRED", "api.surfaceRequired");
    const score = parseScoreFor(sport, input.score);

    const match = await this.prisma.match.create({
      data: {
        format: input.format,
        type: MatchType.RANKED,
        sport,
        playedOn: toDbDate(input.playedOn),
        surface,
        courtId,
        bookingId: input.bookingId ?? null,
        winnerSide: score.winner,
        reportedById: reporterId,
        reportedAt: now,
        approvalDeadline: new Date(now.getTime() + matchAutoApproveHours * 60 * 60 * 1000),
        players: {
          create: [
            ...input.sideA.map((userId) => ({ userId, side: TeamSide.A })),
            ...input.sideB.map((userId) => ({ userId, side: TeamSide.B })),
          ],
        },
        sets: { create: this.toSetRows(score) },
      },
      include: matchInclude(),
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
      include: matchInclude(),
    });
    const reporterTeam = disputed.players
      .filter((player) => player.side === reporterSide(disputed))
      .map((player) => player.userId);
    const disputedBy = disputed.respondedBy?.name ?? "";
    const payload = { matchId, disputedBy, comment: comment ?? null };
    await this.notifications.notify(reporterTeam, "MATCH_DISPUTED", payload);
    await this.notifications.notifyStaff("RANKING_MANAGE", "MATCH_DISPUTED", payload);
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
      include: matchInclude(),
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
    if (!match) throw notFound("MATCH_NOT_FOUND", "api.matchNotFound");
    if (match.status !== MatchStatus.DISPUTED) {
      throw conflict("MATCH_NOT_DISPUTED", "api.matchNotDisputed");
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
        include: matchInclude(),
      });
      result = toMatchDetail(voided);
    } else {
      if (input.action === "EDIT") {
        const { sport } = await this.prisma.match.findUniqueOrThrow({
          where: { id: matchId },
          select: { sport: true },
        });
        const score = parseScoreFor(sport, input.score);
        await this.prisma.$transaction([
          this.prisma.matchSet.deleteMany({ where: { matchId } }),
          this.prisma.match.update({
            where: { id: matchId },
            data: { winnerSide: score.winner, sets: { create: this.toSetRows(score) } },
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
      include: matchInclude(),
    });
    if (!match) throw notFound("MATCH_NOT_FOUND", "api.matchNotFound");
    const isPlayer = match.players.some((player) => player.userId === viewer.id);
    if (!isPlayer && !can(viewer, "RANKING_MANAGE") && match.status !== MatchStatus.CONFIRMED) {
      throw forbidden("NOT_A_PLAYER", "api.notMatchPlayer");
    }
    return toMatchDetail(match, viewer.id);
  }

  async mine(userId: string): Promise<MyMatchesResponse> {
    const matches = await this.prisma.match.findMany({
      where: { players: { some: { userId } }, status: { not: MatchStatus.VOIDED } },
      include: matchInclude(),
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
   * Confirms a match and, when it counts for the ladder, applies Elo for every player in one
   * transaction (one at a time per club): ratings in the match's sport → shared calculateMatchElo with the
   * club's K-factor → PlayerRating + EloHistory rows. Then notifies each player with their
   * personal change and rank movement, and broadcasts leaderboard.updated.
   */
  /**
   * Confirms a tournament match whose category counts for Elo (created by the tournaments module
   * once the result is final) and applies the ratings like any ranked match.
   */
  confirmTournamentMatch(matchId: string): Promise<MatchDetail> {
    return this.confirm(matchId, MatchConfirmation.OPPONENT_APPROVED, {}, undefined, true);
  }

  private async confirm(
    matchId: string,
    confirmation: MatchConfirmation,
    extra: Prisma.MatchUncheckedUpdateInput,
    viewerId?: string,
    ratedOverride?: boolean,
  ): Promise<MatchDetail> {
    const now = this.clock.now();
    // Every rating change goes through here and reads the whole ladder (ranks), so a club's
    // confirmations take turns behind an advisory lock instead of fighting as serializable
    // transactions, which failed under a burst of approvals.
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`elo:${tenant().clubId}`}, 0))`;
        const match = await tx.match.findUniqueOrThrow({
          where: { id: matchId },
          include: { players: true, sets: true },
        });
        if (match.status !== MatchStatus.PENDING && match.status !== MatchStatus.DISPUTED) {
          throw conflict("MATCH_ALREADY_RESOLVED", "api.matchAlreadyResolved");
        }
        const { eloKFactor, eloInitialRating } = clubSettings();
        const sport = match.sport;
        const stored = await tx.playerRating.findMany({
          where: { sport, userId: { in: match.players.map((player) => player.userId) } },
        });
        const ratingOf = (userId: string) =>
          stored.find((rating) => rating.userId === userId)?.elo ?? eloInitialRating;
        const rated = ratedOverride ?? countsForRating(match);
        const sideA = match.players.filter((player) => player.side === TeamSide.A);
        const sideB = match.players.filter((player) => player.side === TeamSide.B);
        const { deltaA, deltaB } = rated
          ? calculateMatchElo({
              sideA: sideA.map((player) => ratingOf(player.userId)),
              sideB: sideB.map((player) => ratingOf(player.userId)),
              winner: match.winnerSide,
              k: eloKFactor,
            })
          : { deltaA: 0, deltaB: 0 };

        const changes = [];
        for (const player of match.players) {
          const delta = player.side === TeamSide.A ? deltaA : deltaB;
          const before = ratingOf(player.userId);
          changes.push({
            userId: player.userId,
            side: player.side,
            before,
            after: before + delta,
            delta,
            rankBefore: await rankOf(tx, sport, before),
          });
        }
        if (rated) {
          for (const change of changes) {
            await tx.playerRating.upsert({
              where: { userId_sport: { userId: change.userId, sport } },
              update: { elo: change.after, matches: { increment: 1 } },
              create: { userId: change.userId, sport, elo: change.after, matches: 1 },
            });
          }
          await tx.eloHistory.createMany({
            data: changes.map(({ userId, before, after, delta }) => ({
              userId,
              matchId,
              sport,
              before,
              after,
              delta,
              createdAt: now,
            })),
          });
        }
        // A dispute is not behind the lock: only confirm the status read above.
        const { count } = await tx.match.updateMany({
          where: { id: matchId, status: match.status },
          data: { ...extra, status: MatchStatus.CONFIRMED, confirmation, confirmedAt: now },
        });
        if (count === 0) throw conflict("MATCH_ALREADY_RESOLVED", "api.matchAlreadyResolved");
        const confirmed = await tx.match.findUniqueOrThrow({
          where: { id: matchId },
          include: matchInclude(),
        });
        const withRanks = [];
        for (const change of changes) {
          withRanks.push({ ...change, rankAfter: await rankOf(tx, sport, change.after) });
        }
        return { confirmed, changes: withRanks };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );

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
      include: matchInclude(),
    });
    if (!match) throw notFound("MATCH_NOT_FOUND", "api.matchNotFound");
    const player = match.players.find((entry) => entry.userId === userId);
    if (!player) throw forbidden("NOT_A_PLAYER", "api.notMatchPlayer");
    if (match.status !== MatchStatus.PENDING) {
      throw conflict("MATCH_NOT_PENDING", "api.matchNotPending");
    }
    if (player.side !== otherSide(reporterSide(match))) {
      throw forbidden("REPORTER_SIDE", "api.reporterSide");
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
