import { Module } from "@nestjs/common";

import { AdminLessonsController, CoachController } from "./lessons.controller";
import { LessonsJobs } from "./lessons.jobs";
import { LessonsService } from "./lessons.service";

@Module({
  controllers: [CoachController, AdminLessonsController],
  providers: [LessonsService, LessonsJobs],
  exports: [LessonsService],
})
export class LessonsModule {}
