import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Role } from "@ficc/db";

import { Clock } from "../common/clock";
import { unauthorized } from "../common/domain.exception";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

export interface AccessPayload {
  sub: string;
  role: Role;
  /** Club the session belongs to; a token is only valid for that club. */
  cid: string;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Short-lived JWT access tokens plus rotating, hashed refresh tokens. */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly clock: Clock,
  ) {}

  signAccess(user: { id: string; role: Role; clubId: string }): string {
    return this.jwt.sign(
      { sub: user.id, role: user.role, cid: user.clubId } satisfies AccessPayload,
      {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.config.get("ACCESS_TOKEN_TTL_MINUTES", { infer: true }) * 60,
      },
    );
  }

  verifyAccess(token: string): AccessPayload | null {
    try {
      return this.jwt.verify<AccessPayload>(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
    } catch {
      return null;
    }
  }

  /** Starts a new refresh-token family (login / register). */
  async issueRefresh(userId: string, userAgent?: string): Promise<string> {
    return this.createRefresh(userId, randomUUID(), userAgent);
  }

  /**
   * Exchanges a refresh token for a new one in the same family. Presenting a token that was
   * already rotated revokes the whole family (likely theft).
   */
  async rotateRefresh(
    token: string,
    userAgent?: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    const now = this.clock.now();
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: sha256(token) },
    });
    if (!stored || stored.expiresAt <= now) {
      throw unauthorized("REFRESH_INVALID", "api.sessionExpired");
    }
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw unauthorized("REFRESH_REUSED", "api.sessionRevoked");
    }
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (revoked.count === 0) {
      await this.revokeFamily(stored.familyId);
      throw unauthorized("REFRESH_REUSED", "api.sessionRevoked");
    }
    const refreshToken = await this.createRefresh(stored.userId, stored.familyId, userAgent);
    return { userId: stored.userId, refreshToken };
  }

  async revokeByToken(token: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: sha256(token) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  private async createRefresh(
    userId: string,
    familyId: string,
    userAgent?: string,
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const ttlDays = this.config.get("REFRESH_TOKEN_TTL_DAYS", { infer: true });
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        userAgent: userAgent?.slice(0, 200) ?? null,
        expiresAt: new Date(this.clock.now().getTime() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
    return token;
  }
}
