import { Controller, Get, Param, Query } from "@nestjs/common";
import {
  type EloPoint,
  type H2HQuery,
  h2hQuerySchema,
  type H2HResponse,
  type LeaderboardQuery,
  leaderboardQuerySchema,
  type LeaderboardResponse,
  type PlayerProfile,
} from "@ficc/shared";

import { CurrentUser, type RequestUser } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RankingService } from "./ranking.service";

@Controller()
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  @Get("leaderboard")
  leaderboard(
    @Query(new ZodValidationPipe(leaderboardQuerySchema)) query: LeaderboardQuery,
  ): Promise<LeaderboardResponse> {
    return this.ranking.leaderboard(query.category);
  }

  @Get("players/:id")
  profile(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<PlayerProfile> {
    return this.ranking.profile(id, user.id);
  }

  @Get("players/:id/elo-history")
  eloHistory(@Param("id") id: string): Promise<EloPoint[]> {
    return this.ranking.eloHistory(id);
  }

  @Get("h2h")
  h2h(@Query(new ZodValidationPipe(h2hQuerySchema)) query: H2HQuery): Promise<H2HResponse> {
    return this.ranking.h2h(query.a, query.b);
  }
}
