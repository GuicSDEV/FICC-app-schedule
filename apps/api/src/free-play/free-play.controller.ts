import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type CheckInInput,
  checkInSchema,
  type CheckInView,
  type CourtsNow,
  type QueueEntryView,
} from "@ficc/shared";

import { CurrentUser, type RequestUser, Roles } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FreePlayService } from "./free-play.service";

/** Free-play days: "Quadras agora", check-in / check-out and the digital queue. */
@Controller("free-play")
export class FreePlayController {
  constructor(private readonly freePlay: FreePlayService) {}

  @Get("now")
  now(@CurrentUser() user: RequestUser): Promise<CourtsNow> {
    return this.freePlay.courtsNow(user);
  }

  @Post("check-ins")
  @Roles(Role.MEMBER)
  checkIn(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(checkInSchema)) body: CheckInInput,
  ): Promise<CheckInView> {
    return this.freePlay.checkIn(user, body);
  }

  /** Players check out; staff with COURTS_MANAGE can end any check-in. */
  @Post("check-ins/:id/check-out")
  @HttpCode(204)
  @Roles(Role.MEMBER, Role.ADMIN)
  checkOut(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<void> {
    return this.freePlay.checkOut(user, id);
  }

  @Post("queue")
  @Roles(Role.MEMBER)
  join(@CurrentUser() user: RequestUser): Promise<QueueEntryView> {
    return this.freePlay.joinQueue(user);
  }

  @Delete("queue")
  @HttpCode(204)
  @Roles(Role.MEMBER)
  leave(@CurrentUser() user: RequestUser): Promise<void> {
    return this.freePlay.leaveQueue(user);
  }
}
