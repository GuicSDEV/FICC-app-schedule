import type { ScheduleCell, ScheduleDay } from "@ficc/shared";

/** Cells of a day a member could start booking now: free, not over, not kept by someone else. */
export function bookableCells(
  day: ScheduleDay,
  viewerId: string | undefined,
  now: Date,
  timeSlotId?: string,
): ScheduleCell[] {
  return day.cells.filter(
    (cell) =>
      cell.state === "free" &&
      !cell.past &&
      (timeSlotId === undefined || cell.timeSlotId === timeSlotId) &&
      !(cell.hold && cell.hold.userId !== viewerId && Date.parse(cell.hold.until) > now.getTime()),
  );
}
