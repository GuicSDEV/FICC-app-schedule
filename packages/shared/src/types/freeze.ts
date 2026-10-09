import type { IsoDate } from "../dates";
import type { BookingStatus } from "../enums";
import type { CoachSummary, IsoDateTime } from "./common";
import type { FreezeSummary } from "./schedule";

export interface AffectedBooking {
  id: string;
  status: BookingStatus;
  date: IsoDate;
  courtName: string;
  startTime: string;
  playerNames: string[];
}

export interface AffectedLesson {
  id: string;
  date: IsoDate;
  courtName: string;
  startTime: string;
  coach: CoachSummary;
}

export interface FreezeDetail extends FreezeSummary {
  courtNames: string[];
  liftedAt: IsoDateTime | null;
  createdBy: string;
  /** Active bookings and scheduled lessons whose slot overlaps the freeze. */
  affected: { bookings: AffectedBooking[]; lessons: AffectedLesson[] };
}

/** What the global rain/maintenance banner needs. */
export interface ActiveFreeze extends FreezeSummary {
  courtNames: string[];
  /** Started already (true) or starts within the next 24 h (false). */
  active: boolean;
}
