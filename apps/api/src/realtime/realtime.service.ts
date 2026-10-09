import { Injectable } from "@nestjs/common";
import {
  type FreezeUpdatedEvent,
  type LeaderboardUpdatedEvent,
  SOCKET_EVENTS,
  type ScheduleUpdatedEvent,
  type TournamentUpdatedEvent,
} from "@ficc/shared";
import type { Server } from "socket.io";

import { tenant } from "../tenancy/tenant-context";

/** Every socket of a club joins this room; club-wide events never cross clubs. */
export const clubRoom = (clubId: string) => `club:${clubId}`;
export const userRoom = (userId: string) => `user:${userId}`;
export const roleRoom = (clubId: string, role: string) => `club:${clubId}:role:${role}`;

/** Emits real-time events to the current club. A no-op until the gateway attaches its server. */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  scheduleUpdated(event: ScheduleUpdatedEvent): void {
    if (event.dates.length === 0) return;
    this.toClub(SOCKET_EVENTS.scheduleUpdated, event);
  }

  leaderboardUpdated(event: LeaderboardUpdatedEvent): void {
    this.toClub(SOCKET_EVENTS.leaderboardUpdated, event);
  }

  freezeUpdated(event: FreezeUpdatedEvent): void {
    this.toClub(SOCKET_EVENTS.freezeUpdated, event);
  }

  tournamentUpdated(event: TournamentUpdatedEvent): void {
    this.toClub(SOCKET_EVENTS.tournamentUpdated, event);
  }

  /** User ids are globally unique, so personal rooms need no club prefix. */
  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  private toClub(event: string, payload: unknown): void {
    this.server?.to(clubRoom(tenant().clubId)).emit(event, payload);
  }
}
