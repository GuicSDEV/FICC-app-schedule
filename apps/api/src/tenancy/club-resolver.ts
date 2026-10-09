import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Env } from "../config/env";

/** What the resolver may look at; Express requests and socket handshakes both fit. */
export interface ClubRequestInfo {
  host?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Decides which club a request is for. v1 serves one club per deployment, chosen by
 * DEFAULT_CLUB_SLUG, so URLs stay as they are. A later version can read the subdomain (or the
 * native app's club selection) here without touching any route.
 */
@Injectable()
export class ClubResolver {
  constructor(private readonly config: ConfigService<Env, true>) {}

  resolveSlug(_request: ClubRequestInfo): string {
    return this.config.get("DEFAULT_CLUB_SLUG", { infer: true });
  }
}
