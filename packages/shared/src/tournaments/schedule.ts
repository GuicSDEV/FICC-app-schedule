import type { IsoDate } from "../dates";

/** When an entry can play (set at registration). */
export interface TimeRestrictions {
  /** "HH:mm": on Monday–Friday, not before this time. */
  weekdayNotBefore: string | null;
  /** "HH:mm": on Saturday and Sunday, not before this time. */
  weekendNotBefore: string | null;
  unavailableDates: IsoDate[];
}

export const NO_RESTRICTIONS: TimeRestrictions = {
  weekdayNotBefore: null,
  weekendNotBefore: null,
  unavailableDates: [],
};

/** A court + slot that could take a match (free of bookings, lessons, freezes). */
export interface OpenSlot {
  date: IsoDate;
  courtId: string;
  timeSlotId: string;
  /** Minutes from midnight, club time. */
  start: number;
  end: number;
  weekend: boolean;
}

export interface MatchToSchedule {
  id: string;
  /** Players of both sides (user ids or guest keys). */
  playerKeys: string[];
  /** Restrictions of every entry in the match. */
  restrictions: TimeRestrictions[];
  /** Matches that must be played (scheduled earlier) first, e.g. the two feeding a knockout match. */
  dependsOn: string[];
}

/** Something already on a player's agenda (an earlier scheduled match). */
export interface Commitment {
  playerKey: string;
  date: IsoDate;
  start: number;
  end: number;
  matchId?: string;
}

export interface ScheduleAssignment {
  matchId: string;
  date: IsoDate;
  courtId: string;
  timeSlotId: string;
}

export type UnscheduledReason = "NO_SLOT" | "WAITING_PREVIOUS";

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Whether a slot suits every entry's restrictions. */
export function fitsRestrictions(
  slot: OpenSlot,
  restrictions: readonly TimeRestrictions[],
): boolean {
  return restrictions.every((rule) => {
    if (rule.unavailableDates.includes(slot.date)) return false;
    const notBefore = slot.weekend ? rule.weekendNotBefore : rule.weekdayNotBefore;
    return notBefore === null || slot.start >= minutesOf(notBefore);
  });
}

/**
 * Greedy order of play: each match (in the given order: earlier rounds first) takes the earliest
 * open slot that suits every entry's restrictions, keeps `restMinutes` between a player's matches
 * and starts after the matches it depends on. Matches waiting on unscheduled ones are skipped.
 */
export function autoSchedule(input: {
  matches: readonly MatchToSchedule[];
  slots: readonly OpenSlot[];
  commitments: readonly Commitment[];
  restMinutes: number;
}): {
  assignments: ScheduleAssignment[];
  unscheduled: { matchId: string; reason: UnscheduledReason }[];
} {
  const slots = [...input.slots].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.start - b.start || a.courtId.localeCompare(b.courtId),
  );
  const taken = new Set<string>();
  const agenda = [...input.commitments];
  const placed = new Map<string, { date: IsoDate; end: number }>();
  for (const commitment of input.commitments) {
    if (commitment.matchId)
      placed.set(commitment.matchId, { date: commitment.date, end: commitment.end });
  }
  const assignments: ScheduleAssignment[] = [];
  const unscheduled: { matchId: string; reason: UnscheduledReason }[] = [];
  const rest = input.restMinutes;

  for (const match of input.matches) {
    const deps = match.dependsOn.map((id) => placed.get(id));
    if (deps.some((dep) => dep === undefined)) {
      unscheduled.push({ matchId: match.id, reason: "WAITING_PREVIOUS" });
      continue;
    }
    const slot = slots.find((candidate) => {
      if (taken.has(`${candidate.date}:${candidate.courtId}:${candidate.timeSlotId}`)) return false;
      if (!fitsRestrictions(candidate, match.restrictions)) return false;
      const afterDeps = deps.every(
        (dep) =>
          candidate.date > dep!.date ||
          (candidate.date === dep!.date && candidate.start >= dep!.end + rest),
      );
      if (!afterDeps) return false;
      return match.playerKeys.every((player) =>
        agenda.every(
          (busy) =>
            busy.playerKey !== player ||
            busy.date !== candidate.date ||
            candidate.start >= busy.end + rest ||
            candidate.end + rest <= busy.start,
        ),
      );
    });
    if (!slot) {
      unscheduled.push({ matchId: match.id, reason: "NO_SLOT" });
      continue;
    }
    taken.add(`${slot.date}:${slot.courtId}:${slot.timeSlotId}`);
    placed.set(match.id, { date: slot.date, end: slot.end });
    for (const player of match.playerKeys) {
      agenda.push({
        playerKey: player,
        date: slot.date,
        start: slot.start,
        end: slot.end,
        matchId: match.id,
      });
    }
    assignments.push({
      matchId: match.id,
      date: slot.date,
      courtId: slot.courtId,
      timeSlotId: slot.timeSlotId,
    });
  }
  return { assignments, unscheduled };
}
