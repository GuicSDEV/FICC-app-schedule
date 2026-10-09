import type { Surface } from "./enums";
import type { IsoDate } from "./dates";

/** Socket.IO event names shared by the API gateway and the web socket provider. */
export const SOCKET_EVENTS = {
  scheduleUpdated: "schedule.updated",
  notificationCreated: "notification.created",
  leaderboardUpdated: "leaderboard.updated",
  freezeUpdated: "freeze.updated",
  tournamentUpdated: "tournament.updated",
  courtsNowUpdated: "courts-now.updated",
  newsUpdated: "news.updated",
  /** Club-wide: a court started or stopped being kept by a member who is booking it. */
  slotHoldsChanged: "slot-holds.changed",
  /** Personal: the viewer's own hold or place in line changed (their turn, or the court was booked). */
  slotHoldUpdated: "slot-hold.updated",
  /** Club-wide: someone posted, withdrew or found a partner for a request on this date. */
  partnerRequestsChanged: "partner-requests.changed",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export type ScheduleChangeKind =
  | "booking.created"
  | "booking.confirmed"
  | "booking.cancelled"
  | "lesson.created"
  | "lesson.cancelled"
  | "lesson.restored"
  | "lesson.moved"
  | "freeze.changed"
  | "tournament.scheduled"
  | "tournament.unscheduled"
  | "plan.changed";

export interface ScheduleCellRef {
  date: IsoDate;
  courtId: string;
  timeSlotId: string;
}

export interface ScheduleUpdatedEvent {
  kind: ScheduleChangeKind;
  /** Dates whose grid changed (clients refetch those days). */
  dates: IsoDate[];
  /** Cells that changed, when known, so calendars can animate them. */
  cells: ScheduleCellRef[];
  surface?: Surface;
}

export interface LeaderboardUpdatedEvent {
  matchId: string;
  /** Players whose rating changed. */
  userIds: string[];
}

export interface FreezeUpdatedEvent {
  freezeId: string;
  action: "created" | "lifted" | "expired";
}

export interface TournamentUpdatedEvent {
  tournamentId: string;
  categoryId: string | null;
  /** What changed, so screens refetch only what they show. */
  kind: "draw" | "schedule" | "result" | "entries" | "info";
}

/** Free play changed (check-in, check-out, queue): "Quadras agora" refetches. */
export interface CourtsNowUpdatedEvent {
  date: IsoDate;
}

/** A Mural post was published, edited or removed. */
export interface NewsUpdatedEvent {
  postId: string;
}

/** Who keeps a court right now while booking it. */
export interface SlotHoldInfo {
  userId: string;
  until: string;
}

export interface SlotHoldsChangedEvent extends ScheduleCellRef {
  hold: SlotHoldInfo | null;
}

export interface PartnerRequestsChangedEvent {
  date: IsoDate;
}
