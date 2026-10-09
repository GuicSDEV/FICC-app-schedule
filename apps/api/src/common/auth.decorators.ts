import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@ficc/db";

export const IS_PUBLIC_KEY = "isPublic";
export const ROLES_KEY = "roles";

/** The authenticated caller, attached by JwtAuthGuard. */
export interface RequestUser {
  id: string;
  role: Role;
  name: string;
  /** Set for COACH users. */
  coachId: string | null;
}

/** Skips authentication for a route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route (or controller) to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser =>
    context.switchToHttp().getRequest<{ user: RequestUser }>().user,
);
