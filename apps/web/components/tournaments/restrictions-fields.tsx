"use client";

import type { TimeRestrictions } from "@ficc/shared";
import { useTranslations } from "next-intl";

import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Label } from "@/components/ui/input";
import { useFormat } from "@/lib/use-format";

/** Times a player may ask not to play before (weekday evenings, weekend mornings). */
const WEEKDAY_TIMES = ["17:00", "18:00", "19:00", "20:00"];
const WEEKEND_TIMES = ["08:00", "09:00", "10:00", "12:00", "14:00"];

/**
 * "I can't play before…" on weekdays and weekends, plus tournament days the entry can't play.
 * The order of play respects these.
 */
export function RestrictionsFields({
  value,
  onChange,
  dates,
}: {
  value: TimeRestrictions;
  onChange: (value: TimeRestrictions) => void;
  /** The tournament's days. */
  dates: string[];
}) {
  const t = useTranslations("tournaments.restrictions");
  const format = useFormat();
  const toggleDate = (date: string) =>
    onChange({
      ...value,
      unavailableDates: value.unavailableDates.includes(date)
        ? value.unavailableDates.filter((entry) => entry !== date)
        : [...value.unavailableDates, date].sort(),
    });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("weekday")}</Label>
        <ChipGroup label={t("weekday")}>
          <ChoiceChip
            selected={value.weekdayNotBefore === null}
            onClick={() => onChange({ ...value, weekdayNotBefore: null })}
          >
            {t("any")}
          </ChoiceChip>
          {WEEKDAY_TIMES.map((time) => (
            <ChoiceChip
              key={time}
              selected={value.weekdayNotBefore === time}
              onClick={() => onChange({ ...value, weekdayNotBefore: time })}
            >
              {t("from", { time })}
            </ChoiceChip>
          ))}
        </ChipGroup>
      </div>
      <div className="space-y-2">
        <Label>{t("weekend")}</Label>
        <ChipGroup label={t("weekend")}>
          <ChoiceChip
            selected={value.weekendNotBefore === null}
            onClick={() => onChange({ ...value, weekendNotBefore: null })}
          >
            {t("any")}
          </ChoiceChip>
          {WEEKEND_TIMES.map((time) => (
            <ChoiceChip
              key={time}
              selected={value.weekendNotBefore === time}
              onClick={() => onChange({ ...value, weekendNotBefore: time })}
            >
              {t("from", { time })}
            </ChoiceChip>
          ))}
        </ChipGroup>
      </div>
      {dates.length > 0 ? (
        <div className="space-y-2">
          <Label>{t("unavailable")}</Label>
          <ChipGroup label={t("unavailable")}>
            {dates.map((date) => (
              <ChoiceChip
                key={date}
                selected={value.unavailableDates.includes(date)}
                onClick={() => toggleDate(date)}
                showCheck
              >
                {format.dayTitle(date)}
              </ChoiceChip>
            ))}
          </ChipGroup>
          <p className="text-caption text-muted-foreground">{t("unavailableHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
