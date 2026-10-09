import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@ficc/db";
import type { Request } from "express";

import { IS_PUBLIC_KEY, ROLES_KEY, type RequestUser } from "../common/auth.decorators";
import { forbidden, unauthorized } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
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
    if (!payload) throw unauthorized("UNAUTHENTICATED", "Faça login para continuar.");

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, name: true, isActive: true, coach: { select: { id: true } } },
    });
    if (!user?.isActive) throw unauthorized("UNAUTHENTICATED", "Faça login para continuar.");

    request.user = {
      id: user.id,
      role: user.role,
      name: user.name,
      coachId: user.coach?.id ?? null,
    };
    return true;
  }
}

/** Enforces @Roles(...) after authentication. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (!user || !roles.includes(user.role)) {
      throw forbidden("FORBIDDEN", "Você não tem permissão para isso.");
    }
    return true;
  }
}
