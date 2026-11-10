import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type NotificationItem, translate } from "@ficc/shared";
import webpush from "web-push";

import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { tenantOrUndefined } from "../tenancy/tenant-context";
import type { NotificationChannel } from "./notification-channel";

/** What a notification says on the phone, and the screen it opens. */
interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

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
    const message = this.message(notification);
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

  /** The text, in the club's language; null for notifications that stay in the app. */
  private message(item: NotificationItem): PushMessage | null {
    const tenant = tenantOrUndefined();
    const locale = tenant?.locale;
    const day = (date: string) =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
      })
        .format(new Date(`${date}T12:00:00Z`))
        .replace(".", "");
    const text = (key: string, params: Record<string, string | number>) => ({
      title: translate(`push.${key}.title`, {}, locale),
      body: translate(`push.${key}.body`, params, locale),
    });
    const tag = `${item.type}-${item.id}`;
    switch (item.type) {
      case "BOOKING_INVITE": {
        const { invitedBy, courtName, date, startTime } = item.payload;
        return {
          ...text(item.type, { invitedBy, court: courtName, day: day(date), time: startTime }),
          url: "/app",
          tag,
        };
      }
      case "BOOKING_CONFIRMED":
      case "BOOKING_CANCELLED": {
        const { courtName, date, startTime } = item.payload;
        return {
          ...text(item.type, { court: courtName, day: day(date), time: startTime }),
          url: "/app",
          tag,
        };
      }
      case "BOOKING_PLAYER_LEFT": {
        const { playerName, courtName, date, startTime } = item.payload;
        return {
          ...text(item.type, {
            name: playerName,
            court: courtName,
            day: day(date),
            time: startTime,
          }),
          url: "/app",
          tag,
        };
      }
      case "MATCH_REPORTED": {
        const { reportedBy, score, matchId } = item.payload;
        return { ...text(item.type, { reportedBy, score }), url: `/app/matches/${matchId}`, tag };
      }
      case "COURT_AVAILABLE":
        return {
          ...text(item.type, { court: item.payload.courtName }),
          url: "/app/courts-now",
          tag,
        };
      case "FRIEND_RANKING_ADDED": {
        const { addedBy, rankingName, rankingId } = item.payload;
        return {
          ...text(item.type, { name: addedBy, ranking: rankingName }),
          url: `/app/ranking/friends/${rankingId}`,
          tag,
        };
      }
      default:
        return null;
    }
  }
}
