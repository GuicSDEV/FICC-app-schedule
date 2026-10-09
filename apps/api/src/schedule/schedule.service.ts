import { Injectable } from "@nestjs/common";
import { BookingStatus, CourtStatus, LessonStatus, Prisma, type Surface } from "@ficc/db";
import {
  addDays,
  clubInstant,
  type IsoDate,
  isSlotPast,
  overlapsSlot,
  type ScheduleCell,
  type ScheduleDay,
  toDbDate,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import {
  playerSelect,
  toCoachSummary,
  toCourtSummary,
  toPlayerSummary,
  toSlotSummary,
} from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { DayPlanService } from "./day-plan.service";
import { freezesOverlapping } from "./freezes";
import { clubTimeZone } from "../tenancy/tenant-context";
import { entryInclude, entryName, toTournamentPlayer } from "../tournaments/tournament.mappers";

export interface ScheduleOptions {
  surface?: Surface;
  /** Restrict to these courts (coach agenda). */
  courtIds?: readonly string[];
  /** Viewer, for favorites. */
  viewerId?: string;
  /** Show lesson student names and notes for these coach ids (or all, for admins). */
  lessonDetailsFor?: "all" | readonly string[];
}

/** Builds the courts × slots grid for one club date: lessons, bookings, tournament matches, freezes. */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly plans: DayPlanService,
  ) {}

  async getDay(date: IsoDate, options: ScheduleOptions = {}): Promise<ScheduleDay> {
    const courtWhere: Prisma.CourtWhereInput = {
      status: CourtStatus.ACTIVE,
      ...(options.surface ? { surface: options.surface } : {}),
      ...(options.courtIds ? { id: { in: [...options.courtIds] } } : {}),
    };
    const dbDate = toDbDate(date);
    const dayStart = clubInstant(date, "00:00", clubTimeZone());
    const dayEnd = clubInstant(addDays(date, 1), "00:00", clubTimeZone());

    const now = this.clock.now();
    const [
      courts,
      { plan, slots },
      lessons,
      bookings,
      tournamentMatches,
      freezes,
      favorites,
      holds,
    ] = await Promise.all([
      this.prisma.court.findMany({ where: courtWhere, orderBy: { sortOrder: "asc" } }),
      this.plans.slots(date),
      this.prisma.lesson.findMany({
        where: { date: dbDate, status: LessonStatus.SCHEDULED, court: courtWhere },
        include: { coach: true },
      }),
      this.prisma.booking.findMany({
        where: {
          date: dbDate,
          status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
          court: courtWhere,
        },
        include: { players: { include: { user: { select: playerSelect() } } } },
      }),
      this.prisma.tournamentMatch.findMany({
        where: { scheduledDate: dbDate, court: courtWhere },
        include: {
          tournament: { select: { name: true } },
          category: { select: { name: true } },
          entryA: { include: entryInclude() },
          entryB: { include: entryInclude() },
        },
      }),
      freezesOverlapping(this.prisma, dayStart, dayEnd),
      options.viewerId
        ? this.prisma.slotFavorite.findMany({ where: { userId: options.viewerId } })
        : Promise.resolve([]),
      // Courts members are booking right now (kept for them while they pick partners).
      this.prisma.slotHold.findMany({ where: { date: dbDate, expiresAt: { gt: now } } }),
    ]);

    const key = (courtId: string, slotId: string) => `${courtId}:${slotId}`;
    const lessonByCell = new Map(
      lessons.map((lesson) => [key(lesson.courtId, lesson.timeSlotId), lesson]),
    );
    const bookingByCell = new Map(
      bookings.map((booking) => [key(booking.courtId, booking.timeSlotId), booking]),
    );
    const tournamentByCell = new Map(
      tournamentMatches.map((match) => [key(match.courtId!, match.timeSlotId!), match]),
    );
    const holdByCell = new Map(holds.map((hold) => [key(hold.courtId, hold.timeSlotId), hold]));
    const favoriteCells = new Set(
      favorites.map((favorite) => key(favorite.courtId, favorite.timeSlotId)),
    );
    const showDetails = (coachId: string) =>
      options.lessonDetailsFor === "all" || (options.lessonDetailsFor?.includes(coachId) ?? false);

    const cells: ScheduleCell[] = [];
    for (const slot of slots) {
      for (const court of courts) {
        const lesson = lessonByCell.get(key(court.id, slot.id));
        const booking = bookingByCell.get(key(court.id, slot.id));
        const tournament = tournamentByCell.get(key(court.id, slot.id));
        const freeze = freezes.find(
          (candidate) =>
            candidate.courts.some((entry) => entry.courtId === court.id) &&
            overlapsSlot(candidate, date, slot, clubTimeZone()),
        );
        cells.push({
          date,
          courtId: court.id,
          timeSlotId: slot.id,
          state: plan.closedCourtIds.includes(court.id)
            ? "closed"
            : freeze
              ? "frozen"
              : lesson
                ? "lesson"
                : booking
                  ? "booking"
                  : tournament
                    ? "tournament"
                    : "free",
          past: isSlotPast(date, slot, now, clubTimeZone()),
          favorite: favoriteCells.has(key(court.id, slot.id)),
          lesson: lesson
            ? {
                id: lesson.id,
                seriesId: lesson.seriesId,
                coach: toCoachSummary(lesson.coach),
                studentNames: showDetails(lesson.coachId) ? lesson.studentNames : null,
                note: showDetails(lesson.coachId) ? lesson.note : null,
              }
            : null,
          booking: booking
            ? {
                id: booking.id,
                type: booking.type,
                status: booking.status,
                players: booking.players.map((player) => ({
                  user: toPlayerSummary(player.user),
                  status: player.status,
                })),
              }
            : null,
          tournament: tournament
            ? {
                matchId: tournament.id,
                tournamentId: tournament.tournamentId,
                tournamentName: tournament.tournament.name,
                categoryName: tournament.category.name,
                label:
                  tournament.entryA && tournament.entryB
                    ? `${entryName(tournament.entryA.players.map(toTournamentPlayer))} x ${entryName(tournament.entryB.players.map(toTournamentPlayer))}`
                    : tournament.category.name,
              }
            : null,
          freeze: freeze ? { id: freeze.id, reason: freeze.reason } : null,
          hold: (() => {
            const hold = holdByCell.get(key(court.id, slot.id));
            return hold?.expiresAt
              ? { userId: hold.userId, until: hold.expiresAt.toISOString() }
              : null;
          })(),
        });
      }
    }

    return {
      date,
      plan: this.plans.info(plan),
      courts: courts.map(toCourtSummary),
      slots: slots.map(toSlotSummary),
      cells,
    };
  }
}
