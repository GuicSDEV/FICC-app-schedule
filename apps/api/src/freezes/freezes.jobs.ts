import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";

import type { Env } from "../config/env";
import { FreezesService } from "./freezes.service";

@Injectable()
export class FreezesJobs {
  private readonly logger = new Logger(FreezesJobs.name);

  constructor(
    private readonly freezes: FreezesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Every minute: broadcast freezes that ended on their own. */
  @Interval("announce-expired-freezes", 60_000)
  async announceExpired(): Promise<void> {
    if (!this.config.get("JOBS_ENABLED", { infer: true })) return;
    try {
      await this.freezes.announceExpired();
    } catch (error) {
      this.logger.error(`announceExpired failed: ${(error as Error).message}`);
    }
  }
}
