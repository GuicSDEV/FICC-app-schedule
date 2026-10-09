import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type ActiveFreeze,
  type CancelAffectedInput,
  cancelAffectedSchema,
  type CreateFreezeInput,
  createFreezeSchema,
  type FreezeDetail,
} from "@ficc/shared";

import { CurrentUser, type RequestUser, Roles } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FreezesService } from "./freezes.service";

/** Everyone signed in sees active freezes (the rain/maintenance banner). */
@Controller("freezes")
export class FreezesController {
  constructor(private readonly freezes: FreezesService) {}

  @Get("active")
  active(): Promise<ActiveFreeze[]> {
    return this.freezes.active();
  }
}

@Controller("admin/freezes")
@Roles(Role.ADMIN)
export class AdminFreezesController {
  constructor(private readonly freezes: FreezesService) {}

  @Get()
  list(): Promise<FreezeDetail[]> {
    return this.freezes.list();
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createFreezeSchema)) body: CreateFreezeInput,
  ): Promise<FreezeDetail> {
    return this.freezes.create(user, body);
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<FreezeDetail> {
    return this.freezes.get(id);
  }

  @Post(":id/cancel-affected")
  @HttpCode(200)
  cancelAffected(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelAffectedSchema)) body: CancelAffectedInput,
  ): Promise<FreezeDetail> {
    return this.freezes.cancelAffected(user, id, body);
  }

  @Post(":id/lift")
  @HttpCode(200)
  lift(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<FreezeDetail> {
    return this.freezes.lift(user, id);
  }
}
