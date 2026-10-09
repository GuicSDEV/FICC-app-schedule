import type { IsoDate } from "../dates";
import type { BookingCancelReason, FreezeReason, NotificationType, TeamSide } from "../enums";
import type { IsoDateTime } from "./common";

interface SlotRef {
  date: IsoDate;
  courtId: string;
  courtName: string;
  timeSlotId: string;
  startTime: string;
}

/** Data carried by each notification type; the web app renders the pt-BR text from it. */
export interface NotificationPayloads {
  BOOKING_INVITE: SlotRef & { bookingId: string; invitedBy: string };
  BOOKING_CONFIRMED: SlotRef & { bookingId: string };
  BOOKING_CANCELLED: SlotRef & {
    bookingId: string;
    reason: BookingCancelReason;
    byName: string | null;
  };
  SLOT_OPENED: SlotRef;
  LESSON_CANCELLED: SlotRef & { lessonId: string; byName: string };
  MATCH_REPORTED: { matchId: string; reportedBy: string; score: string };
  MATCH_CONFIRMED: {
    matchId: string;
    won: boolean;
    side: TeamSide;
    score: string;
    eloBefore: number;
    eloAfter: number;
    delta: number;
    rankBefore: number;
    rankAfter: number;
  };
  MATCH_DISPUTED: { matchId: string; disputedBy: string; comment: string | null };
  DISPUTE_RESOLVED: { matchId: string; action: "ACCEPT" | "EDIT" | "VOID" };
  COURT_FROZEN: {
    freezeId: string;
    reason: FreezeReason;
    courtNames: string[];
    startsAt: IsoDateTime;
    endsAt: IsoDateTime | null;
  };
  COURT_UNFROZEN: { freezeId: string; courtNames: string[] };
  GUEST_CHECKED_IN: { guestPassId: string; guestName: string; at: IsoDateTime };
}

export type NotificationItem = {
  [T in NotificationType]: {
    id: string;
    type: T;
    payload: NotificationPayloads[T];
    readAt: IsoDateTime | null;
    createdAt: IsoDateTime;
  };
}[NotificationType];

export interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}
