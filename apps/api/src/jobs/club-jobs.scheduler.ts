import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import type { Queue } from "bullmq";

import { CLUB_JOBS, CLUB_JOBS_QUEUE, type ClubJobName } from "./club-jobs";

/** Keeps one BullMQ job scheduler per job (upserts are idempotent across restarts and instances). */
@Injectable()
export class ClubJobsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClubJobsScheduler.name);

  constructor(@InjectQueue(CLUB_JOBS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const [name, { every, runOnBoot }] of Object.entries(CLUB_JOBS) as [
      ClubJobName,
      (typeof CLUB_JOBS)[ClubJobName],
    ][]) {
      await this.queue.upsertJobScheduler(name, { every }, { name, opts: JOB_OPTIONS });
      // Catch up after downtime; the fixed id drops duplicates while one is still queued.
      if (runOnBoot) await this.queue.add(name, {}, { ...JOB_OPTIONS, jobId: `${name}.boot` });
    }
    this.logger.log(`Scheduled ${Object.keys(CLUB_JOBS).length} club jobs`);
  }
}

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: 100,
  removeOnFail: 500,
} as const;
