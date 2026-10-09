import { Global, Module } from "@nestjs/common";

import { ScheduleController } from "./schedule.controller";
import { ScheduleService } from "./schedule.service";
import { SlotEventsService } from "./slot-events.service";

@Global()
@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService, SlotEventsService],
  exports: [ScheduleService, SlotEventsService],
})
export class ClubScheduleModule {}
