import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Role, UserStatus } from "@ficc/db";
import { type Permission, permissionsOf } from "@ficc/shared";
import type { Request } from "express";

import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  ROLES_KEY,
  type RequestUser,
} from "../common/auth.decorators";
import { forbidden, unauthorized } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
import { tenant } from "../tenancy/tenant-context";
import { ACCESS_COOKIE } from "./cookies";
import { TokensService } from "./tokens.service";

/** Reads the access token from the httpOnly cookie or an `Authorization: Bearer` header. */
export function accessTokenFrom(request: Request): string | undefined {
  const cookie = (request.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  if (cookie) return cookie;
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

/**
 * Global guard: every route needs a valid access token unless marked @Public(). The user is
 * re-read on each request so deactivation and role changes apply immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const token = accessTokenFrom(request);
    const payload = token ? this.tokens.verifyAccess(token) : null;
    // A token only works for the club that issued it (the lookup below is club-scoped too).
    if (!payload || payload.cid !== tenant().clubId) {
      throw unauthorized("UNAUTHENTICATED", "api.loginRequired");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        name: true,
        isActive: true,
        status: true,
        coach: { select: { id: true } },
        staffRoles: { select: { role: { select: { permissions: true } } } },
      },
    });
    if (!user?.isActive || user.status !== UserStatus.ACTIVE) {
      throw unauthorized("UNAUTHENTICATED", "api.loginRequired");
    }

    request.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      coachId: user.coach?.id ?? null,
      permissions: permissionsOf(user.staffRoles.map((entry) => entry.role)),
    };
    return true;
  }
}

/** Enforces @Roles(...) and @RequirePermissions(...) after authentication. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const permissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (!roles?.length && !permissions?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (!user) throw forbidden("FORBIDDEN", "api.forbidden");
    if (roles?.length && !roles.includes(user.role)) {
      throw forbidden("FORBIDDEN", "api.forbidden");
    }
    if (permissions?.some((permission) => !user.permissions.includes(permission))) {
      throw forbidden("FORBIDDEN", "api.forbidden");
    }
    return true;
  }
}
