import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type CoachAdminItem,
  type CreateCoachInput,
  createCoachSchema,
  type UpdateCoachInput,
  updateCoachSchema,
} from "@ficc/shared";

import { Roles, RequirePermissions } from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CoachesAdminService } from "./coaches.service";

@Controller("admin/coaches")
@Roles(Role.ADMIN)
@RequirePermissions("LESSONS_MANAGE")
export class CoachesAdminController {
  constructor(private readonly coaches: CoachesAdminService) {}

  @Get()
  list(): Promise<CoachAdminItem[]> {
    return this.coaches.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCoachSchema)) body: CreateCoachInput,
  ): Promise<CoachAdminItem> {
    return this.coaches.create(body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCoachSchema)) body: UpdateCoachInput,
  ): Promise<CoachAdminItem> {
    return this.coaches.update(id, body);
  }
}
