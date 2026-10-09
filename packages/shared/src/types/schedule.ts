import type { IsoDate } from "../dates";
import type { SlotHoldInfo } from "../events";
import type {
  BookingPlayerStatus,
  BookingStatus,
  BookingType,
  FreezeReason,
  FreezeScope,
  Surface,
} from "../enums";
import type { CoachSummary, CourtSummary, IsoDateTime, PlayerSummary, SlotSummary } from "./common";
import type { DayPlanInfo } from "./operations";

export type ScheduleCellState = "free" | "lesson" | "booking" | "tournament" | "frozen" | "closed";

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

export interface ScheduleTournamentInfo {
  matchId: string;
  tournamentId: string;
  tournamentName: string;
  categoryName: string;
  /** "Ana x Bia", or the round name while the players are not known yet. */
  label: string;
}

export interface ScheduleCell {
  date: IsoDate;
  courtId: string;
  timeSlotId: string;
  /** Closed (date exception) and frozen win over everything; then lesson, booking, match, free. */
  state: ScheduleCellState;
  /** The slot has already started. */
  past: boolean;
  /** The viewer watches this court + slot. */
  favorite: boolean;
  lesson: ScheduleLessonInfo | null;
  booking: ScheduleBookingInfo | null;
  tournament: ScheduleTournamentInfo | null;
  freeze: Pick<FreezeSummary, "id" | "reason"> | null;
  /** A free court a member is booking right now (kept for them until `until`). */
  hold: SlotHoldInfo | null;
}

export interface ScheduleDay {
  date: IsoDate;
  /** Mode, closures and booking opening of the day. */
  plan: DayPlanInfo;
  courts: CourtSummary[];
  slots: SlotSummary[];
  /** One cell per court × slot, ordered by slot then court. */
  cells: ScheduleCell[];
}
