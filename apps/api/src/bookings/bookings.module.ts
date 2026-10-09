import { Module } from "@nestjs/common";

import {
  BookingsController,
  FavoritesController,
  MemberNoShowsController,
  SlotHoldsController,
} from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { FavoritesService } from "./favorites.service";
import { NoShowsService } from "./no-shows.service";
import { SlotHoldStore } from "./slot-hold.store";
import { SlotHoldsService } from "./slot-holds.service";

@Module({
  controllers: [
    BookingsController,
    FavoritesController,
    MemberNoShowsController,
    SlotHoldsController,
  ],
  providers: [BookingsService, FavoritesService, NoShowsService, SlotHoldStore, SlotHoldsService],
  exports: [BookingsService, NoShowsService],
})
export class BookingsModule {}
