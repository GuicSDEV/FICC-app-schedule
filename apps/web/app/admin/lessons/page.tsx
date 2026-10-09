"use client";

import {
  addDays,
  clubToday,
  dateRange,
  type LessonAuditItem,
  type LessonDetail,
  startOfWeek,
} from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  History,
  Plus,
  Repeat,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { AdminHeader } from "@/components/admin/admin-header";
import {
  type LessonActionTarget,
  LessonActionsSheet,
} from "@/components/lessons/lesson-actions-sheet";
import { type LessonFormTarget, LessonFormSheet } from "@/components/lessons/lesson-form-sheet";
import { useClub } from "@/components/providers/club-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChipGroup, ChoiceChip } from "@/components/ui/choice-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { invalidateLessons } from "@/lib/lessons";
import { enter, fadeVariants, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

const toTarget = (lesson: LessonDetail): LessonActionTarget => ({
  id: lesson.id,
  seriesId: lesson.seriesId,
  date: lesson.date,
  court: lesson.court,
  slot: lesson.slot,
  coach: lesson.coach,
  studentNames: lesson.studentNames,
  note: lesson.note,
});

/** The date an audit entry is about, and which fields an edit changed. */
function auditSummary(details: unknown): { date?: string; changed: string[] } {
  if (!details || typeof details !== "object") return { changed: [] };
  const value = details as Record<string, unknown>;
  const date = [value.date, value.startDate, value.fromDate].find(
    (entry): entry is string => typeof entry === "string",
  );
  const before = value.before as Record<string, unknown> | undefined;
  const after = value.after as Record<string, unknown> | undefined;
  const changed =
    before && after
      ? Object.keys(after).filter(
          (key) => JSON.stringify(after[key]) !== JSON.stringify(before[key]),
        )
      : [];
  return { date: date ?? (typeof before?.date === "string" ? before.date : undefined), changed };
}

function AuditList({ entries }: { entries: LessonAuditItem[] }) {
  const t = useTranslations("admin.lessons");
  const format = useFormat();
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {entries.map((entry, index) => {
        const summary = auditSummary(entry.details);
        return (
          <motion.li
            key={entry.id}
            custom={index}
            variants={listItemVariants}
            initial={enter("hidden")}
            animate="show"
            className="flex min-h-16 items-start gap-3 px-4 py-3"
          >
            <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-small font-medium">
                {t(`audit.${entry.action}`)}
                {summary.date ? ` · ${format.day(summary.date)}` : ""}
              </span>
              <span className="block text-caption text-muted-foreground">
                {entry.actor.name}
                {summary.changed.length > 0
                  ? ` · ${summary.changed.map((key) => t(`fields.${key}` as "fields.date")).join(", ")}`
                  : ""}
              </span>
            </span>
            <span className="shrink-0 num text-caption text-muted-foreground">
              {format.dateTime(entry.createdAt)}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

/** Every coach's lessons by week, with the same actions coaches have, plus the change log. */
export default function AdminLessonsPage() {
  const t = useTranslations("admin.lessons");
  const lessonsT = useTranslations("lessons");
  const format = useFormat();
  const club = useClub();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const today = club ? clubToday(new Date(), club.timezone) : null;
  const [weekOffset, setWeekOffset] = useState(0);
  const [coachId, setCoachId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<"lessons" | "audit">("lessons");
  const [formTarget, setFormTarget] = useState<LessonFormTarget | null>(null);
  const [actionTarget, setActionTarget] = useState<LessonActionTarget | null>(null);
  const from = today ? addDays(startOfWeek(today), weekOffset * 7) : "";
  const to = from ? addDays(from, 6) : "";

  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const coaches = useQuery({ queryKey: queryKeys.admin.coaches, queryFn: api.admin.coaches });
  const lessons = useQuery({
    queryKey: queryKeys.admin.lessons(from, to, coachId),
    queryFn: () => api.admin.lessons(from, to, coachId),
    enabled: Boolean(from),
    placeholderData: (previous) => previous,
  });
  const audit = useQuery({
    queryKey: [...queryKeys.admin.audit, coachId ?? "all"],
    queryFn: () => api.admin.audit({ coachId, limit: 100 }),
    enabled: view === "audit",
  });

  async function restore(lesson: LessonDetail) {
    try {
      await api.admin.restoreLesson(lesson.id);
      toast.success(lessonsT("restored"));
      invalidateLessons(client);
    } catch (failure) {
      toast.error(errorMessage(failure, lessonsT("restoreFailed")));
    }
  }

  const byDay = from
    ? dateRange(from, to).map((date) => ({
        date,
        lessons: (lessons.data ?? []).filter((lesson) => lesson.date === date),
      }))
    : [];

  return (
    <>
      <AdminHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button onClick={() => today && setFormTarget({ date: today })} disabled={!today}>
            <Plus /> {t("new")}
          </Button>
        }
      />

      <div className="mt-5 space-y-4">
        <SegmentedControl
          label={t("view")}
          options={[
            { value: "lessons", label: t("lessonsTab") },
            { value: "audit", label: t("auditTab") },
          ]}
          value={view}
          onChange={setView}
          className="md:max-w-sm"
        />
        <ChipGroup label={t("coachFilter")}>
          <ChoiceChip selected={coachId === undefined} onClick={() => setCoachId(undefined)}>
            {t("allCoaches")}
          </ChoiceChip>
          {(coaches.data ?? []).map((coach) => (
            <ChoiceChip
              key={coach.id}
              selected={coachId === coach.id}
              onClick={() => setCoachId(coach.id)}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: coach.color }}
              />
              {coach.displayName}
            </ChoiceChip>
          ))}
        </ChipGroup>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === "lessons" ? (
          <motion.div
            key="lessons"
            variants={fadeVariants}
            initial={enter("hidden")}
            animate="show"
            exit="exit"
            className="mt-5 space-y-5"
          >
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2">
              <motion.button
                type="button"
                whileTap={tap}
                onClick={() => setWeekOffset((value) => value - 1)}
                aria-label={t("previousWeek")}
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
              >
                <ChevronLeft className="size-5" />
              </motion.button>
              <div className="text-center">
                <p className="font-medium">
                  {from ? t("week", { from: format.day(from), to: format.day(to) }) : " "}
                </p>
                {weekOffset !== 0 ? (
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="text-caption text-accent-ink underline-offset-2 hover:underline"
                  >
                    {t("thisWeek")}
                  </button>
                ) : (
                  <p className="text-caption text-muted-foreground">{t("thisWeek")}</p>
                )}
              </div>
              <motion.button
                type="button"
                whileTap={tap}
                onClick={() => setWeekOffset((value) => value + 1)}
                aria-label={t("nextWeek")}
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
              >
                <ChevronRight className="size-5" />
              </motion.button>
            </div>

            {lessons.isError ? (
              <ErrorState onRetry={() => void lessons.refetch()} />
            ) : !lessons.data ? (
              <div className="space-y-3">
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-28 rounded-lg" />
                ))}
              </div>
            ) : lessons.data.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {byDay
                  .filter((day) => day.lessons.length > 0)
                  .map((day) => (
                    <section
                      key={day.date}
                      className="space-y-2"
                      aria-label={format.longDayTitle(day.date)}
                    >
                      <SectionLabel>{format.longDayTitle(day.date)}</SectionLabel>
                      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                        {day.lessons.map((lesson) => {
                          const cancelled = lesson.status === "CANCELLED";
                          const past = today !== null && lesson.date < today;
                          return (
                            <li key={lesson.id}>
                              <div
                                className={cn(
                                  "flex min-h-14 items-center gap-3 px-3 py-2",
                                  cancelled && "opacity-60",
                                )}
                              >
                                <span
                                  aria-hidden
                                  className="h-10 w-1.5 shrink-0 rounded-full"
                                  style={{ background: lesson.coach.color }}
                                />
                                <span className="w-12 shrink-0 num text-small font-semibold">
                                  {lesson.slot.startTime}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={cn(
                                      "flex items-center gap-1.5 text-small font-medium",
                                      cancelled && "line-through",
                                    )}
                                  >
                                    {lesson.coach.displayName} · {lesson.court.name}
                                    {lesson.seriesId ? (
                                      <Repeat
                                        className="size-3.5 text-lesson-ink"
                                        aria-label={lessonsT("weeklySeries")}
                                      />
                                    ) : null}
                                  </span>
                                  <span className="block truncate text-caption text-muted-foreground">
                                    {lesson.studentNames ?? lessonsT("noStudents")}
                                  </span>
                                </span>
                                {cancelled ? (
                                  <>
                                    <Badge className="h-6 px-2">{t("cancelled")}</Badge>
                                    {past ? null : (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label={lessonsT("undo")}
                                        onClick={() => void restore(lesson)}
                                      >
                                        <Undo2 className="size-4" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setActionTarget(toTarget(lesson))}
                                  >
                                    {t("manage")}
                                  </Button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="audit"
            variants={fadeVariants}
            initial={enter("hidden")}
            animate="show"
            exit="exit"
            className="mt-5"
          >
            {audit.isError ? (
              <ErrorState onRetry={() => void audit.refetch()} />
            ) : audit.isLoading ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : (audit.data ?? []).length === 0 ? (
              <EmptyState icon={History} title={t("auditEmpty")} />
            ) : (
              <AuditList entries={audit.data!} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <LessonFormSheet
        target={formTarget}
        onOpenChange={(open) => !open && setFormTarget(null)}
        mode="admin"
        courts={courts.data?.courts ?? []}
        slots={courts.data?.slots ?? []}
        coaches={coaches.data}
        minDate={today ?? undefined}
      />
      <LessonActionsSheet
        target={actionTarget}
        onOpenChange={(open) => !open && setActionTarget(null)}
        mode="admin"
        courts={courts.data?.courts ?? []}
        slots={courts.data?.slots ?? []}
        coaches={coaches.data}
        minDate={today ?? undefined}
      />
    </>
  );
}
