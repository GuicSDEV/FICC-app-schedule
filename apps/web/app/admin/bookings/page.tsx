"use client";

import { addDays, clubToday, type ScheduleCell } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { type BookingInfoTarget, BookingInfoSheet } from "@/components/booking/booking-info-sheet";
import {
  CalendarLegend,
  CourtCalendar,
  CourtCalendarSkeleton,
} from "@/components/calendar/court-calendar";
import { DayStrip } from "@/components/calendar/day-strip";
import { DayPlanBanner } from "@/components/operations/day-plan-banner";
import { useClub } from "@/components/providers/club-provider";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useNow } from "@/lib/use-now";

/** Staff view of every booking: cancel one, or mark a player who did not show up. */
export default function AdminBookingsPage() {
  const t = useTranslations("adminBookings");
  const club = useClub();
  const now = useNow();
  const today = club ? clubToday(now, club.timezone) : null;
  const windowDays = club?.settings.bookingWindowDays ?? 0;
  // A week back (no-shows) and the whole booking window ahead.
  const days = useMemo(
    () =>
      today ? Array.from({ length: windowDays + 7 }, (_, index) => addDays(today, index - 7)) : [],
    [today, windowDays],
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const date = chosen ?? today ?? "";
  const [target, setTarget] = useState<BookingInfoTarget | null>(null);
  const schedule = useQuery({
    queryKey: queryKeys.schedule(date),
    queryFn: () => api.schedule(date),
    enabled: date !== "",
  });

  function onCell(cell: ScheduleCell) {
    const day = schedule.data;
    const court = day?.courts.find((entry) => entry.id === cell.courtId);
    const slot = day?.slots.find((entry) => entry.id === cell.timeSlotId);
    if (!court || !slot || cell.state !== "booking" || !cell.booking) return;
    setTarget({
      date: cell.date,
      court,
      slot,
      booking: cell.booking,
      favorite: false,
      past: cell.past,
    });
  }

  return (
    <>
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mt-4 space-y-4">
        {today ? <DayStrip days={days} today={today} value={date} onChange={setChosen} /> : null}
        {schedule.isError ? (
          <ErrorState onRetry={() => void schedule.refetch()} />
        ) : schedule.data ? (
          <>
            <DayPlanBanner date={date} plan={schedule.data.plan} isToday={date === today} />
            <CourtCalendar
              day={schedule.data}
              filter="ALL"
              viewerId={undefined}
              now={now}
              highlights={{}}
              celebrate={null}
              onCell={onCell}
              staff
            />
          </>
        ) : (
          <CourtCalendarSkeleton />
        )}
        <CalendarLegend />
      </div>
      <BookingInfoSheet target={target} onOpenChange={(open) => !open && setTarget(null)} staff />
    </>
  );
}
