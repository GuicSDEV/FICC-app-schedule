"use client";

import {
  addDays,
  type BookingDetail,
  clubToday,
  type PartnerRequestItem,
  type ScheduleCell,
  type SlotHoldView,
  SOCKET_EVENTS,
} from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { type BookingInfoTarget, BookingInfoSheet } from "@/components/booking/booking-info-sheet";
import { type BookingTarget, BookingSheet } from "@/components/booking/booking-sheet";
import { CoachSheet, type LessonTarget } from "@/components/booking/coach-sheet";
import { type HoldWait, HoldWaitSheet } from "@/components/booking/hold-wait-sheet";
import {
  type PartnerRequestDraft,
  PartnerRequestSheet,
} from "@/components/booking/partner-request-sheet";
import {
  PartnerRequestsCard,
  PartnerRequestsPill,
} from "@/components/booking/partner-requests-card";
import {
  CalendarLegend,
  CourtCalendar,
  CourtCalendarSkeleton,
  type SurfaceFilter,
} from "@/components/calendar/court-calendar";
import { DayStrip } from "@/components/calendar/day-strip";
import { DayPlanBanner } from "@/components/operations/day-plan-banner";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { useSocketEvent } from "@/components/providers/socket-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatarLink } from "@/components/shell/user-avatar-link";
import { AlertBanner } from "@/components/ui/alert-banner";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, fadeVariants, haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { bookableCells } from "@/lib/free-courts";
import { cellKey } from "@/lib/schedule-cache";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useNow } from "@/lib/use-now";

/** How long the "booking confirmed" fill stays on the cell. */
const CELEBRATE_MS = 2400;

export function CourtsView() {
  const t = useTranslations();
  const router = useRouter();
  const format = useFormat();
  const club = useClub();
  const { user } = useSession();
  const now = useNow();
  // The club's calendar day (its zone), and its booking window for the day strip.
  const today = club ? clubToday(now, club.timezone) : null;
  const windowDays = club?.settings.bookingWindowDays ?? 0;
  const days = useMemo(
    () => (today ? Array.from({ length: windowDays }, (_, index) => addDays(today, index)) : []),
    [today, windowDays],
  );
  const [chosenDate, setDate] = useState<string | null>(null);
  const date = chosenDate ?? today ?? "";
  const filters = [
    { value: "ALL", label: t("calendar.all") },
    { value: "HARTRU", label: t("labels.surface.HARTRU") },
    { value: "SAIBRO", label: t("labels.surface.SAIBRO") },
  ] as const;
  const [filter, setFilter] = useState<SurfaceFilter>("ALL");
  const [highlights, setHighlights] = useState<Record<string, number>>({});
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [bookingTarget, setBookingTarget] = useState<BookingTarget | null>(null);
  const [lessonTarget, setLessonTarget] = useState<LessonTarget | null>(null);
  const [infoTarget, setInfoTarget] = useState<BookingInfoTarget | null>(null);
  const [wait, setWait] = useState<HoldWait | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [partnerDraft, setPartnerDraft] = useState<PartnerRequestDraft | null>(null);
  const errorMessage = useErrorMessage();

  const courts = useQuery({
    queryKey: queryKeys.courts,
    queryFn: api.courts,
    staleTime: 60 * 60_000,
  });
  const schedule = useQuery({
    queryKey: queryKeys.schedule(date),
    queryFn: () => api.schedule(date),
    enabled: date !== "",
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

  /** The member's turn came while waiting: open the booking sheet on the kept court. */
  const openHeld = useCallback((target: BookingTarget, view: SlotHoldView) => {
    setWait(null);
    setBookingTarget({
      ...target,
      hold: view.expiresAt ? { expiresAt: view.expiresAt, serverNow: view.serverNow } : undefined,
    });
  }, []);

  /** Tapping a free court keeps it for the member (or puts them in line behind whoever is booking it). */
  const startBooking = useCallback(
    async (target: BookingTarget) => {
      if (claiming) return;
      setClaiming(true);
      try {
        const view = await api.slotHolds.claim({
          courtId: target.court.id,
          timeSlotId: target.slot.id,
          date: target.date,
        });
        haptic(10);
        if (view.status === "HOLDING") openHeld(target, view);
        else setWait({ target, view, taken: false, alternatives: [] });
      } catch (failure) {
        toast.error(errorMessage(failure));
        void schedule.refetch();
      } finally {
        setClaiming(false);
      }
    },
    [claiming, errorMessage, openHeld, schedule],
  );

  const waitRef = useRef<HoldWait | null>(null);
  useEffect(() => {
    waitRef.current = wait;
  }, [wait]);
  const onWaitUpdate = useCallback(
    (view: SlotHoldView | null) => {
      const current = waitRef.current;
      if (!current) return;
      if (view?.status === "HOLDING") {
        haptic([12, 40, 12]);
        toast.success(t("hold.yourTurn", { court: current.target.court.name }));
        openHeld(current.target, view);
      } else if (view === null) {
        // Dropped from the line (left on another device, or the court was booked).
        if (!current.taken) setWait({ ...current, taken: true });
      } else {
        setWait({ ...current, view });
      }
    },
    [openHeld, t],
  );

  // Personal events: the member's turn came, or the court they waited for was booked.
  useSocketEvent(SOCKET_EVENTS.slotHoldUpdated, (event) => {
    if (event.reason === "TAKEN") {
      setWait((current) =>
        current ? { ...current, taken: true, alternatives: event.alternatives } : current,
      );
      return;
    }
    if (event.hold) onWaitUpdate(event.hold);
  });
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
    if (cell.state === "free" && day && !day.plan.bookingOpen) {
      toast(day.plan.mode === "FREE_PLAY" ? t("dayPlan.freePlayTitle") : t("dayPlan.notOpenToast"));
      return;
    }
    if (cell.state === "free")
      void startBooking({ date: cell.date, court, slot, favorite: cell.favorite });
    else if (cell.state === "lesson" && cell.lesson) {
      setLessonTarget({
        date: cell.date,
        court,
        slot,
        coach: cell.lesson.coach,
        favorite: cell.favorite,
      });
    } else if (cell.state === "tournament" && cell.tournament) {
      router.push(`/app/tournaments/${cell.tournament.tournamentId}?tab=schedule`);
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

  /** "Jogar" on a request: keep a free court at that time and open the booking with them in it. */
  function playWith(request: PartnerRequestItem) {
    const day = schedule.data;
    if (!day || day.date !== request.date) return;
    if (!day.plan.bookingOpen) {
      toast(t("dayPlan.notOpenToast"));
      return;
    }
    const free = bookableCells(day, user?.id, now, request.timeSlotId);
    const cell =
      free.find(
        (entry) =>
          filter === "ALL" ||
          day.courts.find((court) => court.id === entry.courtId)?.surface === filter,
      ) ?? free[0];
    const court = day.courts.find((entry) => entry.id === cell?.courtId);
    const slot = day.slots.find((entry) => entry.id === request.timeSlotId);
    if (!cell || !court || !slot) {
      toast(t("partners.noCourt", { time: request.startTime }));
      return;
    }
    void startBooking({
      date: request.date,
      court,
      slot,
      favorite: cell.favorite,
      partners: [request.player],
      type: request.type,
    });
  }

  const canPost = Boolean(
    schedule.data &&
    schedule.data.date === date &&
    schedule.data.plan.mode === "BOOKING" &&
    !schedule.data.plan.closed &&
    schedule.data.plan.inWindow,
  );

  const suspendedUntil =
    user?.bookingSuspendedUntil && Date.parse(user.bookingSuspendedUntil) > now.getTime()
      ? user.bookingSuspendedUntil
      : null;

  const skeletonCourts =
    (courts.data?.courts ?? []).filter((court) => filter === "ALL" || court.surface === filter)
      .length || 6;

  return (
    <>
      <PageHeader
        title={t("calendar.title")}
        subtitle={date ? format.longDayTitle(date) : " "}
        actions={
          <>
            <NotificationBell />
            <UserAvatarLink href="/app/profile" />
          </>
        }
      >
        {today ? (
          <DayStrip days={days} today={today} value={date} onChange={setDate} />
        ) : (
          <div aria-hidden className="h-[4.75rem]" />
        )}
        <SegmentedControl
          label={t("calendar.surfaceLabel")}
          options={filters}
          value={filter}
          onChange={setFilter}
          className="mb-3 md:max-w-sm"
        />
      </PageHeader>

      <section
        aria-label={t("calendar.slots")}
        aria-busy={schedule.isLoading}
        className="mt-4 space-y-5"
      >
        <AlertBanner
          show={suspendedUntil !== null}
          tone="danger"
          title={
            suspendedUntil ? t("dayPlan.suspended", { until: format.dateTime(suspendedUntil) }) : ""
          }
        />
        {schedule.data && schedule.data.date === date ? (
          <DayPlanBanner date={date} plan={schedule.data.plan} isToday={date === today} />
        ) : null}
        <PartnerRequestsPill date={date} viewerId={user?.id} />
        <AnimatePresence mode="wait" initial={false}>
          {schedule.isError ? (
            <motion.div
              key="error"
              variants={fadeVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
            >
              <ErrorState
                message={t("calendar.loadFailed")}
                onRetry={() => void schedule.refetch()}
              />
            </motion.div>
          ) : schedule.data ? (
            <motion.div
              key={`day-${schedule.data.date}`}
              variants={fadeVariants}
              initial={enter("hidden")}
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
              initial={enter("hidden")}
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
        <PartnerRequestsCard
          date={date}
          canPost={canPost}
          onPost={() => schedule.data && setPartnerDraft({ day: schedule.data })}
          onPlay={playWith}
        />
      </section>

      <BookingSheet
        target={bookingTarget}
        onOpenChange={(open) => !open && closeBookingSheet()}
        onBooked={onBooked}
        onAskPartner={(target, type) => {
          const day = schedule.data;
          if (day?.date === target.date) {
            setPartnerDraft({ day, timeSlotId: target.slot.id, type });
          }
        }}
      />
      <PartnerRequestSheet
        draft={partnerDraft}
        onOpenChange={(open) => !open && setPartnerDraft(null)}
      />
      <HoldWaitSheet
        wait={wait}
        onOpenChange={(open) => {
          if (open) return;
          if (wait && !wait.taken) void api.slotHolds.release().catch(() => undefined);
          setWait(null);
        }}
        onUpdate={onWaitUpdate}
        onPick={(target) => {
          setWait(null);
          void startBooking(target);
        }}
      />
      <CoachSheet target={lessonTarget} onOpenChange={(open) => !open && setLessonTarget(null)} />
      <BookingInfoSheet target={infoTarget} onOpenChange={(open) => !open && setInfoTarget(null)} />
    </>
  );
}
