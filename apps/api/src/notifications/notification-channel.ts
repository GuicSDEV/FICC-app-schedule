import type { NotificationItem } from "@ficc/shared";

/**
 * A delivery route for notifications that were already stored. In-app delivery over Socket.IO
 * is built in; Web Push or Capacitor Push can be added later as new channels.
 */
export interface NotificationChannel {
  readonly name: string;
  deliver(userId: string, notification: NotificationItem): Promise<void> | void;
}

export const NOTIFICATION_CHANNELS = Symbol("NOTIFICATION_CHANNELS");
