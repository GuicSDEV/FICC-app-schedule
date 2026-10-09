import { Injectable } from "@nestjs/common";
import { Prisma, Role } from "@ficc/db";
import type { AuthUser, LoginInput, RegisterInput } from "@ficc/shared";
import { hash, verify } from "argon2";

import { conflict, notFound, unauthorized } from "../common/domain.exception";
import { toCoachSummary } from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "./tokens.service";

const authUserInclude = {
  coach: { include: { allowedCourts: { select: { courtId: true } } } },
} satisfies Prisma.UserInclude;

type UserWithCoach = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /** Member sign-up: the matrícula must be listed, active and not registered yet. */
  async register(input: RegisterInput, userAgent?: string): Promise<Session> {
    const membership = await this.prisma.validMembershipId.findUnique({
      where: { membershipId: input.membershipId },
      include: { user: { select: { id: true } } },
    });
    if (!membership || !membership.isActive) {
      throw notFound(
        "MEMBERSHIP_NOT_FOUND",
        "Matrícula não encontrada na lista do clube. Fale com a secretaria.",
      );
    }
    if (membership.user) {
      throw conflict("MEMBERSHIP_TAKEN", "Essa matrícula já tem cadastro. Entre com sua senha.");
    }
    const user = await this.prisma.user
      .create({
        data: {
          role: Role.MEMBER,
          membershipId: input.membershipId,
          name: input.name,
          passwordHash: await hash(input.password),
        },
        include: authUserInclude,
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw conflict(
            "MEMBERSHIP_TAKEN",
            "Essa matrícula já tem cadastro. Entre com sua senha.",
          );
        }
        throw error;
      });
    return this.startSession(user, userAgent);
  }

  async login(input: LoginInput, userAgent?: string): Promise<Session> {
    const user = await this.prisma.user.findUnique({
      where:
        input.kind === "member" ? { membershipId: input.membershipId } : { email: input.email },
      include: authUserInclude,
    });
    const valid = user?.isActive && (await verify(user.passwordHash, input.password));
    if (!user || !valid) {
      throw unauthorized(
        "INVALID_CREDENTIALS",
        input.kind === "member" ? "Matrícula ou senha incorretos." : "E-mail ou senha incorretos.",
      );
    }
    return this.startSession(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<Session> {
    const rotated = await this.tokens.rotateRefresh(refreshToken, userAgent);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: authUserInclude,
    });
    if (!user?.isActive) {
      throw unauthorized("ACCOUNT_DISABLED", "Conta desativada.");
    }
    return {
      user: toAuthUser(user),
      accessToken: this.tokens.signAccess(user),
      refreshToken: rotated.refreshToken,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.tokens.revokeByToken(refreshToken);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: authUserInclude,
    });
    return toAuthUser(user);
  }

  private async startSession(user: UserWithCoach, userAgent?: string): Promise<Session> {
    return {
      user: toAuthUser(user),
      accessToken: this.tokens.signAccess(user),
      refreshToken: await this.tokens.issueRefresh(user.id, userAgent),
    };
  }
}

export function toAuthUser(user: UserWithCoach): AuthUser {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    membershipId: user.membershipId,
    email: user.email,
    photoUrl: user.photoUrl,
    categories: user.categories,
    elo: user.elo,
    guestPassesSuspended: user.guestPassesSuspendedAt !== null,
    coach: user.coach
      ? {
          ...toCoachSummary(user.coach),
          courtIds: user.coach.allowedCourts.map((entry) => entry.courtId),
        }
      : null,
  };
}
