import { Module } from "@nestjs/common";

import { BookingsModule } from "../bookings/bookings.module";
import { LessonsModule } from "../lessons/lessons.module";
import { AdminFreezesController, FreezesController } from "./freezes.controller";
import { FreezesService } from "./freezes.service";

@Module({
  imports: [BookingsModule, LessonsModule],
  controllers: [FreezesController, AdminFreezesController],
  providers: [FreezesService],
  exports: [FreezesService],
})
export class FreezesModule {}
