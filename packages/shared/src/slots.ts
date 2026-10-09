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

/** End time of a slot: { startTime: "21:00", durationMinutes: 75 } → "22:15". */
export function slotEndTime(slot: Pick<SlotDefinition, "startTime" | "durationMinutes">): string {
  return minutesToTime(timeToMinutes(slot.startTime) + slot.durationMinutes);
}
