"use client";

import {
  type CoachAdminItem,
  createLessonSchema,
  type CourtSummary,
  type SlotSummary,
  WEEKDAYS,
  type Weekday,
  weekdayOf,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ChipGroup, ChoiceChip } from "@/components/ui/choice-chip";
import { Field, FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { invalidateLessons, lessonApi, type LessonMode } from "@/lib/lessons";
import { fadeVariants, haptic } from "@/lib/motion";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";

export interface LessonFormTarget {
  date: string;
  courtId?: string;
  timeSlotId?: string;
}

/**
 * New lesson: "just this day" or "repeat weekly" (weekdays + optional end date), optional
 * students and note. Opened from a free slot (prefilled) or empty from a list. Admins also pick
 * the coach, which limits the courts to that coach's allowed ones.
 */
export function LessonFormSheet({
  target,
  onOpenChange,
  mode,
  courts,
  slots,
  coaches,
  minDate,
}: {
  target: LessonFormTarget | null;
  onOpenChange: (open: boolean) => void;
  mode: LessonMode;
  /** Courts the lesson may use (a coach's allowed courts; every court for admins). */
  courts: CourtSummary[];
  slots: SlotSummary[];
  /** Admin only: coaches to choose from. */
  coaches?: CoachAdminItem[];
  minDate?: string;
}) {
  const t = useTranslations("lessons");
  const labels = useTranslations("labels");
  const format = useFormat();
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const client = useQueryClient();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [courtId, setCourtId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<"once" | "weekly">("once");
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [endDate, setEndDate] = useState("");
  const [studentNames, setStudentNames] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setCoachId(null);
    setDate(target.date);
    setCourtId(target.courtId ?? null);
    setSlotId(target.timeSlotId ?? null);
    setRepeat("once");
    setWeekdays([weekdayOf(target.date)]);
    setEndDate("");
    setStudentNames("");
    setNote("");
    setError(null);
  }, [target]);

  const activeCoaches = (coaches ?? []).filter((coach) => coach.isActive);
  const coach = activeCoaches.find((entry) => entry.id === coachId);
  const usableCourts =
    mode === "admin" && coach
      ? courts.filter((court) => coach.courtIds.includes(court.id))
      : courts;

  const mutation = useMutation({
    mutationFn: lessonApi(mode).create,
    onSuccess: (result) => {
      haptic([12, 40, 12]);
      const skipped = result.series?.skippedDates.length ?? 0;
      toast.success(
        result.series ? t("seriesCreated", { count: result.series.generated }) : t("created"),
        {
          description: skipped > 0 ? t("skippedDates", { count: skipped }) : undefined,
        },
      );
      invalidateLessons(client);
      onOpenChange(false);
    },
    onError: (failure) => {
      const message = errorMessage(failure, t("createFailed"));
      setError(message);
      toast.error(message);
    },
  });

  function changeDate(next: string) {
    setDate(next);
    if (next) setWeekdays((current) => (current.length <= 1 ? [weekdayOf(next)] : current));
  }

  function submit() {
    if (mode === "admin" && !coachId) return setError(t("pickCoach"));
    if (!courtId) return setError(t("pickCourt"));
    if (!slotId) return setError(t("pickSlot"));
    const input = {
      courtId,
      timeSlotId: slotId,
      date,
      ...(mode === "admin" && coachId ? { coachId } : {}),
      ...(repeat === "weekly" ? { repeat: { weekdays, ...(endDate ? { endDate } : {}) } } : {}),
      ...(studentNames.trim() ? { studentNames } : {}),
      ...(note.trim() ? { note } : {}),
    };
    const parsed = createLessonSchema.safeParse(input);
    if (!parsed.success) return setError(issueMessage(parsed.error.issues[0]));
    setError(null);
    mutation.mutate(parsed.data);
  }

  const court = courts.find((entry) => entry.id === courtId);
  const slot = slots.find((entry) => entry.id === slotId);

  return (
    <Sheet
      open={target !== null}
      onOpenChange={onOpenChange}
      title={t("newTitle")}
      description={
        court && slot && date
          ? t("newDescription", { court: court.name, time: slot.startTime, day: format.day(date) })
          : undefined
      }
      footer={
        <Button block size="lg" loading={mutation.isPending} onClick={submit}>
          {repeat === "weekly" ? t("createSeries") : t("create")}
        </Button>
      }
    >
      <div className="space-y-5">
        {mode === "admin" ? (
          <div className="space-y-2">
            <Label>{t("coach")}</Label>
            <ChipGroup label={t("coach")}>
              {activeCoaches.map((entry) => (
                <ChoiceChip
                  key={entry.id}
                  selected={entry.id === coachId}
                  onClick={() => {
                    setCoachId(entry.id);
                    if (courtId && !entry.courtIds.includes(courtId)) setCourtId(null);
                    setError(null);
                  }}
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: entry.color }}
                  />
                  {entry.displayName}
                </ChoiceChip>
              ))}
            </ChipGroup>
          </div>
        ) : null}

        <Field label={t("date")} htmlFor="lesson-date">
          <Input
            id="lesson-date"
            type="date"
            value={date}
            min={minDate}
            onChange={(event) => changeDate(event.target.value)}
            className="num"
          />
        </Field>

        <div className="space-y-2">
          <Label>{t("court")}</Label>
          <ChipGroup label={t("court")}>
            {usableCourts.map((entry) => (
              <ChoiceChip
                key={entry.id}
                selected={entry.id === courtId}
                onClick={() => {
                  setCourtId(entry.id);
                  setError(null);
                }}
              >
                <span
                  aria-hidden
                  className={
                    entry.surface === "HARTRU"
                      ? "size-2.5 rounded-full bg-hartru"
                      : "size-2.5 rounded-full bg-saibro"
                  }
                />
                {entry.name} · {labels(`surface.${entry.surface}`)}
              </ChoiceChip>
            ))}
          </ChipGroup>
        </div>

        <div className="space-y-2">
          <Label>{t("time")}</Label>
          <ChipGroup label={t("time")}>
            {slots.map((entry) => (
              <ChoiceChip
                key={entry.id}
                selected={entry.id === slotId}
                onClick={() => {
                  setSlotId(entry.id);
                  setError(null);
                }}
                className="num"
              >
                {entry.startTime}
              </ChoiceChip>
            ))}
          </ChipGroup>
        </div>

        <SegmentedControl
          label={t("frequency")}
          options={[
            { value: "once", label: t("once") },
            { value: "weekly", label: t("weekly") },
          ]}
          value={repeat}
          onChange={setRepeat}
        />

        <AnimatePresence initial={false}>
          {repeat === "weekly" ? (
            <motion.div
              key="weekly"
              variants={fadeVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>{t("weekdays")}</Label>
                <ChipGroup label={t("weekdays")}>
                  {WEEKDAYS.map((day) => (
                    <ChoiceChip
                      key={day}
                      selected={weekdays.includes(day)}
                      onClick={() =>
                        setWeekdays((current) =>
                          current.includes(day)
                            ? current.filter((entry) => entry !== day)
                            : WEEKDAYS.filter((entry) => entry === day || current.includes(entry)),
                        )
                      }
                      className="w-14 px-0"
                    >
                      {labels(`weekdayShort.${day}`)}
                    </ChoiceChip>
                  ))}
                </ChipGroup>
              </div>
              <Field label={t("endDate")} htmlFor="lesson-end" hint={t("endDateHint")}>
                <Input
                  id="lesson-end"
                  type="date"
                  value={endDate}
                  min={date || undefined}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="num"
                />
              </Field>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <Field label={t("students")} htmlFor="lesson-students">
          <Input
            id="lesson-students"
            value={studentNames}
            maxLength={200}
            onChange={(event) => setStudentNames(event.target.value)}
            placeholder={t("studentsPlaceholder")}
          />
        </Field>
        <Field label={t("note")} htmlFor="lesson-note">
          <Textarea
            id="lesson-note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FieldError>{error}</FieldError>
      </div>
    </Sheet>
  );
}
