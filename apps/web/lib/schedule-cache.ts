import type { ScheduleCell, ScheduleDay } from "@ficc/shared";
import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "./query-keys";

export interface CellRef {
  date: string;
  courtId: string;
  timeSlotId: string;
}

export const cellKey = (cell: Pick<CellRef, "courtId" | "timeSlotId">) =>
  `${cell.courtId}:${cell.timeSlotId}`;

/** Applies `update` to the cells matching `match` in every cached schedule day; returns a rollback. */
export function patchScheduleCells(
  client: QueryClient,
  match: (cell: ScheduleCell) => boolean,
  update: (cell: ScheduleCell) => ScheduleCell,
): () => void {
  const snapshots = client.getQueriesData<ScheduleDay>({ queryKey: queryKeys.schedule() });
  for (const [key, day] of snapshots) {
    if (!day) continue;
    client.setQueryData<ScheduleDay>(key, {
      ...day,
      cells: day.cells.map((cell) => (match(cell) ? update(cell) : cell)),
    });
  }
  return () => {
    for (const [key, day] of snapshots) client.setQueryData(key, day);
  };
}
