import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { ClubResolver } from "./club-resolver";
import { ClubsService } from "./clubs.service";
import { runWithTenant } from "./tenant-context";

/** Resolves the request's club and runs the rest of the pipeline inside its tenant context. */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly resolver: ClubResolver,
    private readonly clubs: ClubsService,
  ) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    try {
      const club = await this.clubs.tenantBySlug(
        this.resolver.resolveSlug({ host: request.hostname, headers: request.headers }),
      );
      runWithTenant(club, () => next());
    } catch (error) {
      next(error);
    }
  }
}
