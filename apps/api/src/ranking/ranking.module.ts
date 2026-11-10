import { Module } from "@nestjs/common";

import { AdminRankingController } from "./admin-ranking.controller";
import { CategoriesService } from "./categories.service";
import { RankingController } from "./ranking.controller";
import { RankingService } from "./ranking.service";
import { SeasonsService } from "./seasons.service";

@Module({
  controllers: [RankingController, AdminRankingController],
  providers: [RankingService, SeasonsService, CategoriesService],
  exports: [SeasonsService],
})
export class RankingModule {}
