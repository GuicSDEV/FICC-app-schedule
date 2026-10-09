import { type Permission, PERMISSIONS } from "./enums";

/** A role the club starts with; staff can edit what each one may do. */
export interface DefaultStaffRole {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

/** FICC's roles (docs/PHASES.md, Phase 9.8). */
export const DEFAULT_STAFF_ROLES: readonly DefaultStaffRole[] = [
  {
    key: "SECRETARIA",
    name: "Secretaria",
    description: "Reservas, quadras e chuva, mural, aprovação de sócios e convidados",
    permissions: [
      "BOOKINGS_MANAGE",
      "COURTS_MANAGE",
      "NEWS_MANAGE",
      "MEMBERS_APPROVE",
      "GUESTS_MANAGE",
    ],
  },
  {
    key: "DIRETORIA",
    name: "Diretoria",
    description: "Tudo, menos as configurações da plataforma",
    permissions: PERMISSIONS.filter((permission) => permission !== "PLATFORM_MANAGE"),
  },
  {
    key: "PROFESSOR",
    name: "Professor",
    description: "As próprias aulas (no portal do professor); pode organizar torneios",
    permissions: [],
  },
  {
    key: "SUPER_ADMIN",
    name: "Super admin",
    description: "Acesso completo, inclusive à plataforma",
    permissions: PERMISSIONS,
  },
];

/** Union of the permissions of several roles. */
export function permissionsOf(roles: readonly { permissions: readonly string[] }[]): Permission[] {
  const granted = new Set(roles.flatMap((role) => role.permissions));
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

export function hasPermission(
  user: { permissions: readonly Permission[] } | null | undefined,
  permission: Permission,
): boolean {
  return user?.permissions.includes(permission) ?? false;
}
