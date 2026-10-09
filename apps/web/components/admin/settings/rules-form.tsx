"use client";

import {
  type ClubSettings,
  clubSettingsSchema,
  type CourtMode,
  type SlotSummary,
  type Weekday,
  WEEKDAYS,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { enter, haptic, popVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

import { SlotCatalogue } from "./slot-catalogue";

/** Numeric rules, by dotted path in ClubSettings, grouped by section. */
const NUMBER_FIELDS = {
  booking: [
    "bookingWindowDays",
    "maxActiveBookings",
    "maxBookingsPerDay",
    "bookingConfirmationMinutes",
    "lateCancellationMinutes",
    "slotHoldSeconds",
  ],
  freePlay: ["freePlay.claimMinutes", "freePlay.sessionMinutes"],
  noShows: ["noShowPenalty.count", "noShowPenalty.windowDays", "noShowPenalty.suspensionDays"],
  other: [
    "matchAutoApproveHours",
    "matchReportMaxDaysAgo",
    "eloKFactor",
    "eloInitialRating",
    "rankingTrendDays",
    "lessonWindowDays",
    "slotOpenedNotifyDays",
    "defaultSlotDurationMinutes",
    "guestPassMaxDaysAhead",
    "guestDataRetentionDays",
  ],
} as const;
type NumberPath = (typeof NUMBER_FIELDS)[keyof typeof NUMBER_FIELDS][number];
type MessageKey<P> = P extends `${infer A}.${infer B}` ? `${A}_${B}` : P;
const ALL_NUMBER_PATHS: NumberPath[] = Object.values(NUMBER_FIELDS).flat();

function readPath(settings: ClubSettings, path: NumberPath): number {
  const [head, tail] = path.split(".") as [string, string | undefined];
  const value = (settings as unknown as Record<string, unknown>)[head];
  return (tail ? (value as Record<string, number>)[tail] : value) as number;
}

function withNumbers(settings: ClubSettings, numbers: Record<NumberPath, string>): unknown {
  const next = structuredClone(settings) as unknown as Record<string, Record<string, unknown>>;
  for (const path of ALL_NUMBER_PATHS) {
    const raw = numbers[path].trim();
    const value = raw === "" ? Number.NaN : Number(raw);
    const [head, tail] = path.split(".") as [string, string | undefined];
    if (tail) next[head]![tail] = value;
    else (next as Record<string, unknown>)[head] = value;
  }
  return next;
}

function numbersOf(settings: ClubSettings): Record<NumberPath, string> {
  return Object.fromEntries(
    ALL_NUMBER_PATHS.map((path) => [path, String(readPath(settings, path))]),
  ) as Record<NumberPath, string>;
}

/** Start times a weekday uses (every active slot when the weekday has no grid). */
function timesOf(settings: ClubSettings, day: Weekday, slots: SlotSummary[]): string[] {
  return settings.scheduleGrids[day] ?? slots.map((slot) => slot.startTime);
}

function WeekdayRow({
  day,
  settings,
  slots,
  onChange,
}: {
  day: Weekday;
  settings: ClubSettings;
  slots: SlotSummary[];
  onChange: (next: ClubSettings) => void;
}) {
  const t = useTranslations("adminSettings");
  const labels = useTranslations("labels");
  const grid = settings.scheduleGrids[day];
  const closed = grid !== undefined && grid.length === 0;
  const times = timesOf(settings, day, slots);
  const mode = settings.dayModes[day] ?? "BOOKING";
  const allTimes = slots.map((slot) => slot.startTime);

  function setGrid(next: string[] | undefined) {
    const grids = { ...settings.scheduleGrids };
    // A grid with every slot is the same as no grid: keep the stored rules small.
    if (next === undefined || (next.length === allTimes.length && next.length > 0))
      delete grids[day];
    else grids[day] = [...next].sort();
    onChange({ ...settings, scheduleGrids: grids });
  }
  function setMode(next: CourtMode) {
    const modes = { ...settings.dayModes };
    if (next === "BOOKING") delete modes[day];
    else modes[day] = next;
    onChange({ ...settings, dayModes: modes });
  }

  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-medium">{labels(`weekdayLong.${day}`)}</span>
        <ChoiceChip selected={closed} showCheck onClick={() => setGrid(closed ? undefined : [])}>
          {t("closedDay")}
        </ChoiceChip>
      </div>
      {closed ? null : (
        <>
          <SegmentedControl
            label={t("modeOf", { day: labels(`weekdayLong.${day}`) })}
            value={mode}
            onChange={setMode}
            options={[
              { value: "BOOKING", label: labels("courtMode.BOOKING") },
              { value: "FREE_PLAY", label: labels("courtMode.FREE_PLAY") },
            ]}
            className="max-w-sm"
          />
          <ChipGroup label={t("timesOf", { day: labels(`weekdayLong.${day}`) })}>
            {slots.map((slot) => {
              const on = times.includes(slot.startTime);
              return (
                <ChoiceChip
                  key={slot.id}
                  selected={on}
                  className="num"
                  onClick={() =>
                    setGrid(
                      on
                        ? times.filter((time) => time !== slot.startTime)
                        : [...times, slot.startTime],
                    )
                  }
                >
                  {slot.startTime}
                </ChoiceChip>
              );
            })}
          </ChipGroup>
        </>
      )}
    </li>
  );
}

function Toggle({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <ChoiceChip selected={selected} showCheck onClick={onClick}>
      {children}
    </ChoiceChip>
  );
}

/** Every club rule (ClubSettings), edited and saved at once. */
export function RulesForm({ settings }: { settings: ClubSettings }) {
  const t = useTranslations("adminSettings");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const [draft, setDraft] = useState<ClubSettings>(settings);
  const [numbers, setNumbers] = useState(() => numbersOf(settings));

  // A save (here or by another admin) brings new stored rules: start over from them.
  const stored = JSON.stringify(settings);
  useEffect(() => {
    setDraft(settings);
    setNumbers(numbersOf(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);

  const check = useMemo(
    () => clubSettingsSchema.safeParse(withNumbers(draft, numbers)),
    [draft, numbers],
  );
  const changed = JSON.stringify(withNumbers(draft, numbers)) !== stored;
  const issue = (path: string) => {
    if (check.success) return undefined;
    const found = check.error.issues.find((entry) => entry.path.join(".") === path);
    return found ? issueMessage(found) : undefined;
  };

  const save = useMutation({
    mutationFn: (next: ClubSettings) => api.admin.updateSettings(next),
    onSuccess: (club) => {
      haptic([10, 30, 10]);
      client.setQueryData(queryKeys.club, club);
      void client.invalidateQueries({ queryKey: queryKeys.schedule() });
      toast.success(t("saved"));
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  function submit() {
    if (check.success) save.mutate(check.data);
  }

  const numberField = (path: NumberPath) => {
    const key = path.replace(".", "_") as MessageKey<NumberPath>;
    return (
      <Field
        key={path}
        label={t(`fields.${key}.label`)}
        hint={t(`fields.${key}.hint`)}
        htmlFor={`rule-${path}`}
        error={issue(path)}
      >
        <Input
          id={`rule-${path}`}
          type="number"
          inputMode="numeric"
          className="num"
          value={numbers[path]}
          onChange={(event) =>
            setNumbers((current) => ({ ...current, [path]: event.target.value }))
          }
        />
      </Field>
    );
  };
  const set = (patch: Partial<ClubSettings>) => setDraft((current) => ({ ...current, ...patch }));
  const slots = courts.data?.slots ?? [];

  return (
    <div className="space-y-6 pb-28">
      <SlotCatalogue settings={settings} />
      <Card className="space-y-4 p-5">
        <div>
          <SectionLabel>{t("gridTitle")}</SectionLabel>
          <p className="mt-1 text-small text-muted-foreground">{t("gridHint")}</p>
        </div>
        {courts.data ? (
          <ul className="divide-y divide-border">
            {WEEKDAYS.map((day) => (
              <WeekdayRow key={day} day={day} settings={draft} slots={slots} onChange={setDraft} />
            ))}
          </ul>
        ) : (
          <Skeleton className="h-64 rounded-lg" />
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <SectionLabel>{t("bookingTitle")}</SectionLabel>
          <p className="mt-1 text-small text-muted-foreground">{t("bookingHint")}</p>
        </div>
        <ChipGroup label={t("openingRule")}>
          <Toggle
            selected={draft.bookingOpening !== null}
            onClick={() =>
              set({
                bookingOpening: draft.bookingOpening ? null : { daysBefore: 1, time: "07:00" },
              })
            }
          >
            {t("openingRule")}
          </Toggle>
        </ChipGroup>
        <AnimatePresence initial={false}>
          {draft.bookingOpening ? (
            <motion.div
              variants={popVariants}
              initial={enter("hidden")}
              animate="show"
              exit="hidden"
              className="grid grid-cols-2 gap-3"
            >
              <Field
                label={t("openingDays")}
                htmlFor="rule-opening-days"
                error={issue("bookingOpening.daysBefore")}
              >
                <Input
                  id="rule-opening-days"
                  type="number"
                  inputMode="numeric"
                  className="num"
                  min={0}
                  max={30}
                  value={String(draft.bookingOpening.daysBefore)}
                  onChange={(event) =>
                    set({
                      bookingOpening: {
                        time: draft.bookingOpening!.time,
                        daysBefore:
                          event.target.value === "" ? Number.NaN : Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
              <Field
                label={t("openingTime")}
                htmlFor="rule-opening-time"
                error={issue("bookingOpening.time")}
              >
                <Input
                  id="rule-opening-time"
                  type="time"
                  className="num"
                  value={draft.bookingOpening.time}
                  onChange={(event) =>
                    set({
                      bookingOpening: {
                        daysBefore: draft.bookingOpening!.daysBefore,
                        time: event.target.value,
                      },
                    })
                  }
                />
              </Field>
              <p className="col-span-2 text-small text-muted-foreground">
                {t("openingSummary", {
                  days: Number.isFinite(draft.bookingOpening.daysBefore)
                    ? draft.bookingOpening.daysBefore
                    : 0,
                  time: draft.bookingOpening.time,
                })}
              </p>
            </motion.div>
          ) : (
            <p className="text-small text-muted-foreground">{t("openingOff")}</p>
          )}
        </AnimatePresence>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUMBER_FIELDS.booking.map(numberField)}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <SectionLabel>{t("freePlayTitle")}</SectionLabel>
          <p className="mt-1 text-small text-muted-foreground">{t("freePlayHint")}</p>
        </div>
        <ChipGroup label={t("freePlayTitle")}>
          <Toggle
            selected={draft.freePlay.queueEnabled}
            onClick={() =>
              set({ freePlay: { ...draft.freePlay, queueEnabled: !draft.freePlay.queueEnabled } })
            }
          >
            {t("queueEnabled")}
          </Toggle>
        </ChipGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUMBER_FIELDS.freePlay.map(numberField)}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <SectionLabel>{t("membersTitle")}</SectionLabel>
          <p className="mt-1 text-small text-muted-foreground">{t("membersHint")}</p>
        </div>
        <ChipGroup label={t("membersTitle")}>
          <Toggle
            selected={draft.signupRequiresApproval}
            onClick={() => set({ signupRequiresApproval: !draft.signupRequiresApproval })}
          >
            {t("signupRequiresApproval")}
          </Toggle>
          <Toggle
            selected={draft.dependentsEnabled}
            onClick={() => set({ dependentsEnabled: !draft.dependentsEnabled })}
          >
            {t("dependentsEnabled")}
          </Toggle>
        </ChipGroup>
        <p className="text-small text-muted-foreground">{t("dependentsHint")}</p>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <SectionLabel>{t("noShowsTitle")}</SectionLabel>
          <p className="mt-1 text-small text-muted-foreground">{t("noShowsHint")}</p>
        </div>
        <ChipGroup label={t("noShowsTitle")}>
          <Toggle
            selected={draft.noShowPenalty.enabled}
            onClick={() =>
              set({
                noShowPenalty: { ...draft.noShowPenalty, enabled: !draft.noShowPenalty.enabled },
              })
            }
          >
            {t("penaltyEnabled")}
          </Toggle>
        </ChipGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {NUMBER_FIELDS.noShows.map(numberField)}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionLabel>{t("otherTitle")}</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NUMBER_FIELDS.other.map(numberField)}
        </div>
      </Card>

      <AnimatePresence>
        {changed ? (
          <motion.div
            variants={popVariants}
            initial={enter("hidden")}
            animate="show"
            exit="hidden"
            className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-center gap-3 rounded-full border border-border glass px-4 py-2 shadow-raised"
          >
            <span className="min-w-0 flex-1 text-caption leading-tight">
              {check.success ? t("unsaved") : t("fixErrors")}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(settings);
                setNumbers(numbersOf(settings));
              }}
            >
              {t("discard")}
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              {t("save")}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
