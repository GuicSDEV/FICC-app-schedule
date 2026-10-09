import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";

import type { Env } from "../config/env";
import { MatchesService } from "./matches.service";

@Injectable()
export class MatchesJobs {
  private readonly logger = new Logger(MatchesJobs.name);

  constructor(
    private readonly matches: MatchesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Every 5 minutes: auto-approve results unanswered for 48 hours. */
  @Interval("auto-approve-matches", 5 * 60_000)
  async autoApprove(): Promise<void> {
    if (!this.config.get("JOBS_ENABLED", { infer: true })) return;
    try {
      await this.matches.autoApprove();
    } catch (error) {
      this.logger.error(`autoApprove failed: ${(error as Error).message}`);
    }
  }
}
