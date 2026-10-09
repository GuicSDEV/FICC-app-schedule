import { Module } from "@nestjs/common";

import {
  BookingsController,
  FavoritesController,
  MemberNoShowsController,
  PartnerRequestsController,
  SlotHoldsController,
} from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { FavoritesService } from "./favorites.service";
import { NoShowsService } from "./no-shows.service";
import { PartnerRequestStore } from "./partner-request.store";
import { PartnerRequestsService } from "./partner-requests.service";
import { SlotHoldStore } from "./slot-hold.store";
import { SlotHoldsService } from "./slot-holds.service";

@Module({
  controllers: [
    BookingsController,
    FavoritesController,
    MemberNoShowsController,
    SlotHoldsController,
    PartnerRequestsController,
  ],
  providers: [
    BookingsService,
    FavoritesService,
    NoShowsService,
    SlotHoldStore,
    SlotHoldsService,
    PartnerRequestStore,
    PartnerRequestsService,
  ],
  exports: [BookingsService, NoShowsService],
})
export class BookingsModule {}
