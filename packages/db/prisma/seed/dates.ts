import { CLUB_TIMEZONE } from "@ficc/shared";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { Weekday } from "../../src";

/** Club-local calendar date, "YYYY-MM-DD". Arithmetic is done in UTC so the host TZ never leaks in. */
export type IsoDate = string;

const WEEKDAYS_BY_UTC_DAY: readonly Weekday[] = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];

/** Today's date at the club. */
export function clubToday(now: Date = new Date()): IsoDate {
  return formatInTimeZone(now, CLUB_TIMEZONE, "yyyy-MM-dd");
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekdayOf(date: IsoDate): Weekday {
  return WEEKDAYS_BY_UTC_DAY[new Date(`${date}T00:00:00.000Z`).getUTCDay()]!;
}

/** Value for a `@db.Date` column. */
export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The UTC instant of a club-local date and "HH:mm" time. */
export function clubInstant(date: IsoDate, time: string): Date {
  return fromZonedTime(`${date}T${time}:00`, CLUB_TIMEZONE);
}
