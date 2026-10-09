import { Module } from "@nestjs/common";

import { BookingsController, FavoritesController } from "./bookings.controller";
import { BookingsJobs } from "./bookings.jobs";
import { BookingsService } from "./bookings.service";
import { FavoritesService } from "./favorites.service";

@Module({
  controllers: [BookingsController, FavoritesController],
  providers: [BookingsService, FavoritesService, BookingsJobs],
  exports: [BookingsService],
})
export class BookingsModule {}
