import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { RequestUser } from "./auth.decorators";
import { DomainException } from "./domain.exception";

const RATE_LIMIT_KEY = "rateLimit";

interface RateLimitOptions {
  /** Bucket name (routes sharing a name share the budget). */
  name: string;
  limit: number;
  windowMs: number;
}

/**
 * Caps how often one person may call a route (e.g. 5 booking attempts per 10 s), so the opening
 * rush stays fair: tapping faster or scripting requests does not buy extra chances.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Sliding-window limiter per user (or IP when anonymous). Kept in memory: each API instance
 * enforces its own window, which bounds a person to `limit × instances` per window.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;
    const request = context.switchToHttp().getRequest<{ user?: RequestUser; ip?: string }>();
    const key = `${options.name}:${request.user?.id ?? request.ip ?? "anonymous"}`;
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < options.windowMs);
    if (recent.length >= options.limit) {
      this.hits.set(key, recent);
      throw new DomainException(
        HttpStatus.TOO_MANY_REQUESTS,
        "TOO_MANY_REQUESTS",
        "api.tooManyRequests",
        {
          retryAfterMs: options.windowMs - (now - recent[0]!),
        },
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now, options.windowMs);
    return true;
  }

  private prune(now: number, windowMs: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= windowMs)) this.hits.delete(key);
    }
  }
}
