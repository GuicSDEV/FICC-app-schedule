import { Injectable } from "@nestjs/common";
import {
  type FreezeUpdatedEvent,
  type LeaderboardUpdatedEvent,
  SOCKET_EVENTS,
  type ScheduleUpdatedEvent,
} from "@ficc/shared";
import type { Server } from "socket.io";

/** Emits real-time events. A no-op until the gateway attaches its server. */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  scheduleUpdated(event: ScheduleUpdatedEvent): void {
    if (event.dates.length === 0) return;
    this.server?.emit(SOCKET_EVENTS.scheduleUpdated, event);
  }

  leaderboardUpdated(event: LeaderboardUpdatedEvent): void {
    this.server?.emit(SOCKET_EVENTS.leaderboardUpdated, event);
  }

  freezeUpdated(event: FreezeUpdatedEvent): void {
    this.server?.emit(SOCKET_EVENTS.freezeUpdated, event);
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
