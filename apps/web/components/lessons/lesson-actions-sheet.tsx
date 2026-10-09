"use client";

import {
  type CoachAdminItem,
  type CoachSummary,
  type CourtSummary,
  type LessonCancelScope,
  type SlotSummary,
  updateLessonSchema,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, CalendarX, Pencil, Repeat } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChipGroup, ChoiceChip } from "@/components/ui/choice-chip";
import { Field, FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { invalidateLessons, lessonApi, type LessonMode } from "@/lib/lessons";
import { fadeVariants, haptic, tap } from "@/lib/motion";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";

/** Undo window after cancelling a single lesson (ms). */
export const UNDO_MS = 5000;

export interface LessonActionTarget {
  id: string;
  seriesId: string | null;
  date: string;
  court: CourtSummary;
  slot: SlotSummary;
  coach: CoachSummary;
  studentNames: string | null;
  note: string | null;
}

/**
 * Cancels lessons. A single day can be undone for 5 s from the toast (the slot stays free in
 * between, so a member may take it first; then the undo fails with the API's message).
 */
export function useCancelLesson(mode: LessonMode) {
  const t = useTranslations("lessons");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  return useCallback(
    async (lesson: { id: string }, scope: LessonCancelScope) => {
      const calls = lessonApi(mode);
      try {
        const result = await calls.cancel(lesson.id, scope);
        haptic();
        invalidateLessons(client);
        if (scope === "THIS") {
          toast(t("cancelled"), {
            duration: UNDO_MS,
            action: {
              label: t("undo"),
              onClick: () => {
                calls
                  .restore(lesson.id)
                  .then(() => {
                    toast.success(t("restored"));
                    invalidateLessons(client);
                  })
                  .catch((failure: unknown) =>
                    toast.error(errorMessage(failure, t("restoreFailed"))),
                  );
              },
            },
          });
        } else {
          toast(t("seriesEnded", { count: result.cancelled }));
        }
        return true;
      } catch (failure) {
        toast.error(errorMessage(failure, t("cancelFailed")));
        return false;
      }
    },
    [mode, client, t, errorMessage],
  );
}

function ActionRow({
  icon,
  title,
  description,
  danger,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  danger?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={tap}
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 rounded-lg border border-border bg-surface-2 p-4 text-left transition-tokens hover:bg-surface-3 disabled:opacity-50"
    >
      <span
        className={
          danger
            ? "flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-ink"
            : "flex size-11 shrink-0 items-center justify-center rounded-full bg-lesson-soft text-lesson-ink"
        }
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="block text-small text-muted-foreground">{description}</span>
      </span>
    </motion.button>
  );
}

/** Tap on an own lesson (or any lesson for admins): cancel this day, end the series, or edit. */
export function LessonActionsSheet({
  target,
  onOpenChange,
  mode,
  courts,
  slots,
  coaches,
  minDate,
}: {
  target: LessonActionTarget | null;
  onOpenChange: (open: boolean) => void;
  mode: LessonMode;
  courts: CourtSummary[];
  slots: SlotSummary[];
  coaches?: CoachAdminItem[];
  minDate?: string;
}) {
  const t = useTranslations("lessons");
  const labels = useTranslations("labels");
  const format = useFormat();
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const client = useQueryClient();
  const cancelLesson = useCancelLesson(mode);
  const [view, setView] = useState<"menu" | "edit">("menu");
  const [busy, setBusy] = useState<LessonCancelScope | null>(null);
  const [date, setDate] = useState("");
  const [courtId, setCourtId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [coachId, setCoachId] = useState("");
  const [studentNames, setStudentNames] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setView("menu");
    setDate(target.date);
    setCourtId(target.court.id);
    setSlotId(target.slot.id);
    setCoachId(target.coach.id);
    setStudentNames(target.studentNames ?? "");
    setNote(target.note ?? "");
    setError(null);
  }, [target]);

  const coach = coaches?.find((entry) => entry.id === coachId);
  const usableCourts =
    mode === "admin" && coach
      ? courts.filter((court) => coach.courtIds.includes(court.id))
      : courts;

  const update = useMutation({
    mutationFn: (input: Parameters<ReturnType<typeof lessonApi>["update"]>[1]) =>
      lessonApi(mode).update(target!.id, input),
    onSuccess: () => {
      haptic();
      toast.success(t("updated"));
      invalidateLessons(client);
      onOpenChange(false);
    },
    onError: (failure) => {
      const message = errorMessage(failure, t("updateFailed"));
      setError(message);
      toast.error(message);
    },
  });

  async function cancel(scope: LessonCancelScope) {
    if (!target) return;
    setBusy(scope);
    const ok = await cancelLesson(target, scope);
    setBusy(null);
    if (ok) onOpenChange(false);
  }

  function save() {
    if (!target) return;
    const input = {
      ...(date !== target.date ? { date } : {}),
      ...(courtId !== target.court.id ? { courtId } : {}),
      ...(slotId !== target.slot.id ? { timeSlotId: slotId } : {}),
      ...(mode === "admin" && coachId !== target.coach.id ? { coachId } : {}),
      ...(studentNames.trim() !== (target.studentNames ?? "")
        ? { studentNames: studentNames.trim() || null }
        : {}),
      ...(note.trim() !== (target.note ?? "") ? { note: note.trim() || null } : {}),
    };
    const parsed = updateLessonSchema.safeParse(input);
    if (!parsed.success) return setError(issueMessage(parsed.error.issues[0]));
    setError(null);
    update.mutate(parsed.data);
  }

  return (
    <Sheet
      open={target !== null}
      onOpenChange={onOpenChange}
      title={view === "edit" ? t("editTitle") : t("lessonTitle")}
      description={
        target
          ? t("lessonDescription", {
              court: target.court.name,
              time: target.slot.startTime,
              day: format.day(target.date),
            })
          : undefined
      }
      footer={
        view === "edit" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setView("menu")}>
              {t("back")}
            </Button>
            <Button loading={update.isPending} onClick={save}>
              {t("save")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {target && view === "menu" ? (
          <motion.div
            key="menu"
            variants={fadeVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="space-y-3"
          >
            <div className="flex items-center gap-3 rounded-lg border border-lesson/30 bg-lesson-soft p-3">
              <Avatar
                name={target.coach.displayName}
                src={target.coach.photoUrl}
                ring={target.coach.color}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{target.coach.displayName}</p>
                <p className="truncate text-small text-muted-foreground">
                  {target.studentNames ?? t("noStudents")}
                  {target.seriesId ? ` · ${t("weeklySeries")}` : ""}
                </p>
              </div>
            </div>
            {target.note ? (
              <p className="rounded-md bg-surface-2 px-4 py-3 text-small text-muted-foreground">
                {target.note}
              </p>
            ) : null}
            <ActionRow
              icon={<CalendarX className="size-5" />}
              title={t("cancelThis")}
              description={t("cancelThisDescription")}
              danger
              disabled={busy !== null}
              onClick={() => void cancel("THIS")}
            />
            {target.seriesId ? (
              <ActionRow
                icon={<CalendarX2 className="size-5" />}
                title={t("cancelFuture")}
                description={t("cancelFutureDescription")}
                danger
                disabled={busy !== null}
                onClick={() => void cancel("THIS_AND_FUTURE")}
              />
            ) : null}
            <ActionRow
              icon={<Pencil className="size-5" />}
              title={t("edit")}
              description={target.seriesId ? t("editSeriesDescription") : t("editDescription")}
              disabled={busy !== null}
              onClick={() => setView("edit")}
            />
            {target.seriesId ? (
              <p className="flex items-center gap-2 px-1 text-caption text-muted-foreground">
                <Repeat className="size-3.5" aria-hidden /> {t("seriesHint")}
              </p>
            ) : null}
          </motion.div>
        ) : target ? (
          <motion.div
            key="edit"
            variants={fadeVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="space-y-5"
          >
            {mode === "admin" && coaches ? (
              <div className="space-y-2">
                <Label>{t("coach")}</Label>
                <ChipGroup label={t("coach")}>
                  {coaches
                    .filter((entry) => entry.isActive || entry.id === target.coach.id)
                    .map((entry) => (
                      <ChoiceChip
                        key={entry.id}
                        selected={entry.id === coachId}
                        onClick={() => setCoachId(entry.id)}
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
            <Field
              label={t("date")}
              htmlFor="edit-date"
              hint={target.seriesId ? t("moveDetaches") : undefined}
            >
              <Input
                id="edit-date"
                type="date"
                value={date}
                min={minDate}
                onChange={(event) => setDate(event.target.value)}
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
                    onClick={() => setCourtId(entry.id)}
                  >
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
                    onClick={() => setSlotId(entry.id)}
                    className="num"
                  >
                    {entry.startTime}
                  </ChoiceChip>
                ))}
              </ChipGroup>
            </div>
            <Field label={t("students")} htmlFor="edit-students">
              <Input
                id="edit-students"
                value={studentNames}
                maxLength={200}
                onChange={(event) => setStudentNames(event.target.value)}
              />
            </Field>
            <Field label={t("note")} htmlFor="edit-note">
              <Textarea
                id="edit-note"
                value={note}
                maxLength={300}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <FieldError>{error}</FieldError>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Sheet>
  );
}
