import { Module } from "@nestjs/common";

import { AdminDisputesController, MatchesController } from "./matches.controller";
import { MatchesJobs } from "./matches.jobs";
import { MatchesService } from "./matches.service";

@Module({
  controllers: [MatchesController, AdminDisputesController],
  providers: [MatchesService, MatchesJobs],
  exports: [MatchesService],
})
export class MatchesModule {}
