import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";

import type { Weekday } from "./enums";

/**
 * Every club-local computation takes the club's IANA time zone (`Club.timezone`, e.g.
 * "America/Sao_Paulo") explicitly, so no club's zone is baked into the code.
 */

/**
 * Club-local calendar date, "YYYY-MM-DD". All arithmetic is done in UTC on the date string, so
 * the host machine's time zone never leaks in.
 */
export type IsoDate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const isoDateSchema = z.string().refine(isIsoDate, { message: "validation.invalidDate" });

const WEEKDAYS_BY_UTC_DAY: readonly Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Today's date at the club. */
export function clubToday(now: Date, timeZone: string): IsoDate {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

/** "HH:mm" right now at the club. */
export function clubTimeOfDay(now: Date, timeZone: string): string {
  return formatInTimeZone(now, timeZone, "HH:mm");
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}

export function weekdayOf(date: IsoDate): Weekday {
  return WEEKDAYS_BY_UTC_DAY[new Date(`${date}T00:00:00.000Z`).getUTCDay()]!;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const offset = (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Value for a Prisma `@db.Date` column. */
export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Reads a Prisma `@db.Date` value back as an IsoDate. */
export function fromDbDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/** The UTC instant of a club-local date and "HH:mm" time. */
export function clubInstant(date: IsoDate, time: string, timeZone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, timeZone);
}

/** Last millisecond of a club-local day (e.g. when a guest pass expires). */
export function endOfClubDay(date: IsoDate, timeZone: string): Date {
  return new Date(clubInstant(addDays(date, 1), "00:00", timeZone).getTime() - 1);
}
