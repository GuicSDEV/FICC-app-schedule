"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useFormat } from "@/lib/use-format";
import { spring, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Horizontal snap-scrolling strip of days; today is marked and the selection pill glides. */
export function DayStrip({
  days,
  today,
  value,
  onChange,
  layoutGroup = "day-strip",
}: {
  days: string[];
  today: string;
  value: string;
  onChange: (date: string) => void;
  layoutGroup?: string;
}) {
  const t = useTranslations("calendar");
  const common = useTranslations("common");
  const format = useFormat();
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected day in view (e.g. when it is changed from elsewhere).
  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-date="${value}"]`);
    element?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [value]);

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={t("dayLabel")}
      className="-mx-4 no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-1.5 overflow-x-auto px-4 pb-2 md:-mx-8 md:scroll-px-8 md:px-8"
    >
      {days.map((date) => {
        const parts = format.dayParts(date);
        const selected = date === value;
        const isToday = date === today;
        return (
          <motion.button
            key={date}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(isToday ? "todayOption" : "dayOption", parts)}
            data-date={date}
            whileTap={tap}
            onClick={() => onChange(date)}
            className={cn(
              "relative flex h-[4.25rem] w-[3.25rem] shrink-0 snap-start flex-col items-center justify-center rounded-lg transition-tokens",
              selected ? "text-primary-foreground" : "text-foreground hover:bg-surface-2",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`${layoutGroup}-pill`}
                transition={spring.snappy}
                className="absolute inset-0 rounded-lg bg-primary shadow-glow"
              />
            ) : null}
            <span
              className={cn(
                "relative text-caption font-medium capitalize",
                selected ? "opacity-80" : "text-muted-foreground",
              )}
            >
              {isToday ? common("today") : parts.weekday}
            </span>
            <span className="relative num font-display text-title leading-tight font-semibold">
              {parts.day}
            </span>
            {isToday && !selected ? (
              <span aria-hidden className="relative size-1 rounded-full bg-primary" />
            ) : (
              <span aria-hidden className="size-1" />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
