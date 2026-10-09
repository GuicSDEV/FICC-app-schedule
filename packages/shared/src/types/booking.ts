import type { IsoDate } from "../dates";
import type {
  BookingCancelReason,
  BookingPlayerStatus,
  BookingStatus,
  BookingType,
} from "../enums";
import type { CourtSummary, IsoDateTime, SlotSummary } from "./common";
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
