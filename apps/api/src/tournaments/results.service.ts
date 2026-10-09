import { Injectable, Logger } from "@nestjs/common";
import {
  MatchStatus,
  MatchType,
  type MatchOutcome,
  Prisma,
  Role,
  Surface,
  TeamSide,
} from "@ficc/db";
import {
  addDays,
  clubToday,
  fromDbDate,
  type PendingResults,
  roundName,
  type SetScore,
  slotEndsAt,
  sportRules,
  toDbDate,
  type TournamentOutcomeInput,
} from "@ficc/shared";

import type { RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, forbidden, unprocessable } from "../common/domain.exception";
import { serializable } from "../common/transactions";
import { validationException } from "../common/zod-validation.pipe";
import { MatchesService } from "../matches/matches.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { clubSettings, clubTimeZone } from "../tenancy/tenant-context";
import { DrawService } from "./draw.service";
import { OVERDUE_AFTER_MS, TournamentContextService } from "./tournament-context.service";
import {
  entryName,
  formatSets,
  sideUserIds,
  tMatchInclude,
  toTournamentPlayer,
} from "./tournament.mappers";
import { TournamentsService } from "./tournaments.service";

/** Score text for notifications, including how a match ended without (all of) a score. */
function scoreText(sets: readonly SetScore[], outcome: MatchOutcome): string {
  const score = formatSets(sets) ?? "";
  switch (outcome) {
    case "WALKOVER":
      return "W.O.";
    case "DISQUALIFIED":
      return score ? `${score} DQ` : "DQ";
    case "RETIRED":
      return score ? `${score} ret.` : "ret.";
    default:
      return score;
  }
}

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly access: TournamentContextService,
    private readonly draw: DrawService,
    private readonly tournaments: TournamentsService,
    private readonly matches: MatchesService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  private async load(matchId: string) {
    const match = await this.prisma.tournamentMatch.findUnique({
      where: { id: matchId },
      include: { ...tMatchInclude(), tournament: true, category: true },
    });
    if (!match) throw unprocessable("TOURNAMENT_MATCH_NOT_FOUND", "api.tournamentMatchNotFound");
    return match;
  }

  private validate(
    sets: SetScore[],
    format: Parameters<ReturnType<typeof sportRules>["scoreSchemaFor"]>[0],
  ) {
    const parsed = sportRules(clubSettings().primarySport).scoreSchemaFor(format).safeParse(sets);
    if (!parsed.success) throw validationException(parsed.error);
    return parsed.data;
  }

  /**
   * A player reports a result (the other side or an organizer confirms it); an organizer's
   * report is final right away.
   */
  async report(viewer: RequestUser, matchId: string, sets: SetScore[]): Promise<void> {
    const match = await this.load(matchId);
    const canManage = await this.access.canManage(viewer, match.tournamentId);
    if (!match.entryAId || !match.entryBId) throw conflict("MATCH_NOT_READY", "api.matchNotReady");
    const playsA = sideUserIds(match.entryA).includes(viewer.id);
    const playsB = sideUserIds(match.entryB).includes(viewer.id);
    if (!canManage && !playsA && !playsB)
      throw forbidden("NOT_A_PLAYER", "api.notTournamentPlayer");
    if (!canManage && match.resultStatus !== "NONE") {
      throw conflict(
        "RESULT_EXISTS",
        match.resultStatus === "CONFIRMED" ? "api.resultAlreadyConfirmed" : "api.resultNotReported",
      );
    }
    const score = this.validate(sets, match.category.scoreFormat);
    const winner = score.winner === "A" ? match.entryAId : match.entryBId;
    if (canManage) {
      await this.finalize(matchId, {
        winnerEntryId: winner,
        outcome: "PLAYED",
        sets: score.sets,
        confirmedById: viewer.id,
        reportedById: viewer.id,
      });
      return;
    }
    const now = this.clock.now();
    await this.prisma.tournamentMatch.update({
      where: { id: matchId },
      data: {
        sets: score.sets as unknown as Prisma.InputJsonValue,
        winnerEntryId: winner,
        outcome: "PLAYED",
        resultStatus: "REPORTED",
        reportedById: viewer.id,
        reportedAt: now,
        approvalDeadline: new Date(
          now.getTime() + clubSettings().matchAutoApproveHours * 3_600_000,
        ),
      },
    });
    const opponents = playsA ? sideUserIds(match.entryB) : sideUserIds(match.entryA);
    await this.notifications.notify(opponents, "TOURNAMENT_RESULT_REPORTED", {
      tournamentId: match.tournamentId,
      tournamentName: match.tournament.name,
      matchId,
      categoryName: match.category.name,
      reportedBy: viewer.name,
      score: formatSets(score.sets) ?? "",
    });
    this.realtime.tournamentUpdated({
      tournamentId: match.tournamentId,
      categoryId: match.categoryId,
      kind: "result",
    });
  }

  /** The opponent (or an organizer) confirms a reported result. */
  async confirm(viewer: RequestUser, matchId: string): Promise<void> {
    const match = await this.load(matchId);
    if (match.resultStatus !== "REPORTED" || !match.winnerEntryId)
      throw conflict("RESULT_NOT_REPORTED", "api.resultNotReported");
    const canManage = await this.access.canManage(viewer, match.tournamentId);
    if (!canManage) {
      const reporterOnA =
        match.reportedById !== null && sideUserIds(match.entryA).includes(match.reportedById);
      const opposite = reporterOnA ? sideUserIds(match.entryB) : sideUserIds(match.entryA);
      if (!opposite.includes(viewer.id)) {
        if (
          sideUserIds(match.entryA).includes(viewer.id) ||
          sideUserIds(match.entryB).includes(viewer.id)
        ) {
          throw forbidden("REPORTER_SIDE", "api.reporterCannotConfirm");
        }
        throw forbidden("NOT_A_PLAYER", "api.notTournamentPlayer");
      }
    }
    await this.finalize(matchId, {
      winnerEntryId: match.winnerEntryId,
      outcome: match.outcome ?? "PLAYED",
      sets: (match.sets as unknown as SetScore[]) ?? [],
      confirmedById: viewer.id,
    });
  }

  /** Walkover, retirement or disqualification, decided by an organizer. */
  async setOutcome(
    viewer: RequestUser,
    matchId: string,
    input: TournamentOutcomeInput,
  ): Promise<void> {
    const match = await this.load(matchId);
    await this.access.assertCanManage(viewer, match.tournamentId);
    if (!match.entryAId || !match.entryBId) throw conflict("MATCH_NOT_READY", "api.matchNotReady");
    if (input.winnerEntryId !== match.entryAId && input.winnerEntryId !== match.entryBId) {
      throw unprocessable("WINNER_NOT_IN_MATCH", "api.winnerNotInMatch");
    }
    await this.finalize(matchId, {
      winnerEntryId: input.winnerEntryId,
      outcome: input.outcome,
      sets: (input.sets ?? []).map((set) => ({
        a: set.a,
        b: set.b,
        tiebreak: set.tiebreak ?? false,
      })),
      confirmedById: viewer.id,
      reportedById: viewer.id,
    });
  }

  /**
   * Makes a result final: moves the winner on (or crowns the champion), builds the knockout when
   * the groups are done, applies Elo when the category counts for it and notifies the players.
   */
  private async finalize(
    matchId: string,
    result: {
      winnerEntryId: string;
      outcome: MatchOutcome;
      sets: SetScore[];
      confirmedById: string | null;
      reportedById?: string;
    },
  ): Promise<void> {
    const now = this.clock.now();
    const outcome = await serializable(this.prisma, async (tx) => {
      const match = await tx.tournamentMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: { category: true, nextMatch: true },
      });
      const wasConfirmed = match.resultStatus === "CONFIRMED";
      const winnerChanged = wasConfirmed && match.winnerEntryId !== result.winnerEntryId;
      if (wasConfirmed) {
        if (match.ratedMatchId) throw conflict("RATED_RESULT_LOCKED", "api.ratedResultLocked");
        if (
          match.nextMatch &&
          match.nextMatch.resultStatus === "CONFIRMED" &&
          match.nextMatch.outcome !== "BYE"
        ) {
          throw conflict("RESULT_LOCKED", "api.resultLocked");
        }
        if (match.stage === "GROUP") {
          const decidedKnockout = await tx.tournamentMatch.count({
            where: {
              categoryId: match.categoryId,
              stage: "KNOCKOUT",
              resultStatus: "CONFIRMED",
              NOT: { outcome: "BYE" },
            },
          });
          if (decidedKnockout > 0) throw conflict("RESULT_LOCKED", "api.resultLocked");
          // The group tables may change: the knockout is rebuilt below.
          await tx.tournamentMatch.deleteMany({
            where: { categoryId: match.categoryId, stage: "KNOCKOUT" },
          });
        }
      }
      await tx.tournamentMatch.update({
        where: { id: matchId },
        data: {
          winnerEntryId: result.winnerEntryId,
          outcome: result.outcome,
          sets: result.sets as unknown as Prisma.InputJsonValue,
          resultStatus: "CONFIRMED",
          confirmedAt: now,
          confirmedById: result.confirmedById,
          ...(result.reportedById
            ? { reportedById: result.reportedById, reportedAt: match.reportedAt ?? now }
            : {}),
        },
      });
      let champion = false;
      if (match.stage === "KNOCKOUT") {
        if (match.nextMatchId) {
          await tx.tournamentMatch.update({
            where: { id: match.nextMatchId },
            data:
              match.nextSide === TeamSide.A
                ? { entryAId: result.winnerEntryId }
                : { entryBId: result.winnerEntryId },
          });
        } else {
          champion = true;
          await tx.tournamentCategory.update({
            where: { id: match.categoryId },
            data: { championEntryId: result.winnerEntryId },
          });
        }
      }
      const groups =
        match.stage === "GROUP"
          ? await this.draw.knockoutFromGroups(tx, match.categoryId)
          : { advanced: [], eliminated: [] };
      const rounds = await tx.tournamentMatch.aggregate({
        where: { categoryId: match.categoryId, stage: "KNOCKOUT" },
        _max: { round: true },
      });
      return {
        match,
        champion,
        groups,
        notify: !wasConfirmed || winnerChanged,
        koRounds: rounds._max.round ?? 0,
      };
    });

    const match = await this.load(matchId);
    const loserEntry = match.entryAId === result.winnerEntryId ? match.entryB : match.entryA;
    const winnerEntry = match.entryAId === result.winnerEntryId ? match.entryA : match.entryB;
    const score = scoreText(result.sets, result.outcome);
    const base = {
      tournamentId: match.tournamentId,
      tournamentName: match.tournament.name,
      matchId,
      categoryName: match.category.name,
    };

    // Elo, only for played matches between members in categories that count for it.
    const members = [...(winnerEntry?.players ?? []), ...(loserEntry?.players ?? [])];
    if (
      match.category.countsForElo &&
      result.outcome === "PLAYED" &&
      !match.ratedMatchId &&
      members.length > 0 &&
      members.every((player) => player.userId)
    ) {
      try {
        await this.createRatedMatch(match, result);
      } catch (error) {
        this.logger.error(
          `Elo for tournament match ${matchId} failed: ${(error as Error).message}`,
        );
      }
    }

    if (outcome.notify) {
      if (match.stage === "KNOCKOUT") {
        const winners = sideUserIds(winnerEntry);
        const losers = sideUserIds(loserEntry);
        if (outcome.champion) {
          await this.notifications.notify(winners, "TOURNAMENT_CHAMPION", {
            tournamentId: match.tournamentId,
            tournamentName: match.tournament.name,
            categoryName: match.category.name,
            score,
          });
        } else {
          await this.notifications.notify(winners, "TOURNAMENT_ADVANCED", {
            ...base,
            nextRound: outcome.koRounds ? roundName(match.round + 1, outcome.koRounds) : null,
            score,
          });
        }
        await this.notifications.notify(losers, "TOURNAMENT_ELIMINATED", { ...base, score });
      }
      if (outcome.groups.advanced.length + outcome.groups.eliminated.length > 0) {
        const usersOf = async (ids: string[]) =>
          (
            await this.prisma.tournamentEntryPlayer.findMany({
              where: { entryId: { in: ids }, userId: { not: null } },
              select: { userId: true },
            })
          ).map((row) => row.userId!);
        await this.notifications.notify(
          await usersOf(outcome.groups.advanced),
          "TOURNAMENT_ADVANCED",
          {
            ...base,
            nextRound: outcome.koRounds ? roundName(1, outcome.koRounds) : null,
            score,
          },
        );
        await this.notifications.notify(
          await usersOf(outcome.groups.eliminated),
          "TOURNAMENT_ELIMINATED",
          { ...base, score },
        );
      }
    }
    await this.tournaments.advanceStatus(match.tournamentId);
    this.realtime.tournamentUpdated({
      tournamentId: match.tournamentId,
      categoryId: match.categoryId,
      kind: "result",
    });
  }

  /** A TOURNAMENT Match row confirmed through the matches module, so Elo history stays in one place. */
  private async createRatedMatch(
    match: Awaited<ReturnType<ResultsService["load"]>>,
    result: { winnerEntryId: string; sets: SetScore[]; confirmedById: string | null },
  ): Promise<void> {
    const now = this.clock.now();
    const sideOf = (entryId: string | null) =>
      (entryId === match.entryAId ? match.entryA : match.entryB)?.players.map(
        (player) => player.userId!,
      ) ?? [];
    const reporter = match.reportedById ?? result.confirmedById ?? sideOf(match.entryAId)[0]!;
    const created = await this.prisma.match.create({
      data: {
        format: match.category.entryType,
        type: MatchType.TOURNAMENT,
        sport: clubSettings().primarySport,
        tournamentId: match.tournamentId,
        status: MatchStatus.PENDING,
        playedOn: match.scheduledDate ?? toDbDate(clubToday(now, clubTimeZone())),
        surface: match.court?.surface ?? Surface.HARTRU,
        courtId: match.courtId,
        winnerSide: result.winnerEntryId === match.entryAId ? TeamSide.A : TeamSide.B,
        reportedById: reporter,
        approvalDeadline: now,
        players: {
          create: [
            ...sideOf(match.entryAId).map((userId) => ({ userId, side: TeamSide.A })),
            ...sideOf(match.entryBId).map((userId) => ({ userId, side: TeamSide.B })),
          ],
        },
        sets: {
          create: result.sets.map((set, index) => ({
            setNumber: index + 1,
            sideAGames: set.a,
            sideBGames: set.b,
            isMatchTiebreak: set.tiebreak,
          })),
        },
      },
    });
    await this.prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { ratedMatchId: created.id },
    });
    await this.matches.confirmTournamentMatch(created.id);
  }

  /** Job: reported results nobody answered within the club's auto-approve window become final. */
  async autoConfirm(now: Date = this.clock.now()): Promise<number> {
    const due = await this.prisma.tournamentMatch.findMany({
      where: { resultStatus: "REPORTED", approvalDeadline: { lte: now } },
      select: { id: true, winnerEntryId: true, outcome: true, sets: true },
    });
    for (const match of due) {
      if (!match.winnerEntryId) continue;
      await this.finalize(match.id, {
        winnerEntryId: match.winnerEntryId,
        outcome: match.outcome ?? "PLAYED",
        sets: match.sets as unknown as SetScore[],
        confirmedById: null,
      });
    }
    return due.length;
  }

  /** Job: tells organizers (and admins) about matches still without a result 2 h after their slot. */
  async alertOverdue(now: Date = this.clock.now()): Promise<number> {
    const candidates = await this.prisma.tournamentMatch.findMany({
      where: {
        resultStatus: { not: "CONFIRMED" },
        scheduledDate: { not: null, lte: toDbDate(clubToday(now, clubTimeZone())) },
        overdueAlertedAt: null,
      },
      include: {
        ...tMatchInclude(),
        tournament: { include: { organizers: { select: { userId: true } } } },
      },
    });
    const zone = clubTimeZone();
    const admins = (
      await this.prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true },
        select: { id: true },
      })
    ).map((admin) => admin.id);
    let alerted = 0;
    for (const match of candidates) {
      if (!match.timeSlot || !match.scheduledDate) continue;
      const ended = slotEndsAt(fromDbDate(match.scheduledDate), match.timeSlot, zone);
      if (ended.getTime() + OVERDUE_AFTER_MS > now.getTime()) continue;
      const name = (side: typeof match.entryA) =>
        side ? entryName(side.players.map(toTournamentPlayer)) : "?";
      await this.notifications.notify(
        [...match.tournament.organizers.map((row) => row.userId), ...admins],
        "TOURNAMENT_RESULT_OVERDUE",
        {
          tournamentId: match.tournamentId,
          tournamentName: match.tournament.name,
          matchId: match.id,
          categoryName: match.category.name,
          players: `${name(match.entryA)} x ${name(match.entryB)}`,
          slotEndedAt: ended.toISOString(),
        },
      );
      await this.prisma.tournamentMatch.update({
        where: { id: match.id },
        data: { overdueAlertedAt: now },
      });
      alerted += 1;
    }
    return alerted;
  }

  /** Organizer panel: overdue results, results waiting for confirmation, matches on frozen courts. */
  async pending(viewer: RequestUser, tournamentId: string): Promise<PendingResults> {
    await this.access.assertCanManage(viewer, tournamentId);
    const today = clubToday(this.clock.now(), clubTimeZone());
    const matches = await this.prisma.tournamentMatch.findMany({
      where: {
        tournamentId,
        resultStatus: { not: "CONFIRMED" },
        OR: [
          { resultStatus: "REPORTED" },
          { scheduledDate: { not: null, lte: toDbDate(addDays(today, 7)) } },
        ],
      },
      include: tMatchInclude(),
      orderBy: [{ scheduledDate: "asc" }, { timeSlot: { sortOrder: "asc" } }],
    });
    const views = await this.access.views(matches, viewer, true);
    return {
      overdue: views.filter((view) => view.overdue),
      awaitingConfirmation: views.filter((view) => view.resultStatus === "REPORTED"),
      frozen: views.filter((view) => view.frozen),
    };
  }
}
