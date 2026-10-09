import type { IsoDate } from "../dates";
import type {
  BookingCancelReason,
  BookingPlayerStatus,
  BookingStatus,
  BookingType,
} from "../enums";
import type { CourtSummary, IsoDateTime, PlayerSummary, SlotSummary } from "./common";
import type { SlotAlternative } from "./operations";
import type { BookingPlayerInfo } from "./schedule";

export interface BookingDetail {
  id: string;
  type: BookingType;
  status: BookingStatus;
  date: IsoDate;
  court: CourtSummary;
  slot: SlotSummary;
  startsAt: IsoDateTime;
  endsAt: IsoDateTime;
  /** Pending bookings are cancelled at this instant unless everyone confirms. */
  expiresAt: IsoDateTime;
  createdById: string;
  /** The viewer's own answer, when they are a player. */
  myStatus: BookingPlayerStatus | null;
  players: BookingPlayerInfo[];
  cancelReason: BookingCancelReason | null;
  guestCount: number;
}

export interface MyBookingsResponse {
  /** Active bookings that have not ended, soonest first. */
  upcoming: BookingDetail[];
  /** Pending bookings waiting for the viewer's answer. */
  invites: BookingDetail[];
  /** Confirmed bookings that ended in the last 14 days and have no result yet (to prefill a report). */
  recent: BookingDetail[];
}

export interface SlotFavoriteItem {
  id: string;
  courtId: string;
  timeSlotId: string;
}

/**
 * The viewer's hold on a court while booking it: HOLDING (it is theirs until `expiresAt`) or
 * WAITING (another member is booking it; they get it if that member gives up).
 */
export interface SlotHoldView {
  status: "HOLDING" | "WAITING";
  courtId: string;
  date: IsoDate;
  timeSlotId: string;
  /** HOLDING: when the court stops being kept for the viewer. */
  expiresAt: IsoDateTime | null;
  /** WAITING: when the current holder's time runs out, and the viewer's place in line (1-based). */
  holderExpiresAt: IsoDateTime | null;
  position: number | null;
  /** WAITING: free courts the viewer could pick instead. */
  alternatives: SlotAlternative[];
  /** Server clock when answered, for countdowns. */
  serverNow: IsoDateTime;
}

/** Personal socket payload: the viewer's hold changed. */
export interface SlotHoldUpdatedEvent {
  hold: SlotHoldView | null;
  /** PROMOTED: it is the viewer's turn now; TAKEN: someone booked the court. */
  reason: "PROMOTED" | "TAKEN" | "RELEASED";
  alternatives: SlotAlternative[];
}

/** An open "looking for a partner" request (GET /partner-requests?date=). */
export interface PartnerRequestItem {
  id: string;
  player: PlayerSummary;
  date: IsoDate;
  timeSlotId: string;
  startTime: string;
  endTime: string;
  /** SINGLES: one opponent wanted; DOUBLES: the poster joins a doubles game. */
  type: BookingType;
  note: string | null;
  /** Posted by the viewer (they can withdraw it). */
  mine: boolean;
  createdAt: IsoDateTime;
}
