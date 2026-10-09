import { Module } from "@nestjs/common";

import { AdminDisputesController, MatchesController } from "./matches.controller";
import { MatchesService } from "./matches.service";

@Module({
  controllers: [MatchesController, AdminDisputesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
