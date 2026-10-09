import { Injectable } from "@nestjs/common";
import { type NotificationItem, SOCKET_EVENTS } from "@ficc/shared";

import { RealtimeService } from "../realtime/realtime.service";
import type { NotificationChannel } from "./notification-channel";

/** Pushes `notification.created` to the user's personal socket room. */
@Injectable()
export class SocketNotificationChannel implements NotificationChannel {
  readonly name = "socket";

  constructor(private readonly realtime: RealtimeService) {}

  deliver(userId: string, notification: NotificationItem): void {
    this.realtime.toUser(userId, SOCKET_EVENTS.notificationCreated, notification);
  }
}
