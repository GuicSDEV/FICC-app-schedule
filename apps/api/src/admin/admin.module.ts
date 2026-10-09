import { Module } from "@nestjs/common";

import { CoachesAdminController } from "./coaches.controller";
import { CoachesAdminService } from "./coaches.service";

@Module({
  controllers: [CoachesAdminController],
  providers: [CoachesAdminService],
})
export class AdminModule {}
