import { createSign } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NotificationItem } from "@ficc/shared";

import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationChannel } from "./notification-channel";
import { type PushMessage, pushMessage } from "./push-message";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * Push to the native apps (App Store / Google Play) through Firebase Cloud Messaging (HTTP v1),
 * with the same texts as web push. Off without FIREBASE_SERVICE_ACCOUNT. Tokens Firebase no longer
 * knows (an uninstalled app) are dropped.
 */
@Injectable()
export class FcmNotificationChannel implements NotificationChannel {
  readonly name = "fcm";
  private readonly logger = new Logger(FcmNotificationChannel.name);
  private readonly account: ServiceAccount | null;
  private access: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const encoded = config.get("FIREBASE_SERVICE_ACCOUNT", { infer: true });
    this.account = encoded ? FcmNotificationChannel.parse(encoded) : null;
  }

  private static parse(encoded: string): ServiceAccount {
    const raw = encoded.startsWith("{") ? encoded : Buffer.from(encoded, "base64").toString("utf8");
    const account = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!account.project_id || !account.client_email || !account.private_key) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not a Firebase service account JSON");
    }
    return account as ServiceAccount;
  }

  deliver(userId: string, notification: NotificationItem): void {
    if (!this.account) return;
    const message = pushMessage(notification);
    if (!message) return;
    // Never hold the request that caused the notification on Firebase.
    void this.send(userId, message).catch((error: unknown) =>
      this.logger.warn(`native push failed: ${(error as Error).message}`),
    );
  }

  private async send(userId: string, message: PushMessage): Promise<void> {
    const devices = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (devices.length === 0) return;
    const accessToken = await this.accessToken();
    for (const device of devices) {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.account!.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: message.title, body: message.body },
              data: { url: message.url, tag: message.tag },
              android: { priority: "HIGH", notification: { tag: message.tag } },
              apns: {
                headers: { "apns-collapse-id": message.tag.slice(0, 64) },
                payload: { aps: { sound: "default" } },
              },
            },
          }),
        },
      );
      if (response.ok) continue;
      const detail = await response.text();
      // The app was uninstalled or the token rotated: forget this device.
      if (response.status === 404 || detail.includes("UNREGISTERED")) {
        await this.prisma.deviceToken.deleteMany({ where: { id: device.id } });
      } else {
        throw new Error(`FCM ${response.status}: ${detail.slice(0, 200)}`);
      }
    }
  }

  /** OAuth access token for FCM, from a JWT signed with the service account (cached ~1 hour). */
  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.access && this.access.expiresAt - 60 > now) return this.access.token;
    const account = this.account!;
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${claims}`)
      .sign(account.private_key);
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claims}.${base64url(signature)}`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Google token ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.access = { token: body.access_token, expiresAt: now + body.expires_in };
    return body.access_token;
  }
}
