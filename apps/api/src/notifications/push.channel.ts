import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NotificationItem } from "@ficc/shared";
import webpush from "web-push";

import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationChannel } from "./notification-channel";
import { type PushMessage, pushMessage } from "./push-message";

/**
 * Sends the notifications people act on (an invitation, a result to approve, a free court…) to
 * their phones by web push. Off when the VAPID keys are not configured. Subscriptions the push
 * service no longer knows (404/410) are dropped.
 */
@Injectable()
export class PushNotificationChannel implements NotificationChannel {
  readonly name = "push";
  private readonly logger = new Logger(PushNotificationChannel.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const publicKey = config.get("VAPID_PUBLIC_KEY", { infer: true });
    const privateKey = config.get("VAPID_PRIVATE_KEY", { infer: true });
    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled) {
      webpush.setVapidDetails(
        config.get("VAPID_SUBJECT", { infer: true }),
        publicKey!,
        privateKey!,
      );
    }
  }

  deliver(userId: string, notification: NotificationItem): void {
    if (!this.enabled) return;
    const message = pushMessage(notification);
    if (!message) return;
    // Never hold the request that caused the notification on the push services.
    void this.send(userId, message).catch((error: unknown) =>
      this.logger.warn(`push failed: ${(error as Error).message}`),
    );
  }

  private async send(userId: string, message: PushMessage): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(message),
          { TTL: 24 * 60 * 60, urgency: "high" },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        } else throw error;
      }
    }
  }
}
