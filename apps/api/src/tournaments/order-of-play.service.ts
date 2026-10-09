import { Injectable } from "@nestjs/common";
import { CourtStatus } from "@ficc/db";
import {
  addDays,
  autoSchedule,
  type AutoScheduleInput,
  type AutoScheduleResult,
  type BoardCellState,
  clubInstant,
  type Commitment,
  fromDbDate,
  type IsoDate,
  isSlotPast,
  type MatchToSchedule,
  type OpenSlot,
  type OrderOfPlay,
  overlapsSlot,
  type ScheduleBoard,
  type ScheduleMatchInput,
  slotEndTime,
  toDbDate,
  weekdayOf,
} from "@ficc/shared";

import type { RequestUser } from "../common/auth.decorators";
import { Clock } from "../common/clock";
import { conflict, unprocessable } from "../common/domain.exception";
import { toCourtSummary, toSlotSummary } from "../common/mappers";
import { isUniqueViolation, serializable, type Tx } from "../common/transactions";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { freezesOverlapping, isCourtFrozen } from "../schedule/freezes";
import { SlotEventsService } from "../schedule/slot-events.service";
import { clubTimeZone } from "../tenancy/tenant-context";
import { TournamentContextService } from "./tournament-context.service";
import {
  entryName,
  parseRestrictions,
  playerKey,
  sideUserIds,
  tMatchInclude,
  type TMatchRow,
  toTournamentPlayer,
} from "./tournament.mappers";

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

@Injectable()
export class OrderOfPlayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly access: TournamentContextService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly slotEvents: SlotEventsService,
  ) {}

  private async courtsOf(client: Tx, tournamentId: string) {
    const tournament = await client.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    return client.court.findMany({
      where: {
        status: CourtStatus.ACTIVE,
        ...(tournament.courtIds.length > 0 ? { id: { in: tournament.courtIds } } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });
  }

  /** Courts × slots of one date with what occupies each cell, plus matches to place. */
  async board(viewer: RequestUser, tournamentId: string, date: IsoDate): Promise<ScheduleBoard> {
    await this.access.assertCanManage(viewer, tournamentId);
    const dbDate = toDbDate(date);
    const zone = clubTimeZone();
    const [courts, slots, occupancies, freezes, published] = await Promise.all([
      this.courtsOf(this.prisma, tournamentId),
      this.prisma.timeSlot.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.slotOccupancy.findMany({ where: { date: dbDate } }),
      freezesOverlapping(
        this.prisma,
        clubInstant(date, "00:00", zone),
        clubInstant(addDays(date, 1), "00:00", zone),
      ),
      this.prisma.tournamentScheduleDay.findUnique({
        where: { tournamentId_date: { tournamentId, date: dbDate } },
      }),
    ]);
    const now = this.clock.now();
    const cells: ScheduleBoard["cells"] = [];
    for (const slot of slots) {
      for (const court of courts) {
        const occupancy = occupancies.find(
          (entry) => entry.courtId === court.id && entry.timeSlotId === slot.id,
        );
        const frozen = freezes.some(
          (freeze) =>
            freeze.courts.some((entry) => entry.courtId === court.id) &&
            overlapsSlot(freeze, date, slot, zone),
        );
        const state: BoardCellState = frozen
          ? "frozen"
          : occupancy?.lessonId
            ? "lesson"
            : occupancy?.bookingId
              ? "booking"
              : occupancy?.tournamentMatchId
                ? "tournament"
                : "free";
        cells.push({
          courtId: court.id,
          timeSlotId: slot.id,
          state,
          matchId: occupancy?.tournamentMatchId ?? null,
          past: isSlotPast(date, slot, now, zone),
        });
      }
    }
    const [scheduled, unscheduled] = await Promise.all([
      this.prisma.tournamentMatch.findMany({
        where: { tournamentId, scheduledDate: dbDate },
        include: tMatchInclude(),
        orderBy: [{ timeSlot: { sortOrder: "asc" } }, { court: { sortOrder: "asc" } }],
      }),
      this.prisma.tournamentMatch.findMany({
        where: {
          tournamentId,
          scheduledDate: null,
          resultStatus: { not: "CONFIRMED" },
          category: { drawPublishedAt: { not: null } },
        },
        include: tMatchInclude(),
        orderBy: [
          { category: { sortOrder: "asc" } },
          { stage: "asc" },
          { round: "asc" },
          { position: "asc" },
        ],
      }),
    ]);
    const ready = (match: TMatchRow) => (match.entryAId && match.entryBId ? 0 : 1);
    unscheduled.sort((a, b) => ready(a) - ready(b));
    const views = await this.access.views([...scheduled, ...unscheduled], viewer, true);
    return {
      date,
      courts: courts.map(toCourtSummary),
      slots: slots.map(toSlotSummary),
      cells,
      scheduled: views.slice(0, scheduled.length),
      unscheduled: views.slice(scheduled.length),
      published: published !== null,
    };
  }

  /** Puts a match on a court and slot (claiming it like a booking), or moves it. */
  async schedule(viewer: RequestUser, matchId: string, input: ScheduleMatchInput): Promise<void> {
    const tournamentId = await this.access.tournamentOfMatch(matchId);
    await this.access.assertCanManage(viewer, tournamentId);
    const before = await this.prisma.tournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
    await serializable(this.prisma, (tx) => this.place(tx, tournamentId, matchId, input));
    await this.afterMove(tournamentId, before, input);
  }

  private async place(
    tx: Tx,
    tournamentId: string,
    matchId: string,
    input: ScheduleMatchInput,
  ): Promise<void> {
    const match = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
    if (match.resultStatus === "CONFIRMED") throw conflict("MATCH_DECIDED", "api.matchDecided");
    const courts = await this.courtsOf(tx, tournamentId);
    if (!courts.some((court) => court.id === input.courtId))
      throw unprocessable("COURT_NOT_ALLOWED", "api.tournamentCourtNotAllowed");
    const slot = await tx.timeSlot.findUnique({ where: { id: input.timeSlotId } });
    if (!slot) throw unprocessable("COURT_NOT_ALLOWED", "api.tournamentSlotTaken");
    if (isSlotPast(input.date, slot, this.clock.now(), clubTimeZone())) {
      throw unprocessable("SLOT_PAST", "api.tournamentSlotPast");
    }
    if (await isCourtFrozen(tx, input.courtId, input.date, slot)) {
      throw conflict("COURT_FROZEN", "api.tournamentCourtFrozen");
    }
    await tx.slotOccupancy.deleteMany({ where: { tournamentMatchId: matchId } });
    try {
      await tx.slotOccupancy.create({
        data: {
          courtId: input.courtId,
          date: toDbDate(input.date),
          timeSlotId: input.timeSlotId,
          tournamentMatchId: matchId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("SLOT_TAKEN", "api.tournamentSlotTaken");
      throw error;
    }
    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        scheduledDate: toDbDate(input.date),
        courtId: input.courtId,
        timeSlotId: input.timeSlotId,
        overdueAlertedAt: null,
      },
    });
  }

  async unschedule(viewer: RequestUser, matchId: string): Promise<void> {
    const tournamentId = await this.access.tournamentOfMatch(matchId);
    await this.access.assertCanManage(viewer, tournamentId);
    const before = await this.prisma.tournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
    if (!before.scheduledDate) return;
    await this.prisma.$transaction([
      this.prisma.slotOccupancy.deleteMany({ where: { tournamentMatchId: matchId } }),
      this.prisma.tournamentMatch.update({
        where: { id: matchId },
        data: { scheduledDate: null, courtId: null, timeSlotId: null },
      }),
    ]);
    await this.afterMove(tournamentId, before, null);
  }

  /** Live calendars, and players told when a published day changes. */
  private async afterMove(
    tournamentId: string,
    before: {
      id: string;
      scheduledDate: Date | null;
      courtId: string | null;
      timeSlotId: string | null;
    },
    after: ScheduleMatchInput | null,
  ): Promise<void> {
    const oldCell =
      before.scheduledDate && before.courtId && before.timeSlotId
        ? { date: before.scheduledDate, courtId: before.courtId, timeSlotId: before.timeSlotId }
        : null;
    if (after) this.slotEvents.changed("tournament.scheduled", [after]);
    if (oldCell) await this.slotEvents.released("tournament.unscheduled", [oldCell]);
    this.realtime.tournamentUpdated({ tournamentId, categoryId: null, kind: "schedule" });

    const days = [oldCell ? fromDbDate(oldCell.date) : null, after?.date ?? null].filter(
      (day): day is string => day !== null,
    );
    if (days.length === 0) return;
    const published = await this.prisma.tournamentScheduleDay.findMany({
      where: { tournamentId, date: { in: days.map(toDbDate) } },
    });
    if (published.length === 0) return;
    const match = await this.prisma.tournamentMatch.findUniqueOrThrow({
      where: { id: before.id },
      include: { ...tMatchInclude(), tournament: { select: { name: true } } },
    });
    await this.notifyPlayers(match, "TOURNAMENT_MATCH_CHANGED");
    await this.prisma.tournamentMatch.update({
      where: { id: match.id },
      data: { scheduleNotifiedAt: this.clock.now() },
    });
  }

  private async notifyPlayers(
    match: TMatchRow & { tournament: { name: string } },
    type: "TOURNAMENT_MATCH_SCHEDULED" | "TOURNAMENT_MATCH_CHANGED",
  ): Promise<void> {
    const name = (side: TMatchRow["entryA"]) =>
      side ? entryName(side.players.map(toTournamentPlayer)) : "?";
    const base = {
      tournamentId: match.tournamentId,
      tournamentName: match.tournament.name,
      matchId: match.id,
      categoryName: match.category.name,
    };
    const sides = [
      { users: sideUserIds(match.entryA), opponent: name(match.entryB) },
      { users: sideUserIds(match.entryB), opponent: name(match.entryA) },
    ];
    for (const side of sides) {
      if (side.users.length === 0) continue;
      if (
        type === "TOURNAMENT_MATCH_SCHEDULED" &&
        match.scheduledDate &&
        match.court &&
        match.timeSlot
      ) {
        await this.notifications.notify(side.users, type, {
          ...base,
          date: fromDbDate(match.scheduledDate),
          startTime: match.timeSlot.startTime,
          courtName: match.court.name,
          opponent: side.opponent,
        });
      } else {
        await this.notifications.notify(side.users, "TOURNAMENT_MATCH_CHANGED", {
          ...base,
          date: match.scheduledDate ? fromDbDate(match.scheduledDate) : null,
          startTime: match.timeSlot?.startTime ?? null,
          courtName: match.court?.name ?? null,
          opponent: side.opponent,
        });
      }
    }
  }

  /** Publishes a day's order of play and notifies every player scheduled on it. */
  async publish(viewer: RequestUser, tournamentId: string, date: IsoDate): Promise<void> {
    await this.access.assertCanManage(viewer, tournamentId);
    await this.prisma.tournamentScheduleDay.upsert({
      where: { tournamentId_date: { tournamentId, date: toDbDate(date) } },
      update: { publishedAt: this.clock.now() },
      create: { tournamentId, date: toDbDate(date) },
    });
    const matches = await this.prisma.tournamentMatch.findMany({
      where: { tournamentId, scheduledDate: toDbDate(date), resultStatus: { not: "CONFIRMED" } },
      include: { ...tMatchInclude(), tournament: { select: { name: true } } },
    });
    for (const match of matches) {
      await this.notifyPlayers(match, "TOURNAMENT_MATCH_SCHEDULED");
    }
    await this.prisma.tournamentMatch.updateMany({
      where: { id: { in: matches.map((match) => match.id) } },
      data: { scheduleNotifiedAt: this.clock.now() },
    });
    this.realtime.tournamentUpdated({ tournamentId, categoryId: null, kind: "schedule" });
  }

  /**
   * Rain or maintenance: takes every undecided match scheduled on a frozen court off its slot
   * (telling its players) and places them again in the given dates' open slots.
   */
  async rescheduleFrozen(
    viewer: RequestUser,
    tournamentId: string,
    input: AutoScheduleInput,
  ): Promise<AutoScheduleResult & { moved: number }> {
    await this.access.assertCanManage(viewer, tournamentId);
    const scheduled = await this.prisma.tournamentMatch.findMany({
      where: { tournamentId, scheduledDate: { not: null }, resultStatus: { not: "CONFIRMED" } },
      include: tMatchInclude(),
    });
    const context = await this.access.context(scheduled, viewer, true);
    const frozen = scheduled.filter((match) => context.frozenMatchIds.has(match.id));
    for (const match of frozen) {
      await this.prisma.$transaction([
        this.prisma.slotOccupancy.deleteMany({ where: { tournamentMatchId: match.id } }),
        this.prisma.tournamentMatch.update({
          where: { id: match.id },
          data: { scheduledDate: null, courtId: null, timeSlotId: null },
        }),
      ]);
      await this.afterMove(tournamentId, match, null);
    }
    const result = await this.autoSchedule(viewer, tournamentId, input);
    return { ...result, moved: frozen.length };
  }

  /**
   * Places every undecided match of the tournament (or of some categories) into the open slots of
   * the given dates, respecting entries' time restrictions, rest between a player's matches,
   * knockout order and the club's bookings, lessons and freezes.
   */
  async autoSchedule(
    viewer: RequestUser,
    tournamentId: string,
    input: AutoScheduleInput,
  ): Promise<AutoScheduleResult> {
    await this.access.assertCanManage(viewer, tournamentId);
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
    });
    const zone = clubTimeZone();
    const now = this.clock.now();
    const dates = [...new Set(input.dates)].sort();
    const [courts, slots, occupancies] = await Promise.all([
      this.courtsOf(this.prisma, tournamentId),
      this.prisma.timeSlot.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.slotOccupancy.findMany({ where: { date: { in: dates.map(toDbDate) } } }),
    ]);
    const freezes = await freezesOverlapping(
      this.prisma,
      clubInstant(dates[0]!, "00:00", zone),
      clubInstant(addDays(dates[dates.length - 1]!, 1), "00:00", zone),
    );
    const open: OpenSlot[] = [];
    for (const date of dates) {
      const weekday = weekdayOf(date);
      for (const slot of slots) {
        if (isSlotPast(date, slot, now, zone)) continue;
        for (const court of courts) {
          const taken = occupancies.some(
            (entry) =>
              fromDbDate(entry.date) === date &&
              entry.courtId === court.id &&
              entry.timeSlotId === slot.id,
          );
          const frozen = freezes.some(
            (freeze) =>
              freeze.courts.some((entry) => entry.courtId === court.id) &&
              overlapsSlot(freeze, date, slot, zone),
          );
          if (taken || frozen) continue;
          open.push({
            date,
            courtId: court.id,
            timeSlotId: slot.id,
            start: minutesOf(slot.startTime),
            end: minutesOf(slotEndTime(slot)),
            weekend: weekday === "SAT" || weekday === "SUN",
          });
        }
      }
    }

    const all = await this.prisma.tournamentMatch.findMany({
      where: {
        tournamentId,
        category: {
          drawPublishedAt: { not: null },
          ...(input.categoryIds ? { id: { in: input.categoryIds } } : {}),
        },
      },
      include: {
        entryA: { include: { players: true } },
        entryB: { include: { players: true } },
        timeSlot: true,
        feeders: { select: { id: true, resultStatus: true } },
      },
      orderBy: [{ stage: "asc" }, { round: "asc" }, { position: "asc" }],
    });
    const keysOf = (entry: (typeof all)[number]["entryA"]) =>
      entry ? entry.players.map(playerKey) : [];
    const commitments: Commitment[] = all
      .filter(
        (match) => match.scheduledDate && match.timeSlot && match.resultStatus !== "CONFIRMED",
      )
      .flatMap((match) => {
        const date = fromDbDate(match.scheduledDate!);
        const start = minutesOf(match.timeSlot!.startTime);
        const end = minutesOf(slotEndTime(match.timeSlot!));
        const keys = [...keysOf(match.entryA), ...keysOf(match.entryB)];
        // A key per match so dependants know when it ends even without known players.
        return [...keys, `match:${match.id}`].map((key) => ({
          playerKey: key,
          date,
          start,
          end,
          matchId: match.id,
        }));
      });
    const toPlace: MatchToSchedule[] = all
      .filter(
        (match) =>
          !match.scheduledDate && match.resultStatus !== "CONFIRMED" && match.outcome !== "BYE",
      )
      .map((match) => ({
        id: match.id,
        playerKeys: [...keysOf(match.entryA), ...keysOf(match.entryB)],
        restrictions: [match.entryA, match.entryB].flatMap((entry) =>
          entry ? [parseRestrictions(entry.restrictions)] : [],
        ),
        // Knockout matches wait for the matches that feed them (unless those are already decided).
        dependsOn: match.feeders
          .filter((feeder) => feeder.resultStatus !== "CONFIRMED")
          .map((feeder) => feeder.id),
      }));
    const plan = autoSchedule({
      matches: toPlace,
      slots: open,
      commitments,
      restMinutes: tournament.restMinutes,
    });

    let scheduled = 0;
    const unscheduled = [...plan.unscheduled];
    for (const assignment of plan.assignments) {
      try {
        await serializable(this.prisma, (tx) =>
          this.place(tx, tournamentId, assignment.matchId, assignment),
        );
        this.slotEvents.changed("tournament.scheduled", [assignment]);
        scheduled += 1;
      } catch {
        // Taken meanwhile (a member booked it): leave the match for the next run.
        unscheduled.push({ matchId: assignment.matchId, reason: "NO_SLOT" });
      }
    }
    this.realtime.tournamentUpdated({ tournamentId, categoryId: null, kind: "schedule" });
    return { scheduled, unscheduled };
  }

  /** Published days of a tournament (all days for organizers), with their matches. */
  async orderOfPlay(
    viewer: RequestUser | undefined,
    tournamentId: string,
    canManageHint?: boolean,
  ): Promise<OrderOfPlay[]> {
    const canManage = canManageHint ?? (await this.access.canManage(viewer, tournamentId));
    const [published, matches] = await Promise.all([
      this.prisma.tournamentScheduleDay.findMany({
        where: { tournamentId },
        orderBy: { date: "asc" },
      }),
      this.prisma.tournamentMatch.findMany({
        where: { tournamentId, scheduledDate: { not: null } },
        include: tMatchInclude(),
        orderBy: [
          { scheduledDate: "asc" },
          { timeSlot: { sortOrder: "asc" } },
          { court: { sortOrder: "asc" } },
        ],
      }),
    ]);
    const publishedDays = new Set(published.map((day) => fromDbDate(day.date)));
    const views = await this.access.views(matches, viewer, canManage);
    const days = [...new Set(matches.map((match) => fromDbDate(match.scheduledDate!)))].filter(
      (day) => canManage || publishedDays.has(day),
    );
    return days.map((date) => ({
      date,
      published: publishedDays.has(date),
      matches: views.filter((view) => view.schedule?.date === date),
    }));
  }
}
