import type { BookingOpening, ClubSettings } from "./club";
import { addDays, clubInstant, clubToday, type IsoDate, weekdayOf } from "./dates";
import type { CourtMode, Weekday } from "./enums";

/** A date where staff override the weekday's rules (holiday, event, maintenance day). */
export interface DateException {
  date: IsoDate;
  /** The whole club is closed that day. */
  closed: boolean;
  /** Start times used that day instead of the weekday grid (null = keep the weekday grid). */
  slotTimes: string[] | null;
  /** Court mode that day (null = the weekday's mode). */
  mode: CourtMode | null;
  /** Courts closed that day (the others work normally). */
  closedCourtIds: string[];
  note: string | null;
}

/** How one club date works: which slots exist, booking or free play, closed courts. */
export interface DayPlan {
  date: IsoDate;
  weekday: Weekday;
  mode: CourtMode;
  closed: boolean;
  /** Start times of the day's slots; null = every active slot of the club. */
  slotTimes: string[] | null;
  closedCourtIds: string[];
  /** Staff note from the date exception ("Feriado", "Torneio interclubes"…). */
  note: string | null;
  /** A date exception applies. */
  exception: boolean;
}

type DaySettings = Pick<ClubSettings, "scheduleGrids" | "dayModes">;

/** The plan of `date` from the weekday rules and an optional date exception. */
export function dayPlan(
  date: IsoDate,
  settings: DaySettings,
  exception?: DateException | null,
): DayPlan {
  const weekday = weekdayOf(date);
  const weekdayTimes = settings.scheduleGrids[weekday] ?? null;
  const weekdayMode = settings.dayModes[weekday] ?? "BOOKING";
  const slotTimes = exception?.slotTimes ?? weekdayTimes;
  return {
    date,
    weekday,
    mode: exception?.mode ?? weekdayMode,
    closed: Boolean(exception?.closed) || (slotTimes !== null && slotTimes.length === 0),
    slotTimes: slotTimes ? [...slotTimes].sort() : null,
    closedCourtIds: exception?.closedCourtIds ?? [],
    note: exception?.note ?? null,
    exception: Boolean(exception),
  };
}

/** The club's slots that exist on a planned day, in their order. */
export function slotsOfDay<T extends { startTime: string }>(
  slots: readonly T[],
  plan: DayPlan,
): T[] {
  if (plan.closed) return [];
  if (plan.slotTimes === null) return [...slots];
  const times = new Set(plan.slotTimes);
  return slots.filter((slot) => times.has(slot.startTime));
}

/** The slot exists that day and its court is not closed by the plan. */
export function isSlotInPlan(plan: DayPlan, startTime: string, courtId?: string): boolean {
  if (plan.closed) return false;
  if (courtId && plan.closedCourtIds.includes(courtId)) return false;
  return plan.slotTimes === null || plan.slotTimes.includes(startTime);
}

/** When bookings for `date` open (club rule), or null when the day opens with the window. */
export function bookingOpensAt(
  date: IsoDate,
  opening: BookingOpening | null,
  timeZone: string,
): Date | null {
  if (!opening) return null;
  return clubInstant(addDays(date, -opening.daysBefore), opening.time, timeZone);
}

export interface BookingAvailability {
  /** Inside the booking window (today … today + bookingWindowDays − 1). */
  inWindow: boolean;
  /** When bookings open; null when there is no opening rule. */
  opensAt: Date | null;
  /** Bookable right now (inside the window and already opened). */
  open: boolean;
}

/** Whether members may book `date` at `now` (server time only; the device clock never counts). */
export function bookingAvailability(
  date: IsoDate,
  now: Date,
  settings: Pick<ClubSettings, "bookingWindowDays" | "bookingOpening">,
  timeZone: string,
): BookingAvailability {
  const today = clubToday(now, timeZone);
  const inWindow = date >= today && date <= addDays(today, settings.bookingWindowDays - 1);
  const opensAt = bookingOpensAt(date, settings.bookingOpening, timeZone);
  return { inWindow, opensAt, open: inWindow && (!opensAt || opensAt <= now) };
}
