import { Module } from "@nestjs/common";

import { AdminRankingController } from "./admin-ranking.controller";
import { CategoriesService } from "./categories.service";
import { FriendRankingsController } from "./friend-rankings.controller";
import { FriendRankingsService } from "./friend-rankings.service";
import { RankingController } from "./ranking.controller";
import { RankingService } from "./ranking.service";
import { SeasonsService } from "./seasons.service";

@Module({
  controllers: [RankingController, AdminRankingController, FriendRankingsController],
  providers: [RankingService, SeasonsService, CategoriesService, FriendRankingsService],
  exports: [SeasonsService],
})
export class RankingModule {}
