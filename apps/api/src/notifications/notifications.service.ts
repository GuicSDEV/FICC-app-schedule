import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Notification, Prisma, Role } from "@ficc/db";
import type {
  NotificationItem,
  NotificationPayloads,
  NotificationsResponse,
  NotificationType,
} from "@ficc/shared";

import { notFound } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "./notification-channel";

export function toNotificationItem(notification: Notification): NotificationItem {
  return {
    id: notification.id,
    type: notification.type,
    payload: notification.payload,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  } as NotificationItem;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {}

  /** Stores one notification per user and delivers it on every channel. */
  async notify<T extends NotificationType>(
    userIds: string | readonly string[],
    type: T,
    payload: NotificationPayloads[T],
  ): Promise<void> {
    const recipients = [...new Set(typeof userIds === "string" ? [userIds] : userIds)];
    if (recipients.length === 0) return;
    const created = await this.prisma.notification.createManyAndReturn({
      data: recipients.map((userId) => ({
        userId,
        type,
        payload: payload as unknown as Prisma.InputJsonValue,
      })),
    });
    for (const notification of created) {
      const item = toNotificationItem(notification);
      for (const channel of this.channels) {
        try {
          await channel.deliver(notification.userId, item);
        } catch (error) {
          this.logger.warn(`channel ${channel.name} failed: ${(error as Error).message}`);
        }
      }
    }
  }

  async notifyAdmins<T extends NotificationType>(
    type: T,
    payload: NotificationPayloads[T],
  ): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });
    await this.notify(
      admins.map((admin) => admin.id),
      type,
      payload,
    );
  }

  async list(userId: string, limit = 40): Promise<NotificationsResponse> {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items: items.map(toNotificationItem), unreadCount };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.count({ where: { id, userId } });
      if (!exists) throw notFound("NOTIFICATION_NOT_FOUND", "api.notificationNotFound");
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
