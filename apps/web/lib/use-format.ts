import type { IsoDate } from "@ficc/shared";
import { useFormatter, useNow } from "next-intl";
import { useMemo } from "react";

/** Calendar dates (club-local days) are formatted as UTC so the device's zone never shifts them. */
const asDay = (date: IsoDate) => new Date(`${date}T00:00:00Z`);
const clean = (value: string) => value.replace(/\./g, "");
const upperFirst = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** "+18" / "−12" / "0" with a real minus sign. */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}

/**
 * Date, time and relative-time formatting in the club's locale and time zone (from next-intl,
 * configured by ClubProvider). Never hardcode a locale or zone in components.
 */
export function useFormat() {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return useMemo(() => {
    const day = (date: IsoDate) =>
      clean(
        format.dateTime(asDay(date), {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }),
      );
    const longDay = (date: IsoDate) =>
      format.dateTime(asDay(date), {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      });
    return {
      /** "qui, 8 de out" */
      day,
      /** "Qui, 8 de out" for the start of a line. */
      dayTitle: (date: IsoDate) => upperFirst(day(date)),
      /** "quinta-feira, 8 de outubro" */
      longDay,
      longDayTitle: (date: IsoDate) => upperFirst(longDay(date)),
      /** Club-time "18:30" for an instant. */
      time: (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit" }),
      /** "08 de out, 18:30" for an instant. */
      dateTime: (iso: string) =>
        clean(
          format.dateTime(new Date(iso), {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
        ),
      /** "há 5 minutos" / "em 2 horas", relative to now. */
      relative: (iso: string) => format.relativeTime(new Date(iso), now),
      /** Parts for the day strip: short weekday, day number, short month. */
      dayParts: (date: IsoDate) => ({
        weekday: clean(format.dateTime(asDay(date), { weekday: "short", timeZone: "UTC" })),
        day: format.dateTime(asDay(date), { day: "numeric", timeZone: "UTC" }),
        month: clean(format.dateTime(asDay(date), { month: "short", timeZone: "UTC" })),
      }),
      number: (value: number) => format.number(value),
      delta: formatDelta,
    };
  }, [format, now]);
}
