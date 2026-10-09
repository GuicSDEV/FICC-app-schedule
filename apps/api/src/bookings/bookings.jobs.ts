import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";

import type { Env } from "../config/env";
import { BookingsService } from "./bookings.service";

@Injectable()
export class BookingsJobs {
  private readonly logger = new Logger(BookingsJobs.name);

  constructor(
    private readonly bookings: BookingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Every minute: cancel pending bookings nobody fully confirmed within 2 hours. */
  @Interval("expire-pending-bookings", 60_000)
  async expirePending(): Promise<void> {
    if (!this.config.get("JOBS_ENABLED", { infer: true })) return;
    try {
      await this.bookings.expirePending();
    } catch (error) {
      this.logger.error(`expirePending failed: ${(error as Error).message}`);
    }
  }
}
