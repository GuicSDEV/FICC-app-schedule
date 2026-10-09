import { Module } from "@nestjs/common";

import { MatchesModule } from "../matches/matches.module";
import { CircuitsService } from "./circuits.service";
import { DrawService } from "./draw.service";
import { EntriesService } from "./entries.service";
import { OrderOfPlayService } from "./order-of-play.service";
import { ResultsService } from "./results.service";
import { TournamentContextService } from "./tournament-context.service";
import {
  CircuitsController,
  PlayerTitlesController,
  PublicTournamentsController,
  TournamentEntriesController,
  TournamentMatchesController,
  TournamentsController,
} from "./tournaments.controller";
import { TournamentsService } from "./tournaments.service";

/** Tournaments and circuits (Phase 9.5): registration, draws, order of play, results. */
@Module({
  imports: [MatchesModule],
  controllers: [
    TournamentsController,
    TournamentEntriesController,
    TournamentMatchesController,
    CircuitsController,
    PlayerTitlesController,
    PublicTournamentsController,
  ],
  providers: [
    TournamentContextService,
    TournamentsService,
    EntriesService,
    CircuitsService,
    DrawService,
    OrderOfPlayService,
    ResultsService,
  ],
  exports: [ResultsService, TournamentsService],
})
export class TournamentsModule {}
