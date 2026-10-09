import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./auth/auth.module";
import { BookingsModule } from "./bookings/bookings.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { CommonModule } from "./common/common.module";
import { validateEnv } from "./config/env";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { ClubScheduleModule } from "./schedule/schedule.module";
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
    ScheduleModule.forRoot(),
    CommonModule,
    PrismaModule,
    RealtimeModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
    UsersModule,
    ClubScheduleModule,
    BookingsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
