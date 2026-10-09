import type { Surface } from "./enums";
import type { IsoDate } from "./dates";

/** Socket.IO event names shared by the API gateway and the web socket provider. */
export const SOCKET_EVENTS = {
  scheduleUpdated: "schedule.updated",
  notificationCreated: "notification.created",
  leaderboardUpdated: "leaderboard.updated",
  freezeUpdated: "freeze.updated",
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
  | "freeze.changed";

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
