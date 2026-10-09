import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuditInterceptor } from "./audit.interceptor";
import { SettingsService } from "./settings.service";
import { AuditController, SettingsController, StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  controllers: [StaffController, AuditController, SettingsController],
  providers: [
    StaffService,
    SettingsService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class StaffModule {}
