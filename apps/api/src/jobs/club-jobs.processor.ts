import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { CLUB_JOBS, CLUB_JOBS_QUEUE, type ClubJobName } from "./club-jobs";
import { ClubJobsRunner } from "./club-jobs.runner";

/** BullMQ worker. One job at a time, so a slow run never overlaps the next one. */
@Processor(CLUB_JOBS_QUEUE, { concurrency: 1 })
export class ClubJobsProcessor extends WorkerHost {
  constructor(private readonly runner: ClubJobsRunner) {
    super();
  }

  async process(job: Job): Promise<Record<string, unknown>> {
    if (!(job.name in CLUB_JOBS)) throw new Error(`Unknown job "${job.name}"`);
    return this.runner.run(job.name as ClubJobName);
  }
}
