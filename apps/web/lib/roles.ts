import type { Role } from "@ficc/shared";

/** Each role lands in its own area after login. */
export const AREA_BY_ROLE: Record<Role, string> = {
  MEMBER: "/app",
  COACH: "/coach",
  ADMIN: "/admin",
  GATE: "/gate",
};

/** Roles allowed in each area (admins can also run the gate). */
export const AREA_ROLES: Record<string, readonly Role[]> = {
  "/app": ["MEMBER"],
  "/coach": ["COACH"],
  "/admin": ["ADMIN"],
  "/gate": ["GATE", "ADMIN"],
};

export function isRole(value: string | undefined): value is Role {
  return value === "MEMBER" || value === "COACH" || value === "ADMIN" || value === "GATE";
}
