import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";

import type { Env } from "../config/env";
import { LessonsService } from "./lessons.service";

@Injectable()
export class LessonsJobs implements OnApplicationBootstrap {
  private readonly logger = new Logger(LessonsJobs.name);

  constructor(
    private readonly lessons: LessonsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Catch up on start (e.g. after downtime). */
  onApplicationBootstrap(): void {
    void this.generate();
  }

  /** Daily at 03:10 club time: extend the 8-week window of lesson occurrences. */
  @Cron("10 3 * * *", { name: "generate-lesson-occurrences", timeZone: "America/Sao_Paulo" })
  async generate(): Promise<void> {
    if (!this.config.get("JOBS_ENABLED", { infer: true })) return;
    try {
      await this.lessons.generateSeriesOccurrences();
    } catch (error) {
      this.logger.error(`lesson generation failed: ${(error as Error).message}`);
    }
  }
}
