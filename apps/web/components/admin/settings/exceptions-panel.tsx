"use client";

import {
  addDays,
  type CourtMode,
  scheduleExceptionSchema,
  type ScheduleExceptionItem,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, CalendarX2, ChevronRight, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";

/** Days ahead the list shows. */
const LIST_DAYS = 120;

type ModeChoice = CourtMode | "DEFAULT";

function ExceptionSheet({
  open,
  exception,
  minDate,
  onOpenChange,
}: {
  open: boolean;
  /** Null to add one. */
  exception: ScheduleExceptionItem | null;
  minDate: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("adminSettings.exceptions");
  const labels = useTranslations("labels");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const [date, setDate] = useState("");
  const [closed, setClosed] = useState(false);
  const [mode, setMode] = useState<ModeChoice>("DEFAULT");
  const [closedCourtIds, setClosedCourtIds] = useState<string[]>([]);
  const [slotTimes, setSlotTimes] = useState<string[] | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(exception?.date ?? minDate);
    setClosed(exception?.closed ?? false);
    setMode(exception?.mode ?? "DEFAULT");
    setClosedCourtIds(exception?.closedCourtIds ?? []);
    setSlotTimes(exception?.slotTimes ?? null);
    setNote(exception?.note ?? "");
    setTouched(false);
    // Reset when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const input = {
    date,
    closed,
    mode: mode === "DEFAULT" ? null : mode,
    closedCourtIds: closed ? [] : closedCourtIds,
    slotTimes: closed ? null : slotTimes,
    note: note.trim() || null,
  };
  const check = scheduleExceptionSchema.safeParse(input);
  const issue = (field: string) => {
    if (!touched || check.success) return undefined;
    const found = check.error.issues.find((entry) => entry.path[0] === field);
    return found ? issueMessage(found) : undefined;
  };
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["schedule-exceptions"] });
    void client.invalidateQueries({ queryKey: queryKeys.schedule() });
  };
  const save = useMutation({
    mutationFn: () => api.scheduleExceptions.save(input),
    onSuccess: () => {
      haptic([10, 30, 10]);
      toast.success(t("saved"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const remove = useMutation({
    mutationFn: () => api.scheduleExceptions.remove(exception!.id),
    onSuccess: () => {
      haptic();
      toast.success(t("removed"));
      refresh();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const slots = courts.data?.slots ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={exception ? t("editTitle") : t("newTitle")}
      description={t("sheetHint")}
      footer={
        <div className="space-y-2">
          <Button
            size="lg"
            block
            loading={save.isPending}
            onClick={() => {
              setTouched(true);
              if (check.success) save.mutate();
            }}
          >
            {t("save")}
          </Button>
          {exception ? (
            <Button
              size="lg"
              block
              variant="ghost"
              className="text-danger-ink"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {t("remove")}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <Field label={t("date")} htmlFor="exception-date" error={issue("date")}>
          <Input
            id="exception-date"
            type="date"
            className="num"
            min={minDate}
            value={date}
            disabled={Boolean(exception)}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <ChipGroup label={t("closed")}>
          <ChoiceChip selected={closed} showCheck onClick={() => setClosed(!closed)}>
            {t("closed")}
          </ChoiceChip>
        </ChipGroup>
        {closed ? null : (
          <>
            <section className="space-y-2">
              <SectionLabel>{t("mode")}</SectionLabel>
              <SegmentedControl
                label={t("mode")}
                value={mode}
                onChange={setMode}
                options={[
                  { value: "DEFAULT", label: t("modeDefault") },
                  { value: "BOOKING", label: labels("courtMode.BOOKING") },
                  { value: "FREE_PLAY", label: labels("courtMode.FREE_PLAY") },
                ]}
              />
            </section>
            <section className="space-y-2">
              <SectionLabel>{t("closedCourts")}</SectionLabel>
              <ChipGroup label={t("closedCourts")}>
                {(courts.data?.courts ?? []).map((court) => {
                  const on = closedCourtIds.includes(court.id);
                  return (
                    <ChoiceChip
                      key={court.id}
                      selected={on}
                      showCheck
                      onClick={() =>
                        setClosedCourtIds(
                          on
                            ? closedCourtIds.filter((id) => id !== court.id)
                            : [...closedCourtIds, court.id],
                        )
                      }
                    >
                      {court.name}
                    </ChoiceChip>
                  );
                })}
              </ChipGroup>
            </section>
            <section className="space-y-2">
              <SectionLabel>{t("times")}</SectionLabel>
              <ChipGroup label={t("times")}>
                <ChoiceChip
                  selected={slotTimes === null}
                  showCheck
                  onClick={() =>
                    setSlotTimes(slotTimes === null ? slots.map((slot) => slot.startTime) : null)
                  }
                >
                  {t("weekdayGrid")}
                </ChoiceChip>
              </ChipGroup>
              {slotTimes !== null ? (
                <ChipGroup label={t("times")}>
                  {slots.map((slot) => {
                    const on = slotTimes.includes(slot.startTime);
                    return (
                      <ChoiceChip
                        key={slot.id}
                        selected={on}
                        className="num"
                        onClick={() =>
                          setSlotTimes(
                            on
                              ? slotTimes.filter((time) => time !== slot.startTime)
                              : [...slotTimes, slot.startTime].sort(),
                          )
                        }
                      >
                        {slot.startTime}
                      </ChoiceChip>
                    );
                  })}
                </ChipGroup>
              ) : null}
              {issue("slotTimes") ? (
                <p className="text-small text-danger-ink">{issue("slotTimes")}</p>
              ) : null}
            </section>
          </>
        )}
        <Field
          label={t("note")}
          htmlFor="exception-note"
          hint={t("noteHint")}
          error={issue("note")}
        >
          <Input
            id="exception-note"
            value={note}
            maxLength={120}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  );
}

/** Date exceptions: holidays, events, courts closed for a day, a different grid or mode. */
export function ExceptionsPanel() {
  const t = useTranslations("adminSettings.exceptions");
  const labels = useTranslations("labels");
  const format = useFormat();
  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const today = courts.data?.today;
  const to = today ? addDays(today, LIST_DAYS) : "";
  const list = useQuery({
    queryKey: queryKeys.scheduleExceptions(today ?? "", to),
    queryFn: () => api.scheduleExceptions.list(today!, to),
    enabled: Boolean(today),
  });
  const [editing, setEditing] = useState<ScheduleExceptionItem | null>(null);
  const [open, setOpen] = useState(false);
  const courtName = (id: string) =>
    courts.data?.courts.find((court) => court.id === id)?.name ?? "";

  return (
    <section className="space-y-4" aria-label={t("title")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>{t("title")}</SectionLabel>
          <p className="mt-1 text-small text-muted-foreground">{t("hint")}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          disabled={!today}
        >
          <Plus /> {t("add")}
        </Button>
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <div className="space-y-2">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : list.data.length === 0 ? (
        <EmptyState icon={CalendarOff} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <ul className="space-y-2">
          {list.data.map((entry, index) => (
            <motion.li
              key={entry.id}
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
            >
              <motion.button
                type="button"
                whileTap={tap}
                onClick={() => {
                  setEditing(entry);
                  setOpen(true);
                }}
                className="flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left shadow-card transition-tokens hover:bg-surface-2"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-ink">
                  <CalendarX2 className="size-5" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-medium">{format.longDayTitle(entry.date)}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {entry.closed ? (
                      <Badge tone="danger" className="h-6 px-2">
                        {t("closedBadge")}
                      </Badge>
                    ) : null}
                    {entry.mode ? (
                      <Badge tone="ballSoft" className="h-6 px-2">
                        {labels(`courtMode.${entry.mode}`)}
                      </Badge>
                    ) : null}
                    {entry.closedCourtIds.length > 0 ? (
                      <Badge tone="warning" className="h-6 px-2">
                        {t("courtsClosedBadge", {
                          courts: entry.closedCourtIds.map(courtName).join(", "),
                        })}
                      </Badge>
                    ) : null}
                    {entry.slotTimes ? (
                      <Badge className="h-6 px-2 num">
                        {entry.slotTimes.length === 0 ? t("noTimes") : entry.slotTimes.join(" · ")}
                      </Badge>
                    ) : null}
                  </span>
                  {entry.note ? (
                    <span className="block truncate text-caption text-muted-foreground">
                      {entry.note}
                    </span>
                  ) : null}
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </motion.button>
            </motion.li>
          ))}
        </ul>
      )}
      {today ? (
        <ExceptionSheet open={open} exception={editing} minDate={today} onOpenChange={setOpen} />
      ) : null}
    </section>
  );
}
