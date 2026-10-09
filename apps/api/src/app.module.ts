import { Module } from "@nestjs/common";
import { ConditionalModule, ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { CoachesModule } from "./coaches/coaches.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { CommonModule } from "./common/common.module";
import { validateEnv } from "./config/env";
import { FreezesModule } from "./freezes/freezes.module";
import { GuestsModule } from "./guests/guests.module";
import { HealthModule } from "./health/health.module";
import { JobsModule } from "./jobs/jobs.module";
import { LessonsModule } from "./lessons/lessons.module";
import { MatchesModule } from "./matches/matches.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RankingModule } from "./ranking/ranking.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ClubScheduleModule } from "./schedule/schedule.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Paths are relative to apps/api (where turbo/pnpm run the API).
      // The app-local file wins over the shared root file.
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
    CommonModule,
    PrismaModule,
    TenancyModule,
    RealtimeModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
    UsersModule,
    ClubScheduleModule,
    BookingsModule,
    LessonsModule,
    CoachesModule,
    FreezesModule,
    AdminModule,
    MatchesModule,
    RankingModule,
    GuestsModule,
    // Workers and schedulers only where jobs are enabled (off in tests, which call the runner).
    ConditionalModule.registerWhen(
      JobsModule,
      (env) => !["false", "0"].includes(env.JOBS_ENABLED ?? ""),
    ),
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
