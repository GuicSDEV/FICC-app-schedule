import { Injectable } from "@nestjs/common";
import { Prisma, Role } from "@ficc/db";
import {
  type AuditLogItem,
  type AuditQuery,
  type CreateStaffInput,
  type Permission,
  permissionsOf,
  type StaffMemberItem,
  type StaffRoleInput,
  type StaffRoleItem,
} from "@ficc/shared";
import { hash } from "argon2";

import type { RequestUser } from "../common/auth.decorators";
import { conflict, forbidden, notFound, unprocessable } from "../common/domain.exception";
import { serializable, type Tx } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";

const STAFF_ROLES: Role[] = [Role.ADMIN, Role.COACH, Role.GATE];

const staffInclude = {
  staffRoles: { include: { role: { select: { id: true, name: true, permissions: true } } } },
} satisfies Prisma.UserInclude;

type StaffRow = Prisma.UserGetPayload<{ include: typeof staffInclude }>;

function toStaffMember(user: StaffRow): StaffMemberItem {
  const roles = user.staffRoles.map((entry) => entry.role);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roles: roles
      .map((role) => ({ id: role.id, name: role.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    permissions: permissionsOf(roles),
    isActive: user.isActive,
  };
}

/** Staff roles (editable permission sets), staff accounts and the audit log. */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async roles(): Promise<StaffRoleItem[]> {
    const rows = await this.prisma.staffRole.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      permissions: permissionsOf([row]),
      memberCount: row._count.members,
    }));
  }

  async createRole(input: StaffRoleInput): Promise<StaffRoleItem> {
    const row = await this.prisma.staffRole
      .create({
        data: { name: input.name, description: input.description, permissions: input.permissions },
      })
      .catch(this.nameTaken);
    return { ...this.toRole(row), memberCount: 0 };
  }

  async updateRole(id: string, input: StaffRoleInput): Promise<StaffRoleItem> {
    return serializable(this.prisma, async (tx) => {
      const role = await tx.staffRole.findUnique({ where: { id } });
      if (!role) throw notFound("ROLE_NOT_FOUND", "api.roleNotFound");
      const row = await tx.staffRole
        .update({
          where: { id },
          data: {
            name: input.name,
            description: input.description,
            permissions: input.permissions,
          },
          include: { _count: { select: { members: true } } },
        })
        .catch(this.nameTaken);
      await this.assertPlatformAdminLeft(tx);
      return { ...this.toRole(row), memberCount: row._count.members };
    });
  }

  async deleteRole(id: string): Promise<void> {
    await serializable(this.prisma, async (tx) => {
      const role = await tx.staffRole.findUnique({ where: { id } });
      if (!role) throw notFound("ROLE_NOT_FOUND", "api.roleNotFound");
      await tx.staffRole.delete({ where: { id } });
      await this.assertPlatformAdminLeft(tx);
    });
  }

  async staff(): Promise<StaffMemberItem[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      include: staffInclude,
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return rows.map(toStaffMember);
  }

  async createStaff(actor: RequestUser, input: CreateStaffInput): Promise<StaffMemberItem> {
    await this.assertCanGrant(actor, input.roleIds);
    const user = await this.prisma.user
      .create({
        data: {
          role: Role.ADMIN,
          email: input.email,
          name: input.name,
          passwordHash: await hash(input.password),
          staffRoles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
        include: staffInclude,
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw conflict("EMAIL_TAKEN", "api.emailTaken");
        }
        throw error;
      });
    return toStaffMember(user);
  }

  async setRoles(actor: RequestUser, userId: string, roleIds: string[]): Promise<StaffMemberItem> {
    await this.assertCanGrant(actor, roleIds);
    return serializable(this.prisma, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, role: { in: STAFF_ROLES } } });
      if (!user) throw notFound("STAFF_NOT_FOUND", "api.staffNotFound");
      // Taking a role away needs the same right as granting it.
      const current = await tx.userStaffRole.findMany({
        where: { userId },
        select: { roleId: true },
      });
      const removed = current.map((entry) => entry.roleId).filter((id) => !roleIds.includes(id));
      await this.assertCanGrant(actor, removed, tx);
      await tx.userStaffRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userStaffRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
      }
      await this.assertPlatformAdminLeft(tx);
      return toStaffMember(
        await tx.user.findUniqueOrThrow({ where: { id: userId }, include: staffInclude }),
      );
    });
  }

  async setActive(actor: RequestUser, userId: string, active: boolean): Promise<StaffMemberItem> {
    if (actor.id === userId && !active) throw unprocessable("STAFF_SELF", "api.forbidden");
    return serializable(this.prisma, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, role: { in: STAFF_ROLES } } });
      if (!user) throw notFound("STAFF_NOT_FOUND", "api.staffNotFound");
      const updated = await tx.user.update({
        where: { id: userId },
        data: { isActive: active },
        include: staffInclude,
      });
      if (!active)
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.assertPlatformAdminLeft(tx);
      return toStaffMember(updated);
    });
  }

  async audit(query: AuditQuery): Promise<AuditLogItem[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      actor: row.actor,
      action: row.action,
      entityId: row.entityId,
      details: row.details,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Nobody grants (or removes) a permission they do not hold themselves. */
  private async assertCanGrant(
    actor: RequestUser,
    roleIds: string[],
    db: Tx | PrismaService = this.prisma,
  ) {
    if (roleIds.length === 0) return;
    const roles = await db.staffRole.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== new Set(roleIds).size)
      throw notFound("ROLE_NOT_FOUND", "api.roleNotFound");
    const granted = permissionsOf(roles);
    if (granted.some((permission: Permission) => !actor.permissions.includes(permission))) {
      throw forbidden("FORBIDDEN", "api.forbidden");
    }
  }

  /** The club always keeps an active person who can manage the platform. */
  private async assertPlatformAdminLeft(tx: Tx): Promise<void> {
    const left = await tx.user.count({
      where: {
        isActive: true,
        role: Role.ADMIN,
        staffRoles: { some: { role: { permissions: { has: "PLATFORM_MANAGE" } } } },
      },
    });
    if (left === 0) throw conflict("LAST_SUPER_ADMIN", "api.lastSuperAdmin");
  }

  private toRole(row: {
    id: string;
    key: string | null;
    name: string;
    description: string;
    permissions: string[];
  }) {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      permissions: permissionsOf([row]),
    };
  }

  private readonly nameTaken = (error: unknown): never => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict("ROLE_NAME_TAKEN", "api.conflict");
    }
    throw error;
  };
}
