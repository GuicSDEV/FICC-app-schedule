import { Module } from "@nestjs/common";

import { CoachesAdminController } from "./coaches.controller";
import { CoachesAdminService } from "./coaches.service";
import { AdminMembersController } from "./members.controller";

@Module({
  controllers: [CoachesAdminController, AdminMembersController],
  providers: [CoachesAdminService],
})
export class AdminModule {}
