import { Module } from "@nestjs/common";

import { AdminLessonsController, CoachController } from "./lessons.controller";
import { LessonsService } from "./lessons.service";

@Module({
  controllers: [CoachController, AdminLessonsController],
  providers: [LessonsService],
  exports: [LessonsService],
})
export class LessonsModule {}
