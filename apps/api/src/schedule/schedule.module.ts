import { Global, Module } from "@nestjs/common";

import { DayPlanService } from "./day-plan.service";
import { ScheduleExceptionsController } from "./schedule-exceptions.controller";
import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";
import { SlotEventsService } from "./slot-events.service";

@Global()
@Module({
  controllers: [ScheduleController, ScheduleExceptionsController],
  providers: [ScheduleService, SlotEventsService, DayPlanService],
  exports: [ScheduleService, SlotEventsService, DayPlanService],
})
export class ClubScheduleModule {}
