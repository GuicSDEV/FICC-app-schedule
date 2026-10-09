import { type ClubSettings, findOverlap, WEEKDAYS } from "@ficc/shared";

import { unprocessable } from "../common/domain.exception";

type Timing = { startTime: string; durationMinutes: number };

/** Throws GRID_OVERLAP when two slots of one day would share minutes on a court. */
export function assertNoOverlap(slots: readonly Timing[]): void {
  const overlap = findOverlap(slots);
  if (overlap) {
    throw unprocessable("GRID_OVERLAP", {
      key: "api.gridOverlap",
      params: { first: overlap[0].startTime, second: overlap[1].startTime },
    });
  }
}

/**
 * Checks every weekday grid against the club's active slots: a weekday without a grid uses every
 * active slot, so adding a slot can make such a day overlap.
 */
export function assertGridsValid(
  grids: ClubSettings["scheduleGrids"],
  activeSlots: readonly Timing[],
): void {
  for (const day of WEEKDAYS) {
    const times = grids[day];
    assertNoOverlap(
      times ? activeSlots.filter((slot) => times.includes(slot.startTime)) : activeSlots,
    );
  }
}
