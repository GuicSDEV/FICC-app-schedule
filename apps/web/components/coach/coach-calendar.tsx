"use client";

import {
  addDays,
  clubToday,
  type ScheduleCell,
  type ScheduleDay,
  SOCKET_EVENTS,
  startOfWeek,
} from "@ficc/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import {
  CalendarLegend,
  CourtCalendar,
  CourtCalendarSkeleton,
  type SurfaceFilter,
} from "@/components/calendar/court-calendar";
import { DayStrip } from "@/components/calendar/day-strip";
import {
  type LessonActionTarget,
  LessonActionsSheet,
  useCancelLesson,
} from "@/components/lessons/lesson-actions-sheet";
import { type LessonFormTarget, LessonFormSheet } from "@/components/lessons/lesson-form-sheet";
import { LessonSwipeCard } from "@/components/lessons/lesson-swipe-card";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { useSocketEvent } from "@/components/providers/socket-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatarLink } from "@/components/shell/user-avatar-link";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { invalidateLessons } from "@/lib/lessons";
import { fadeVariants, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { cellKey } from "@/lib/schedule-cache";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useNow } from "@/lib/use-now";

/** Days ahead shown in the coach's day strip (four weeks). */
const AGENDA_DAYS = 28;

function lessonTarget(day: ScheduleDay, cell: ScheduleCell): LessonActionTarget | null {
  const court = day.courts.find((entry) => entry.id === cell.courtId);
  const slot = day.slots.find((entry) => entry.id === cell.timeSlotId);
  if (!court || !slot || !cell.lesson) return null;
  return {
    id: cell.lesson.id,
    seriesId: cell.lesson.seriesId,
    date: cell.date,
    court,
    slot,
    coach: cell.lesson.coach,
    studentNames: cell.lesson.studentNames,
    note: cell.lesson.note,
  };
}

/**
 * Coach calendar. "agenda" shows only the coach's allowed courts with their lessons listed
 * below (swipe left to cancel a day); "club" shows every court read-only, where the coach can
 * still add lessons on allowed courts and manage their own.
 */
export function CoachCalendar({ scope }: { scope: "agenda" | "club" }) {
  const t = useTranslations();
  const format = useFormat();
  const club = useClub();
  const { user } = useSession();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const now = useNow();
  const coach = user?.coach ?? null;
  const today = club ? clubToday(now, club.timezone) : null;
  const days = useMemo(
    () => (today ? Array.from({ length: AGENDA_DAYS }, (_, index) => addDays(today, index)) : []),
    [today],
  );
  const [chosenDate, setDate] = useState<string | null>(null);
  const date = chosenDate ?? today ?? "";
  const [filter, setFilter] = useState<SurfaceFilter>("ALL");
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  const [formTarget, setFormTarget] = useState<LessonFormTarget | null>(null);
  const [actionTarget, setActionTarget] = useState<LessonActionTarget | null>(null);
  const cancelLesson = useCancelLesson("coach");

  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const schedule = useQuery({
    queryKey: scope === "agenda" ? queryKeys.coachAgenda(date) : queryKeys.schedule(date),
    queryFn: () => (scope === "agenda" ? api.coach.agenda(date) : api.schedule(date)),
    enabled: date !== "",
    placeholderData: (previous) => (previous?.date === date ? previous : undefined),
  });

  useSocketEvent(SOCKET_EVENTS.scheduleUpdated, (event) => {
    if (!event.dates.includes(date) || event.cells.length === 0) return;
    setHighlights((current) => {
      const next = { ...current };
      for (const cell of event.cells) {
        if (cell.date === date) next[cellKey(cell)] = (next[cellKey(cell)] ?? 0) + 1;
      }
      return next;
    });
  });
  useEffect(() => setHighlights({}), [date]);

  const copyWeek = useMutation({
    mutationFn: () => api.coach.copyWeek(startOfWeek(date)),
    onSuccess: (result) => {
      invalidateLessons(client);
      toast.success(t("coach.copied", { count: result.created.length }), {
        description:
          result.skipped.length > 0
            ? t("coach.copySkipped", { count: result.skipped.length })
            : undefined,
      });
    },
    onError: (failure) => toast.error(errorMessage(failure, t("coach.copyFailed"))),
  });

  const allowed = new Set(coach?.courtIds ?? []);
  const allowedCourts = (courts.data?.courts ?? []).filter((court) => allowed.has(court.id));
  const day = schedule.data;
  const myLessons = day
    ? day.cells
        .filter((cell) => cell.state !== "free" && cell.lesson?.coach.id === coach?.id)
        .map((cell) => lessonTarget(day, cell))
        .filter((lesson): lesson is LessonActionTarget => lesson !== null)
    : [];

  function onCell(cell: ScheduleCell) {
    if (!day) return;
    if (cell.lesson && cell.lesson.coach.id === coach?.id) {
      setActionTarget(lessonTarget(day, cell));
    } else if (cell.state === "free" && !cell.past && allowed.has(cell.courtId)) {
      setFormTarget({ date: cell.date, courtId: cell.courtId, timeSlotId: cell.timeSlotId });
    }
  }

  const filters = [
    { value: "ALL", label: t("calendar.all") },
    { value: "HARTRU", label: t("labels.surface.HARTRU") },
    { value: "SAIBRO", label: t("labels.surface.SAIBRO") },
  ] as const;

  return (
    <>
      <PageHeader
        title={scope === "agenda" ? t("coach.agendaTitle") : t("coach.courtsTitle")}
        subtitle={date ? format.longDayTitle(date) : " "}
        actions={
          <>
            <NotificationBell />
            <UserAvatarLink href="/coach/profile" />
          </>
        }
      >
        {today ? (
          <DayStrip
            days={days}
            today={today}
            value={date}
            onChange={setDate}
            layoutGroup={`coach-${scope}`}
          />
        ) : (
          <div aria-hidden className="h-[4.75rem]" />
        )}
        {scope === "club" ? (
          <SegmentedControl
            label={t("calendar.surfaceLabel")}
            options={filters}
            value={filter}
            onChange={setFilter}
            className="mb-3 md:max-w-sm"
          />
        ) : null}
      </PageHeader>

      <div className="mt-4 space-y-6">
        {scope === "agenda" ? (
          <section className="space-y-3" aria-label={t("coach.dayLessons")}>
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>{t("coach.dayLessons")}</SectionLabel>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={copyWeek.isPending}
                  onClick={() => copyWeek.mutate()}
                  disabled={!date}
                >
                  <Copy /> {t("coach.copyWeek")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => date && setFormTarget({ date })}
                  disabled={!date}
                >
                  <CalendarPlus /> {t("coach.addLesson")}
                </Button>
              </div>
            </div>
            {day && myLessons.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-small text-muted-foreground">
                {t("coach.noLessons")}
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {myLessons.map((lesson, index) => (
                      <motion.li
                        key={lesson.id}
                        layout
                        custom={index}
                        variants={listItemVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                      >
                        <LessonSwipeCard
                          lesson={lesson}
                          onOpen={() => setActionTarget(lesson)}
                          onCancel={() => cancelLesson(lesson, "THIS")}
                        />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
                {myLessons.length > 0 ? (
                  <p className="text-caption text-muted-foreground">{t("coach.swipeHint")}</p>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        <section
          aria-label={t("calendar.slots")}
          aria-busy={schedule.isLoading}
          className="space-y-4"
        >
          {scope === "agenda" ? <SectionLabel>{t("coach.myCourts")}</SectionLabel> : null}
          <AnimatePresence mode="wait" initial={false}>
            {schedule.isError ? (
              <motion.div
                key="error"
                variants={fadeVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <ErrorState
                  message={t("calendar.loadFailed")}
                  onRetry={() => void schedule.refetch()}
                />
              </motion.div>
            ) : day ? (
              day.courts.length === 0 ? (
                <EmptyState
                  key="none"
                  title={t("coach.noCourts")}
                  description={t("coach.noCourtsDescription")}
                />
              ) : (
                <motion.div
                  key={`day-${day.date}`}
                  variants={fadeVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  <CourtCalendar
                    day={day}
                    filter={filter}
                    viewerId={undefined}
                    now={now}
                    highlights={highlights}
                    celebrate={null}
                    onCell={onCell}
                  />
                </motion.div>
              )
            ) : (
              <motion.div
                key="skeleton"
                variants={fadeVariants}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <CourtCalendarSkeleton
                  courts={scope === "agenda" ? allowedCourts.length || 2 : 6}
                  slots={courts.data?.slots.length ?? 8}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <CalendarLegend />
        </section>
      </div>

      <LessonFormSheet
        target={formTarget}
        onOpenChange={(open) => !open && setFormTarget(null)}
        mode="coach"
        courts={allowedCourts}
        slots={courts.data?.slots ?? []}
        minDate={today ?? undefined}
      />
      <LessonActionsSheet
        target={actionTarget}
        onOpenChange={(open) => !open && setActionTarget(null)}
        mode="coach"
        courts={allowedCourts}
        slots={courts.data?.slots ?? []}
        minDate={today ?? undefined}
      />
    </>
  );
}
