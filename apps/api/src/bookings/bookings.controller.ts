import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type BookingDetail,
  type CreateBookingInput,
  createBookingSchema,
  type MyBookingsResponse,
  type SlotFavoriteInput,
  type SlotFavoriteItem,
  slotFavoriteSchema,
} from "@ficc/shared";

import { CurrentUser, type RequestUser, Roles } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BookingsService } from "./bookings.service";
import { FavoritesService } from "./favorites.service";

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @Roles(Role.MEMBER)
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createBookingSchema)) body: CreateBookingInput,
  ): Promise<BookingDetail> {
    return this.bookings.create(user.id, body);
  }

  @Get("mine")
  @Roles(Role.MEMBER)
  mine(@CurrentUser() user: RequestUser): Promise<MyBookingsResponse> {
    return this.bookings.mine(user.id);
  }

  @Get(":id")
  get(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<BookingDetail> {
    return this.bookings.get(user.id, user.role, id);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  @Roles(Role.MEMBER)
  confirm(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<BookingDetail> {
    return this.bookings.confirm(user.id, id);
  }

  @Post(":id/decline")
  @HttpCode(200)
  @Roles(Role.MEMBER)
  decline(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<BookingDetail> {
    return this.bookings.decline(user.id, id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @Roles(Role.MEMBER)
  cancel(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<BookingDetail> {
    return this.bookings.cancelByPlayer(user.id, id);
  }
}

@Controller("favorites")
@Roles(Role.MEMBER)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<SlotFavoriteItem[]> {
    return this.favorites.list(user.id);
  }

  @Post()
  add(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(slotFavoriteSchema)) body: SlotFavoriteInput,
  ): Promise<SlotFavoriteItem> {
    return this.favorites.add(user.id, body);
  }

  @Delete()
  @HttpCode(204)
  remove(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(slotFavoriteSchema)) body: SlotFavoriteInput,
  ): Promise<void> {
    return this.favorites.remove(user.id, body);
  }
}
