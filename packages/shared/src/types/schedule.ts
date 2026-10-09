import type { IsoDate } from "../dates";
import type {
  BookingPlayerStatus,
  BookingStatus,
  BookingType,
  FreezeReason,
  FreezeScope,
  Surface,
} from "../enums";
import type { CoachSummary, CourtSummary, IsoDateTime, PlayerSummary, SlotSummary } from "./common";

export type ScheduleCellState = "free" | "lesson" | "booking" | "frozen";

export interface ScheduleLessonInfo {
  id: string;
  seriesId: string | null;
  coach: CoachSummary;
  /** Only shown to the lesson's coach and admins. */
  studentNames: string | null;
  note: string | null;
}

export interface BookingPlayerInfo {
  user: PlayerSummary;
  status: BookingPlayerStatus;
}

export interface ScheduleBookingInfo {
  id: string;
  type: BookingType;
  status: BookingStatus;
  players: BookingPlayerInfo[];
}

export interface FreezeSummary {
  id: string;
  reason: FreezeReason;
  scope: FreezeScope;
  surface: Surface | null;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime | null;
  note: string | null;
  courtIds: string[];
}

export interface ScheduleCell {
  date: IsoDate;
  courtId: string;
  timeSlotId: string;
  /** Frozen wins over everything; then lesson, booking, free. */
  state: ScheduleCellState;
  /** The slot has already started. */
  past: boolean;
  /** The viewer watches this court + slot. */
  favorite: boolean;
  lesson: ScheduleLessonInfo | null;
  booking: ScheduleBookingInfo | null;
  freeze: Pick<FreezeSummary, "id" | "reason"> | null;
}

export interface ScheduleDay {
  date: IsoDate;
  courts: CourtSummary[];
  slots: SlotSummary[];
  /** One cell per court × slot, ordered by slot then court. */
  cells: ScheduleCell[];
}
