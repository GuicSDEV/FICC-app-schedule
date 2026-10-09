import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { BookingsModule } from "../bookings/bookings.module";
import type { Env } from "../config/env";
import { FreePlayModule } from "../free-play/free-play.module";
import { FreezesModule } from "../freezes/freezes.module";
import { GuestsModule } from "../guests/guests.module";
import { LessonsModule } from "../lessons/lessons.module";
import { MatchesModule } from "../matches/matches.module";
import { TournamentsModule } from "../tournaments/tournaments.module";
import { CLUB_JOBS_QUEUE } from "./club-jobs";
import { ClubJobsProcessor } from "./club-jobs.processor";
import { ClubJobsRunner } from "./club-jobs.runner";
import { ClubJobsScheduler } from "./club-jobs.scheduler";

/** Background jobs on BullMQ + Redis (loaded only when JOBS_ENABLED; see AppModule). */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get("REDIS_URL", { infer: true }) },
        prefix: config.get("QUEUE_PREFIX", { infer: true }),
      }),
    }),
    BullModule.registerQueue({ name: CLUB_JOBS_QUEUE }),
    BookingsModule,
    MatchesModule,
    LessonsModule,
    FreezesModule,
    GuestsModule,
    TournamentsModule,
    FreePlayModule,
  ],
  providers: [ClubJobsRunner, ClubJobsProcessor, ClubJobsScheduler],
  exports: [ClubJobsRunner],
})
export class JobsModule {}
