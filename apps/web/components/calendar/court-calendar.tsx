"use client";

import {
  type ScheduleCell,
  type ScheduleDay,
  slotEndsAt,
  slotStartsAt,
  type Surface,
} from "@ficc/shared";
import { AnimatePresence, motion } from "motion/react";

import { Skeleton } from "@/components/ui/skeleton";
import { SlotChip } from "@/components/ui/slot-chip";
import { spring, transitions } from "@/lib/motion";
import { cellKey } from "@/lib/schedule-cache";
import { cn } from "@/lib/utils";

export type SurfaceFilter = "ALL" | Surface;

const CHIP_HEIGHT = "h-14 md:h-16";

/** Grid of the day's slots (rows) × courts (chips). Rows on phones, a full grid on wide screens. */
export function CourtCalendar({
  day,
  filter,
  viewerId,
  now,
  highlights,
  celebrate,
  onCell,
}: {
  day: ScheduleDay;
  filter: SurfaceFilter;
  viewerId: string | undefined;
  now: Date;
  /** Cell key → bump counter, to flash cells that changed live. */
  highlights: Record<string, number>;
  /** Cell key playing the "booking confirmed" fill. */
  celebrate: string | null;
  onCell: (cell: ScheduleCell) => void;
}) {
  const courts = day.courts.filter((court) => filter === "ALL" || court.surface === filter);
  const cells = new Map(day.cells.map((cell) => [cellKey(cell), cell]));

  return (
    <div className="space-y-2">
      {/* Court header (wide screens): the chips there are wide enough to drop their own labels. */}
      <div className="hidden grid-cols-[4.5rem_1fr] gap-3 md:grid" aria-hidden>
        <span />
        <div className="flex gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {courts.map((court) => (
              <motion.span
                key={court.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={spring.gentle}
                className="flex min-w-0 flex-1 items-center justify-center gap-2 text-small font-semibold"
              >
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    court.surface === "HARTRU" ? "bg-hartru" : "bg-saibro",
                  )}
                />
                <span className="num">{court.name}</span>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {day.slots.map((slot) => {
        const live = now >= slotStartsAt(day.date, slot) && now < slotEndsAt(day.date, slot);
        return (
          <div
            key={slot.id}
            className="grid grid-cols-[3.25rem_1fr] items-center gap-2 md:grid-cols-[4.5rem_1fr] md:gap-3"
          >
            <div className="flex flex-col">
              <span className={cn("num text-small font-semibold", live && "text-accent-ink")}>
                {slot.startTime}
              </span>
              {live ? (
                <span className="flex items-center gap-1 text-caption font-medium text-accent-ink">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />{" "}
                  agora
                </span>
              ) : (
                <span className="num text-caption text-muted-foreground">{slot.endTime}</span>
              )}
            </div>
            <div className="flex min-w-0 gap-1.5 md:gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {courts.map((court) => {
                  const key = cellKey({ courtId: court.id, timeSlotId: slot.id });
                  const cell = cells.get(key);
                  if (!cell) return null;
                  return (
                    <motion.div
                      key={court.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9, transition: transitions.fast }}
                      transition={spring.gentle}
                      className="flex min-w-0 flex-1"
                    >
                      <SlotChip
                        courtName={court.name}
                        surface={court.surface}
                        state={cell.state}
                        past={cell.past}
                        favorite={cell.favorite}
                        mine={Boolean(
                          viewerId &&
                          cell.booking?.players.some((player) => player.user.id === viewerId),
                        )}
                        coach={cell.lesson?.coach ?? null}
                        players={cell.booking?.players.map((player) => ({
                          id: player.user.id,
                          name: player.user.name,
                          photoUrl: player.user.photoUrl,
                          pending: player.status === "PENDING",
                        }))}
                        bookingStatus={
                          cell.booking?.status === "CONFIRMED" ? "CONFIRMED" : "PENDING"
                        }
                        freezeReason={cell.freeze?.reason}
                        highlightKey={highlights[key]}
                        celebrate={celebrate === key}
                        onPress={() => onCell(cell)}
                        className={CHIP_HEIGHT}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Same footprint as the calendar, so nothing shifts when data arrives. */
export function CourtCalendarSkeleton({
  courts = 6,
  slots = 8,
}: {
  courts?: number;
  slots?: number;
}) {
  return (
    <div className="space-y-2" aria-hidden>
      <div className="hidden h-5 md:block" />
      {Array.from({ length: slots }, (_, row) => (
        <div
          key={row}
          className="grid grid-cols-[3.25rem_1fr] items-center gap-2 md:grid-cols-[4.5rem_1fr] md:gap-3"
        >
          <div className="space-y-1">
            <Skeleton className="h-4 w-11" />
            <Skeleton className="h-3 w-9" />
          </div>
          <div className="flex gap-1.5 md:gap-2">
            {Array.from({ length: courts }, (_, column) => (
              <Skeleton key={column} className={cn("flex-1 rounded-md", CHIP_HEIGHT)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarLegend() {
  const items = [
    { label: "Livre", className: "border border-dashed border-hartru/70" },
    { label: "Aula", className: "bg-lesson-soft border border-lesson/40" },
    { label: "Reservada", className: "bg-hartru-soft border border-hartru/40" },
    { label: "Interditada", className: "striped border border-warning/40" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-caption text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3.5 rounded-sm", item.className)} />
          {item.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-3.5 rounded-sm ring-2 ring-ball ring-offset-1 ring-offset-background"
        />
        Sua reserva
      </li>
    </ul>
  );
}
