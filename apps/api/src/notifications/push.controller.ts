import { Body, Controller, Delete, Get, HttpCode, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type DeviceTokenInput,
  type DeviceTokenRemoveInput,
  deviceTokenRemoveSchema,
  deviceTokenSchema,
  type PushEndpointInput,
  pushEndpointSchema,
  type PushSubscriptionInput,
  pushSubscriptionSchema,
} from "@ficc/shared";

import { CurrentUser, type RequestUser, SkipAudit } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

/** Phones that receive this person's notifications: web push and the native apps. */
@Controller("push")
export class PushController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** The public VAPID key browsers subscribe with; null when push is off. */
  @Get("key")
  key(): { publicKey: string | null } {
    const publicKey = this.config.get("VAPID_PUBLIC_KEY", { infer: true });
    const privateKey = this.config.get("VAPID_PRIVATE_KEY", { infer: true });
    return { publicKey: publicKey && privateKey ? publicKey : null };
  }

  /** This device starts receiving the person's notifications (a device moves to whoever logs in). */
  @Post("subscriptions")
  @HttpCode(204)
  @SkipAudit()
  async subscribe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: PushSubscriptionInput,
  ): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
  }

  @Delete("subscriptions")
  @HttpCode(204)
  @SkipAudit()
  async unsubscribe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(pushEndpointSchema)) body: PushEndpointInput,
  ): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: user.id },
    });
  }

  /** A native app install starts receiving the person's notifications (moves on a new login). */
  @Post("devices")
  @HttpCode(204)
  @SkipAudit()
  async registerDevice(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(deviceTokenSchema)) body: DeviceTokenInput,
  ): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token: body.token },
      create: { userId: user.id, token: body.token, platform: body.platform },
      update: { userId: user.id, platform: body.platform },
    });
  }

  @Delete("devices")
  @HttpCode(204)
  @SkipAudit()
  async removeDevice(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(deviceTokenRemoveSchema)) body: DeviceTokenRemoveInput,
  ): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token: body.token, userId: user.id } });
  }
}
