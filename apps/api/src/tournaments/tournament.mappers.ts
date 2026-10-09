import type { Prisma } from "@ficc/db";
import {
  type EntrySummary,
  fromDbDate,
  NO_RESTRICTIONS,
  roundName,
  type SetScore,
  slotEndTime,
  type TimeRestrictions,
  type TournamentMatchView,
  type TournamentPlayer,
  timeRestrictionsSchema,
} from "@ficc/shared";

import { playerSelect } from "../common/mappers";
import { clubSettings } from "../tenancy/tenant-context";

export function entryInclude() {
  return {
    players: {
      include: { user: { select: playerSelect() } },
      orderBy: { position: "asc" },
    },
  } satisfies Prisma.TournamentEntryInclude;
}

export type EntryRow = Prisma.TournamentEntryGetPayload<{
  include: ReturnType<typeof entryInclude>;
}>;

export function toTournamentPlayer(player: EntryRow["players"][number]): TournamentPlayer {
  if (player.user) {
    return {
      userId: player.user.id,
      name: player.user.name,
      photoUrl: player.user.photoUrl,
      elo: player.user.ratings[0]?.elo ?? clubSettings().eloInitialRating,
      guest: false,
      accepted: player.acceptedAt !== null,
    };
  }
  return {
    userId: null,
    name: player.guestName ?? "",
    photoUrl: null,
    elo: null,
    guest: true,
    accepted: player.acceptedAt !== null,
  };
}

/** "Ana / Bia" with first names for doubles, the full name for singles. */
export function entryName(players: readonly TournamentPlayer[]): string {
  if (players.length === 1) return players[0]!.name;
  return players.map((player) => player.name.split(" ")[0] ?? player.name).join(" / ");
}

/** Average Elo of the entry (guests count as the club's initial rating). */
export function entryElo(entry: EntryRow): number {
  const initial = clubSettings().eloInitialRating;
  const ratings = entry.players.map((player) =>
    player.user ? (player.user.ratings[0]?.elo ?? initial) : initial,
  );
  return Math.round(ratings.reduce((sum, value) => sum + value, 0) / Math.max(1, ratings.length));
}

export function parseRestrictions(value: Prisma.JsonValue): TimeRestrictions {
  const parsed = timeRestrictionsSchema.safeParse(value);
  return parsed.success ? parsed.data : NO_RESTRICTIONS;
}

/** Stable key of a player for schedules and circuits (user id or guest name). */
export function playerKey(player: { userId: string | null; guestName: string | null }): string {
  return player.userId ?? `guest:${(player.guestName ?? "").trim().toLowerCase()}`;
}

export function toEntrySummary(
  entry: EntryRow,
  options: { rating?: number; private?: boolean } = {},
): EntrySummary {
  const players = entry.players.map(toTournamentPlayer);
  return {
    id: entry.id,
    categoryId: entry.categoryId,
    status: entry.status,
    paymentStatus: entry.paymentStatus,
    seed: entry.seed,
    name: entryName(players),
    players,
    rating: options.rating ?? entryElo(entry),
    createdAt: entry.createdAt.toISOString(),
    note: options.private ? entry.note : null,
    restrictions: options.private ? parseRestrictions(entry.restrictions) : null,
  };
}

export function lightEntry(entry: EntryRow | null) {
  if (!entry) return null;
  const players = entry.players.map(toTournamentPlayer);
  return { id: entry.id, name: entryName(players), players, seed: entry.seed };
}

export function tMatchInclude() {
  return {
    category: { select: { name: true, scoreFormat: true } },
    group: { select: { name: true } },
    entryA: { include: entryInclude() },
    entryB: { include: entryInclude() },
    court: true,
    timeSlot: true,
    reportedBy: { select: { id: true, name: true } },
    feeders: { select: { round: true, position: true, nextSide: true } },
  } satisfies Prisma.TournamentMatchInclude;
}

export type TMatchRow = Prisma.TournamentMatchGetPayload<{
  include: ReturnType<typeof tMatchInclude>;
}>;

export function parseSets(value: Prisma.JsonValue): SetScore[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((set) => {
    if (!set || typeof set !== "object" || Array.isArray(set)) return [];
    const { a, b, tiebreak } = set as Record<string, unknown>;
    return typeof a === "number" && typeof b === "number"
      ? [{ a, b, tiebreak: tiebreak === true }]
      : [];
  });
}

export function formatSets(sets: readonly SetScore[]): string | null {
  if (sets.length === 0) return null;
  return sets.map((set) => (set.tiebreak ? `[${set.a}-${set.b}]` : `${set.a}-${set.b}`)).join(", ");
}

/** Member user ids on one side of a match. */
export function sideUserIds(entry: EntryRow | null): string[] {
  return (entry?.players ?? []).flatMap((player) => (player.userId ? [player.userId] : []));
}

export interface MatchViewContext {
  viewerId?: string;
  canManage: boolean;
  /** Knockout rounds per category (for round names). */
  koRounds: Map<string, number>;
  /** Published order-of-play days per tournament ("tournamentId:date"). */
  publishedDays: Set<string>;
  frozenMatchIds: Set<string>;
  overdueMatchIds: Set<string>;
}

export function toMatchView(match: TMatchRow, context: MatchViewContext): TournamentMatchView {
  const sets = parseSets(match.sets);
  const date = match.scheduledDate ? fromDbDate(match.scheduledDate) : null;
  const playersA = sideUserIds(match.entryA);
  const playersB = sideUserIds(match.entryB);
  const viewer = context.viewerId;
  const playsA = viewer !== undefined && playersA.includes(viewer);
  const playsB = viewer !== undefined && playersB.includes(viewer);
  const decided = match.resultStatus === "CONFIRMED";
  const ready = match.entryAId !== null && match.entryBId !== null;
  const reporterOnA = match.reportedById !== null && playersA.includes(match.reportedById);
  const reporterOnB = match.reportedById !== null && playersB.includes(match.reportedById);
  const feeder = (side: "A" | "B") => {
    const found = match.feeders.find((entry) => entry.nextSide === side);
    return found ? { round: found.round, position: found.position } : null;
  };
  const rounds = context.koRounds.get(match.categoryId) ?? 0;
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    categoryId: match.categoryId,
    categoryName: match.category.name,
    stage: match.stage,
    groupName: match.group?.name ?? null,
    round: match.round,
    roundName: match.stage === "KNOCKOUT" && rounds > 0 ? roundName(match.round, rounds) : null,
    position: match.position,
    a: lightEntry(match.entryA),
    b: lightEntry(match.entryB),
    feederA: feeder("A"),
    feederB: feeder("B"),
    winnerEntryId: match.winnerEntryId,
    outcome: match.outcome,
    resultStatus: match.resultStatus,
    sets,
    score: formatSets(sets),
    reportedBy: match.reportedBy?.name ?? null,
    schedule:
      date && match.court && match.timeSlot
        ? {
            date,
            courtId: match.court.id,
            courtName: match.court.name,
            timeSlotId: match.timeSlot.id,
            startTime: match.timeSlot.startTime,
            endTime: slotEndTime(match.timeSlot),
            published: context.publishedDays.has(`${match.tournamentId}:${date}`),
          }
        : null,
    overdue: context.overdueMatchIds.has(match.id),
    frozen: context.frozenMatchIds.has(match.id),
    viewer: {
      canReport:
        ready &&
        match.outcome !== "BYE" &&
        (context.canManage || (!decided && match.resultStatus === "NONE" && (playsA || playsB))),
      canConfirm:
        match.resultStatus === "REPORTED" &&
        (context.canManage || (playsA && reporterOnB) || (playsB && reporterOnA)),
    },
  };
}
