"use client";

import {
  addDays,
  BOOKING_WINDOW_DAYS,
  type BookingDetail,
  clubToday,
  type ScheduleCell,
  SOCKET_EVENTS,
} from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type BookingInfoTarget, BookingInfoSheet } from "@/components/booking/booking-info-sheet";
import { type BookingTarget, BookingSheet } from "@/components/booking/booking-sheet";
import { CoachSheet, type LessonTarget } from "@/components/booking/coach-sheet";
import {
  CalendarLegend,
  CourtCalendar,
  CourtCalendarSkeleton,
  type SurfaceFilter,
} from "@/components/calendar/court-calendar";
import { DayStrip } from "@/components/calendar/day-strip";
import { useSession } from "@/components/providers/session-provider";
import { useSocketEvent } from "@/components/providers/socket-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatarLink } from "@/components/shell/user-avatar-link";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { formatLongDayTitle } from "@/lib/format";
import { fadeVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { cellKey } from "@/lib/schedule-cache";
import { useNow } from "@/lib/use-now";

const FILTERS = [
  { value: "ALL", label: "Todas" },
  { value: "HARTRU", label: "Har-Tru" },
  { value: "SAIBRO", label: "Saibro" },
] as const;

/** How long the "booking confirmed" fill stays on the cell. */
const CELEBRATE_MS = 2400;

export default function CourtsPage() {
  const { user } = useSession();
  const now = useNow();
  const today = clubToday(now);
  const days = useMemo(
    () => Array.from({ length: BOOKING_WINDOW_DAYS }, (_, index) => addDays(today, index)),
    [today],
  );
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<SurfaceFilter>("ALL");
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [bookingTarget, setBookingTarget] = useState<BookingTarget | null>(null);
  const [lessonTarget, setLessonTarget] = useState<LessonTarget | null>(null);
  const [infoTarget, setInfoTarget] = useState<BookingInfoTarget | null>(null);

  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const schedule = useQuery({
    queryKey: queryKeys.schedule(date),
    queryFn: () => api.schedule(date),
    placeholderData: (previous) => (previous?.date === date ? previous : undefined),
  });

  // Live: flash the cells another member, coach or admin just changed on this day.
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
  useEffect(() => () => clearTimeout(celebrateTimer.current), []);

  // The fill plays on the calendar as the booking sheet slides away, so it is actually seen.
  const pendingCelebrate = useRef<string | null>(null);
  const onBooked = useCallback((booking: BookingDetail) => {
    pendingCelebrate.current = cellKey({ courtId: booking.court.id, timeSlotId: booking.slot.id });
  }, []);
  const closeBookingSheet = useCallback(() => {
    setBookingTarget(null);
    const key = pendingCelebrate.current;
    if (!key) return;
    pendingCelebrate.current = null;
    clearTimeout(celebrateTimer.current);
    setCelebrate(key);
    celebrateTimer.current = setTimeout(() => setCelebrate(null), CELEBRATE_MS);
  }, []);

  function onCell(cell: ScheduleCell) {
    const day = schedule.data;
    const court = day?.courts.find((entry) => entry.id === cell.courtId);
    const slot = day?.slots.find((entry) => entry.id === cell.timeSlotId);
    if (!court || !slot) return;
    if (cell.state === "free")
      setBookingTarget({ date: cell.date, court, slot, favorite: cell.favorite });
    else if (cell.state === "lesson" && cell.lesson) {
      setLessonTarget({
        date: cell.date,
        court,
        slot,
        coach: cell.lesson.coach,
        favorite: cell.favorite,
      });
    } else if (cell.state === "booking" && cell.booking) {
      setInfoTarget({
        date: cell.date,
        court,
        slot,
        booking: cell.booking,
        favorite: cell.favorite,
        past: cell.past,
      });
    }
  }

  const skeletonCourts =
    (courts.data?.courts ?? []).filter((court) => filter === "ALL" || court.surface === filter)
      .length || 6;

  return (
    <>
      <PageHeader
        title="Quadras"
        subtitle={formatLongDayTitle(date)}
        actions={
          <>
            <NotificationBell />
            <UserAvatarLink href="/app/profile" />
          </>
        }
      >
        <DayStrip days={days} today={today} value={date} onChange={setDate} />
        <SegmentedControl
          label="Piso"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          className="mb-3 md:max-w-sm"
        />
      </PageHeader>

      <section aria-label="Horários" aria-busy={schedule.isLoading} className="mt-4 space-y-5">
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
                message="Não foi possível carregar a agenda."
                onRetry={() => void schedule.refetch()}
              />
            </motion.div>
          ) : schedule.data ? (
            <motion.div
              key={`day-${schedule.data.date}`}
              variants={fadeVariants}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <CourtCalendar
                day={schedule.data}
                filter={filter}
                viewerId={user?.id}
                now={now}
                highlights={highlights}
                celebrate={celebrate}
                onCell={onCell}
              />
            </motion.div>
          ) : (
            <motion.div
              key="skeleton"
              variants={fadeVariants}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <CourtCalendarSkeleton
                courts={skeletonCourts}
                slots={courts.data?.slots.length ?? 8}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <CalendarLegend />
      </section>

      <BookingSheet
        target={bookingTarget}
        onOpenChange={(open) => !open && closeBookingSheet()}
        onBooked={onBooked}
      />
      <CoachSheet target={lessonTarget} onOpenChange={(open) => !open && setLessonTarget(null)} />
      <BookingInfoSheet target={infoTarget} onOpenChange={(open) => !open && setInfoTarget(null)} />
    </>
  );
}
