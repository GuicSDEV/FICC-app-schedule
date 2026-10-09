import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { GateScanMethod, Role } from "@ficc/db";
import {
  type AdminGuestPassesQuery,
  adminGuestPassesQuerySchema,
  type AdminGuestPassItem,
  type CreateGuestPassInput,
  createGuestPassSchema,
  type DocumentGuestStats,
  type GatePassView,
  type GateScanInput,
  type GateScanLogItem,
  type GateScanResponse,
  gateScanSchema,
  type GateSearchQuery,
  gateSearchQuerySchema,
  type GuestBlockInput,
  type GuestBlockItem,
  guestBlockSchema,
  type GuestPassItem,
  type GuestSuspensionInput,
  guestSuspensionSchema,
  type HostGuestStats,
} from "@ficc/shared";
import { z } from "zod";

import { CurrentUser, type RequestUser, Roles } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GuestsService } from "./guests.service";

@Controller("guest-passes")
@Roles(Role.MEMBER)
export class GuestPassesController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  mine(@CurrentUser() user: RequestUser): Promise<GuestPassItem[]> {
    return this.guests.mine(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createGuestPassSchema)) body: CreateGuestPassInput,
  ): Promise<GuestPassItem> {
    return this.guests.create(user.id, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<GuestPassItem> {
    return this.guests.cancel(user.id, id);
  }
}

/** Gate staff (and admins): the only place full document numbers are shown. */
@Controller("gate")
@Roles(Role.GATE, Role.ADMIN)
export class GateController {
  constructor(private readonly guests: GuestsService) {}

  @Post("scan")
  @HttpCode(200)
  scan(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(gateScanSchema)) body: GateScanInput,
  ): Promise<GateScanResponse> {
    return this.guests.scan(user, body.token);
  }

  @Get("passes")
  search(
    @Query(new ZodValidationPipe(gateSearchQuerySchema)) query: GateSearchQuery,
  ): Promise<GatePassView[]> {
    return this.guests.searchToday(query.document);
  }

  @Post("passes/:id/check-in")
  @HttpCode(200)
  checkIn(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<GateScanResponse> {
    return this.guests.checkIn(user, id, GateScanMethod.MANUAL);
  }

  @Get("scans")
  scans(): Promise<GateScanLogItem[]> {
    return this.guests.recentScans();
  }
}

const reasonSchema = z.object({ reason: z.string().trim().max(300).optional() });

@Controller("admin/guests")
@Roles(Role.ADMIN)
export class AdminGuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get("hosts")
  hosts(): Promise<HostGuestStats[]> {
    return this.guests.hostStats();
  }

  @Get("documents")
  documents(): Promise<DocumentGuestStats[]> {
    return this.guests.documentStats();
  }

  @Get("passes")
  passes(
    @Query(new ZodValidationPipe(adminGuestPassesQuerySchema)) query: AdminGuestPassesQuery,
  ): Promise<AdminGuestPassItem[]> {
    return this.guests.adminPasses(query);
  }

  @Get("blocks")
  blocks(): Promise<GuestBlockItem[]> {
    return this.guests.blocks();
  }

  @Post("blocks")
  block(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(guestBlockSchema)) body: GuestBlockInput,
  ): Promise<GuestBlockItem> {
    return this.guests.block(user, body);
  }

  @Post("blocks/from-pass/:passId")
  blockFromPass(
    @CurrentUser() user: RequestUser,
    @Param("passId") passId: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: { reason?: string },
  ): Promise<GuestBlockItem> {
    return this.guests.blockFromPass(user, passId, body.reason);
  }

  @Delete("blocks/:id")
  @HttpCode(204)
  lift(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.guests.liftBlock(user, id);
  }

  @Post("suspensions/:memberId")
  @HttpCode(204)
  suspend(
    @Param("memberId") memberId: string,
    @Body(new ZodValidationPipe(guestSuspensionSchema)) body: GuestSuspensionInput,
  ): Promise<void> {
    return this.guests.setSuspension(memberId, body.reason);
  }

  @Delete("suspensions/:memberId")
  @HttpCode(204)
  unsuspend(@Param("memberId") memberId: string): Promise<void> {
    return this.guests.setSuspension(memberId, null);
  }
}
