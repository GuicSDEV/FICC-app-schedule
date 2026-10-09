import { CLUB_TIMEZONE, type IsoDate } from "@ficc/shared";

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const longDayFormatter = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CLUB_TIMEZONE,
});
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: CLUB_TIMEZONE,
});

const clean = (value: string) => value.replace(/\./g, "");

/** "qui, 8 out" for a club date. */
export function formatDay(date: IsoDate): string {
  return clean(dayFormatter.format(new Date(`${date}T00:00:00Z`)));
}

/** "quinta-feira, 8 de outubro". */
export function formatLongDay(date: IsoDate): string {
  return longDayFormatter.format(new Date(`${date}T00:00:00Z`));
}

/** Club-time "18:30" for an instant. */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "08 out, 18:30" for an instant. */
export function formatDateTime(iso: string): string {
  return clean(dateTimeFormatter.format(new Date(iso)));
}

/** "há 5 min", "há 2 h", "ontem"… */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "agora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return formatDateTime(iso);
}

/** "+18" / "−12" / "0" with a real minus sign. */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

/** Short day-of-week + day number for day strips. */
export function dayParts(date: IsoDate): { weekday: string; day: string; month: string } {
  const value = new Date(`${date}T00:00:00Z`);
  return {
    weekday: clean(new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(value)),
    day: String(value.getUTCDate()),
    month: clean(new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(value)),
  };
}
