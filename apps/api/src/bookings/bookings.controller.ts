import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { BookingCancelReason, Role } from "@ficc/db";
import {
  type BookingDetail,
  type CreateBookingInput,
  createBookingSchema,
  type CreatePartnerRequestInput,
  createPartnerRequestSchema,
  type MemberNoShows,
  type MyBookingsResponse,
  type NoShowInput,
  type NoShowItem,
  noShowSchema,
  type PartnerRequestItem,
  type PartnerRequestsQuery,
  partnerRequestsQuerySchema,
  type SlotFavoriteInput,
  type SlotFavoriteItem,
  slotFavoriteSchema,
  type SlotHoldInput,
  slotHoldSchema,
  type SlotHoldView,
} from "@ficc/shared";

import {
  CurrentUser,
  type RequestUser,
  RequirePermissions,
  Roles,
  SkipAudit,
} from "../common/auth.decorators";
import { RateLimit } from "../common/rate-limit.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BookingsService } from "./bookings.service";
import { FavoritesService } from "./favorites.service";
import { NoShowsService } from "./no-shows.service";
import { PartnerRequestsService } from "./partner-requests.service";
import { SlotHoldsService } from "./slot-holds.service";

@Controller("bookings")
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly noShows: NoShowsService,
  ) {}

  @Post()
  @Roles(Role.MEMBER)
  @RateLimit({ name: "booking-create", limit: 5, windowMs: 10_000 })
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

  /** Staff (or a co-player, after the slot started) mark a player who did not show up. */
  @Post(":id/no-shows")
  @Roles(Role.MEMBER, Role.ADMIN)
  markNoShow(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(noShowSchema)) body: NoShowInput,
  ): Promise<NoShowItem> {
    return this.noShows.mark(user, id, body);
  }

  /** Staff cancel any booking (the players are told). */
  @Post(":id/staff-cancel")
  @HttpCode(200)
  @Roles(Role.ADMIN)
  @RequirePermissions("BOOKINGS_MANAGE")
  staffCancel(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<BookingDetail> {
    return this.bookings.cancel(id, BookingCancelReason.CANCELLED_BY_ADMIN, user.id);
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

@Controller("admin/members")
@Roles(Role.ADMIN)
export class MemberNoShowsController {
  constructor(private readonly noShows: NoShowsService) {}

  @Get(":id/no-shows")
  @RequirePermissions("BOOKINGS_MANAGE")
  history(@Param("id") id: string): Promise<MemberNoShows> {
    return this.noShows.history(id);
  }
}

/** Keeping a free court while booking it, and the line of members waiting for it. */
@Controller("slot-holds")
@Roles(Role.MEMBER)
export class SlotHoldsController {
  constructor(private readonly holds: SlotHoldsService) {}

  /** Tap on a free court: keep it (HOLDING) or join the line behind whoever is booking it. */
  @Post()
  @SkipAudit()
  @RateLimit({ name: "slot-hold", limit: 10, windowMs: 10_000 })
  claim(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(slotHoldSchema)) body: SlotHoldInput,
  ): Promise<SlotHoldView> {
    return this.holds.claim(user.id, body);
  }

  /** The member's hold or place in line (waiting screens call it to stay in line). */
  @Get("mine")
  mine(@CurrentUser() user: RequestUser): Promise<SlotHoldView | null> {
    return this.holds.mine(user.id);
  }

  @Delete()
  @HttpCode(204)
  @SkipAudit()
  release(@CurrentUser() user: RequestUser): Promise<void> {
    return this.holds.release(user.id);
  }
}

/** "Looking for a partner" requests: members with nobody to play with at a date + slot. */
@Controller("partner-requests")
@Roles(Role.MEMBER)
export class PartnerRequestsController {
  constructor(private readonly requests: PartnerRequestsService) {}

  @Get()
  list(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(partnerRequestsQuerySchema)) query: PartnerRequestsQuery,
  ): Promise<PartnerRequestItem[]> {
    return this.requests.list(user.id, query.date);
  }

  @Post()
  @RateLimit({ name: "partner-request", limit: 5, windowMs: 60_000 })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createPartnerRequestSchema)) body: CreatePartnerRequestInput,
  ): Promise<PartnerRequestItem> {
    return this.requests.create(user.id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  cancel(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.requests.cancel(user.id, id);
  }
}
