import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "@ficc/db";
import type { Request } from "express";
import { type Observable, tap } from "rxjs";

import { API_PREFIX } from "../api-prefix";
import { type RequestUser, SKIP_AUDIT_KEY } from "../common/auth.decorators";
import { PrismaService } from "../prisma/prisma.service";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STAFF: Role[] = [Role.ADMIN, Role.COACH, Role.GATE];
const SECRET_KEYS = /password|token|secret/i;
const MAX_STRING = 500;

/** Request body without secrets and with long values (CSV imports) cut short. */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "…";
  if (typeof value === "string")
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEYS.test(key) ? "***" : sanitize(item, depth + 1),
      ]),
    );
  }
  return value;
}

/**
 * Writes every successful staff action (a mutating request by an admin, coach or gate account) to
 * the audit log: who, which route, which record and the request body without secrets.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Audit");

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip || !user || !STAFF.includes(user.role) || !MUTATIONS.has(request.method)) {
      return next.handle();
    }
    const route = ((request.route as { path?: string } | undefined)?.path ?? request.path).replace(
      new RegExp(`^/${API_PREFIX}`),
      "",
    );
    return next.handle().pipe(
      tap((result) => {
        const params = request.params as Record<string, string | undefined>;
        const resultId =
          result && typeof result === "object" && "id" in result && typeof result.id === "string"
            ? result.id
            : null;
        this.prisma.auditLog
          .create({
            data: {
              actorId: user.id,
              action: `${request.method} ${route}`,
              entityId: params.id ?? params.memberId ?? params.passId ?? resultId,
              details: (sanitize(request.body) ?? null) as never,
            },
          })
          .catch((error: unknown) => this.logger.error(`audit write failed: ${String(error)}`));
      }),
    );
  }
}
