import { Module } from "@nestjs/common";

import {
  BookingsController,
  FavoritesController,
  MemberNoShowsController,
} from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { FavoritesService } from "./favorites.service";
import { NoShowsService } from "./no-shows.service";

@Module({
  controllers: [BookingsController, FavoritesController, MemberNoShowsController],
  providers: [BookingsService, FavoritesService, NoShowsService],
  exports: [BookingsService, NoShowsService],
})
export class BookingsModule {}
