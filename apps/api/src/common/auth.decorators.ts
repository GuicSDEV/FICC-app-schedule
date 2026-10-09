import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@ficc/db";
import type { Permission } from "@ficc/shared";

export const IS_PUBLIC_KEY = "isPublic";
export const ROLES_KEY = "roles";
export const PERMISSIONS_KEY = "permissions";
export const SKIP_AUDIT_KEY = "skipAudit";

/** The authenticated caller, attached by JwtAuthGuard. */
export interface RequestUser {
  id: string;
  role: Role;
  name: string;
  /** Set for COACH users. */
  coachId: string | null;
  /** Union of the person's staff roles (empty for members). */
  permissions: Permission[];
}

/** True when the caller holds `permission` through one of their staff roles. */
export function can(user: Pick<RequestUser, "permissions"> | undefined, permission: Permission) {
  return user?.permissions.includes(permission) ?? false;
}

/** Skips authentication for a route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route (or controller) to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Requires every listed staff permission (checked after @Roles). */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Personal actions (reading a post, marking notifications read) stay out of the staff audit log. */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser =>
    context.switchToHttp().getRequest<{ user: RequestUser }>().user,
);
