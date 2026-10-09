import type { Role } from "@ficc/shared";
import { cookies } from "next/headers";

import { isRole } from "@/lib/roles";

/**
 * The role from the readable `ficc_role` cookie (set by the API at login). Only a rendering hint:
 * the shell paints at once instead of waiting for GET /auth/me; the API still checks everything.
 */
export async function roleHint(): Promise<Role | null> {
  const value = (await cookies()).get("ficc_role")?.value;
  return isRole(value) ? value : null;
}
