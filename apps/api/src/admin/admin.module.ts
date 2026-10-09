import { Module } from "@nestjs/common";

import { BookingsModule } from "../bookings/bookings.module";
import { CoachesAdminController } from "./coaches.controller";
import { CoachesAdminService } from "./coaches.service";
import { AdminMembersController } from "./members.controller";

@Module({
  imports: [BookingsModule],
  controllers: [CoachesAdminController, AdminMembersController],
  providers: [CoachesAdminService],
})
export class AdminModule {}
