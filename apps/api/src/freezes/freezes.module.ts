import { Module } from "@nestjs/common";

import { BookingsModule } from "../bookings/bookings.module";
import { LessonsModule } from "../lessons/lessons.module";
import { AdminFreezesController, FreezesController } from "./freezes.controller";
import { FreezesJobs } from "./freezes.jobs";
import { FreezesService } from "./freezes.service";

@Module({
  imports: [BookingsModule, LessonsModule],
  controllers: [FreezesController, AdminFreezesController],
  providers: [FreezesService, FreezesJobs],
})
export class FreezesModule {}
