import { clubInstant, type IsoDate } from "./dates";

/** Every court slot lasts 75 minutes (the grid is not hourly). */
export const SLOT_DURATION_MINUTES = 75;

/** Default daily start times, club local time (America/Sao_Paulo). */
export const DEFAULT_SLOT_START_TIMES = [
  "08:30",
  "10:00",
  "14:45",
  "16:00",
  "17:15",
  "18:30",
  "19:45",
  "21:00",
] as const;

export type DefaultSlotStartTime = (typeof DEFAULT_SLOT_START_TIMES)[number];

export interface SlotDefinition {
  /** "HH:mm", club local time. */
  startTime: string;
  durationMinutes: number;
  /** 1-based display order. */
  sortOrder: number;
}

/**
 * The club's default slot grid. It seeds the `TimeSlot` table, which admins can edit later;
 * at runtime the database is the source of truth.
 */
export const DEFAULT_SLOT_GRID: readonly SlotDefinition[] = Object.freeze(
  DEFAULT_SLOT_START_TIMES.map((startTime, index) =>
    Object.freeze({ startTime, durationMinutes: SLOT_DURATION_MINUTES, sortOrder: index + 1 }),
  ),
);

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
export function slotStartsAt(date: IsoDate, slot: Pick<SlotDefinition, "startTime">): Date {
  return clubInstant(date, slot.startTime);
}

/** UTC instant when a slot ends on a club-local date. */
export function slotEndsAt(date: IsoDate, slot: SlotTiming): Date {
  return new Date(slotStartsAt(date, slot).getTime() + slot.durationMinutes * 60_000);
}

/** A slot is past once it has started: it can no longer be booked or scheduled. */
export function isSlotPast(
  date: IsoDate,
  slot: Pick<SlotDefinition, "startTime">,
  now: Date = new Date(),
): boolean {
  return slotStartsAt(date, slot).getTime() <= now.getTime();
}

/** True once the slot has fully ended (e.g. a match on it may be reported). */
export function hasSlotEnded(date: IsoDate, slot: SlotTiming, now: Date = new Date()): boolean {
  return slotEndsAt(date, slot).getTime() <= now.getTime();
}

/** True when [startsAt, endsAt) overlaps the slot; a null end means open-ended. */
export function overlapsSlot(
  window: { startsAt: Date; endsAt: Date | null },
  date: IsoDate,
  slot: SlotTiming,
): boolean {
  const start = slotStartsAt(date, slot).getTime();
  const end = slotEndsAt(date, slot).getTime();
  return (
    window.startsAt.getTime() < end && (window.endsAt === null || window.endsAt.getTime() > start)
  );
}
