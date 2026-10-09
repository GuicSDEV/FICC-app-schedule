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
  TOURNAMENT_ENTRY_CONFIRMED: TournamentRef & { categoryName: string; waitlisted: boolean };
  TOURNAMENT_PARTNER_INVITE: TournamentRef & {
    categoryName: string;
    entryId: string;
    invitedBy: string;
  };
  TOURNAMENT_DRAW_PUBLISHED: TournamentRef & { categoryName: string };
  TOURNAMENT_MATCH_SCHEDULED: TournamentMatchRef & {
    date: IsoDate;
    startTime: string;
    courtName: string;
    opponent: string;
  };
  TOURNAMENT_MATCH_CHANGED: TournamentMatchRef & {
    date: IsoDate | null;
    startTime: string | null;
    courtName: string | null;
    opponent: string;
  };
  TOURNAMENT_RESULT_REPORTED: TournamentMatchRef & { reportedBy: string; score: string };
  TOURNAMENT_ADVANCED: TournamentMatchRef & { nextRound: string | null; score: string };
  TOURNAMENT_ELIMINATED: TournamentMatchRef & { score: string };
  TOURNAMENT_CHAMPION: TournamentRef & { categoryName: string; score: string };
  TOURNAMENT_ANNOUNCEMENT: TournamentRef & { body: string; categoryName: string | null };
  TOURNAMENT_RESULT_OVERDUE: TournamentMatchRef & { players: string; slotEndedAt: IsoDateTime };
}

interface TournamentRef {
  tournamentId: string;
  tournamentName: string;
}

interface TournamentMatchRef extends TournamentRef {
  matchId: string;
  categoryName: string;
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
