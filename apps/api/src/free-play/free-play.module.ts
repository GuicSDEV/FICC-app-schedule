import { Module } from "@nestjs/common";

import { FreePlayController } from "./free-play.controller";
import { FreePlayService } from "./free-play.service";

@Module({
  controllers: [FreePlayController],
  providers: [FreePlayService],
  exports: [FreePlayService],
})
export class FreePlayModule {}
