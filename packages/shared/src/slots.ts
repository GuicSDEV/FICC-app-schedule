import { clubInstant, type IsoDate } from "./dates";

export interface SlotDefinition {
  /** "HH:mm", club local time. */
  startTime: string;
  durationMinutes: number;
  /** 1-based display order. */
  sortOrder: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** True for a valid 24-hour "HH:mm" string. */
export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

/** "08:30" → 510 (minutes since midnight). */
export function timeToMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) {
    throw new RangeError(`Invalid time "${time}", expected HH:mm`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 510 → "08:30". Accepts 0 ≤ minutes < 1440. */
export function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new RangeError(`Invalid minutes ${minutes}, expected an integer in [0, 1440)`);
  }
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

type SlotTiming = Pick<SlotDefinition, "startTime" | "durationMinutes">;

/** End time of a slot: { startTime: "21:00", durationMinutes: 75 } → "22:15". */
export function slotEndTime(slot: SlotTiming): string {
  return minutesToTime(timeToMinutes(slot.startTime) + slot.durationMinutes);
}

/** UTC instant when a slot starts on a club-local date. */
export function slotStartsAt(
  date: IsoDate,
  slot: Pick<SlotDefinition, "startTime">,
  timeZone: string,
): Date {
  return clubInstant(date, slot.startTime, timeZone);
}

/** UTC instant when a slot ends on a club-local date. */
export function slotEndsAt(date: IsoDate, slot: SlotTiming, timeZone: string): Date {
  return new Date(slotStartsAt(date, slot, timeZone).getTime() + slot.durationMinutes * 60_000);
}

/** A slot is past once it has started: it can no longer be booked or scheduled. */
export function isSlotPast(
  date: IsoDate,
  slot: Pick<SlotDefinition, "startTime">,
  now: Date,
  timeZone: string,
): boolean {
  return slotStartsAt(date, slot, timeZone).getTime() <= now.getTime();
}

/** True once the slot has fully ended (e.g. a match on it may be reported). */
export function hasSlotEnded(
  date: IsoDate,
  slot: SlotTiming,
  now: Date,
  timeZone: string,
): boolean {
  return slotEndsAt(date, slot, timeZone).getTime() <= now.getTime();
}

/** True when [startsAt, endsAt) overlaps the slot; a null end means open-ended. */
export function overlapsSlot(
  window: { startsAt: Date; endsAt: Date | null },
  date: IsoDate,
  slot: SlotTiming,
  timeZone: string,
): boolean {
  const start = slotStartsAt(date, slot, timeZone).getTime();
  const end = slotEndsAt(date, slot, timeZone).getTime();
  return (
    window.startsAt.getTime() < end && (window.endsAt === null || window.endsAt.getTime() > start)
  );
}

/**
 * The first two slots of a day's grid that overlap in time (sorted by start), or null. Slots on
 * the same day must not overlap: a court can only be used by one slot at a time.
 */
export function findOverlap<T extends SlotTiming>(slots: readonly T[]): [T, T] | null {
  const sorted = [...slots].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (
      timeToMinutes(previous.startTime) + previous.durationMinutes >
      timeToMinutes(current.startTime)
    ) {
      return [previous, current];
    }
  }
  return null;
}
