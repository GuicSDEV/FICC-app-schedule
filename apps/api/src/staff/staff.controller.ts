import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Role } from "@ficc/db";
import {
  type AuditLogItem,
  type AuditQuery,
  auditQuerySchema,
  type ClubInfo,
  type CreateStaffInput,
  createStaffSchema,
  type StaffMemberItem,
  type StaffRoleInput,
  type StaffRoleItem,
  staffRoleSchema,
  type StaffRolesInput,
  staffRolesSchema,
  type UpdateClubSettingsInput,
  updateClubSettingsSchema,
} from "@ficc/shared";
import { z } from "zod";

import {
  CurrentUser,
  type RequestUser,
  RequirePermissions,
  Roles,
} from "../common/auth.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "./settings.service";
import { StaffService } from "./staff.service";

const activeSchema = z.object({ isActive: z.boolean() });

@Controller("admin/staff")
@Roles(Role.ADMIN)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get("roles")
  @RequirePermissions("STAFF_MANAGE")
  roles(): Promise<StaffRoleItem[]> {
    return this.staff.roles();
  }

  @Post("roles")
  @RequirePermissions("PLATFORM_MANAGE")
  createRole(
    @Body(new ZodValidationPipe(staffRoleSchema)) body: StaffRoleInput,
  ): Promise<StaffRoleItem> {
    return this.staff.createRole(body);
  }

  @Put("roles/:id")
  @RequirePermissions("PLATFORM_MANAGE")
  updateRole(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(staffRoleSchema)) body: StaffRoleInput,
  ): Promise<StaffRoleItem> {
    return this.staff.updateRole(id, body);
  }

  @Delete("roles/:id")
  @HttpCode(204)
  @RequirePermissions("PLATFORM_MANAGE")
  deleteRole(@Param("id") id: string): Promise<void> {
    return this.staff.deleteRole(id);
  }

  @Get()
  @RequirePermissions("STAFF_MANAGE")
  list(): Promise<StaffMemberItem[]> {
    return this.staff.staff();
  }

  @Post()
  @RequirePermissions("STAFF_MANAGE")
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createStaffSchema)) body: CreateStaffInput,
  ): Promise<StaffMemberItem> {
    return this.staff.createStaff(user, body);
  }

  @Put(":id/roles")
  @RequirePermissions("STAFF_MANAGE")
  setRoles(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(staffRolesSchema)) body: StaffRolesInput,
  ): Promise<StaffMemberItem> {
    return this.staff.setRoles(user, id, body.roleIds);
  }

  @Patch(":id/active")
  @RequirePermissions("STAFF_MANAGE")
  setActive(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(activeSchema)) body: z.infer<typeof activeSchema>,
  ): Promise<StaffMemberItem> {
    return this.staff.setActive(user, id, body.isActive);
  }
}

@Controller("admin/audit")
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions("STAFF_MANAGE")
  list(@Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQuery): Promise<AuditLogItem[]> {
    return this.staff.audit(query);
  }
}

/** Club rules (ClubSettings): every rule of Phase 9.8 is edited here, never in code. */
@Controller("admin/settings")
@Roles(Role.ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Patch()
  @RequirePermissions("SETTINGS_MANAGE")
  update(
    @Body(new ZodValidationPipe(updateClubSettingsSchema)) body: UpdateClubSettingsInput,
  ): Promise<ClubInfo> {
    return this.settings.update(body);
  }
}
