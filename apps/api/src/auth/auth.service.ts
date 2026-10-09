import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, Role, UserStatus } from "@ficc/db";
import {
  type AuthUser,
  holderMembershipId,
  isDependentMembershipId,
  type LoginInput,
  permissionsOf,
  type RegisterInput,
  type SignupStatusResponse,
} from "@ficc/shared";
import { hash, verify } from "argon2";

import {
  conflict,
  DomainException,
  forbidden,
  notFound,
  unauthorized,
  unprocessable,
} from "../common/domain.exception";
import { playerSelect, toCoachSummary, toPlayerSummary } from "../common/mappers";
import { PrismaService } from "../prisma/prisma.service";
import { clubSettings } from "../tenancy/tenant-context";
import { TokensService } from "./tokens.service";

function authUserInclude() {
  return {
    coach: { include: { allowedCourts: { select: { courtId: true } } } },
    ratings: playerSelect().ratings,
    categories: playerSelect().categories,
    staffRoles: { select: { role: { select: { permissions: true } } } },
  } satisfies Prisma.UserInclude;
}

type UserWithCoach = Prisma.UserGetPayload<{ include: ReturnType<typeof authUserInclude> }>;

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

  /**
   * Member sign-up: the matrícula must be listed, active and not registered yet. A dependent
   * ("1234-01", when the club enables dependents) needs a registered holder instead. When the club
   * requires approval the account waits as PENDING and no session is opened.
   */
  async register(
    input: RegisterInput,
    userAgent?: string,
  ): Promise<Session | SignupStatusResponse> {
    const settings = clubSettings();
    const dependent = isDependentMembershipId(input.membershipId);
    if (dependent) {
      if (!settings.dependentsEnabled) {
        throw unprocessable("DEPENDENTS_DISABLED", "api.dependentsDisabled");
      }
      const holderId = holderMembershipId(input.membershipId);
      const holder = await this.prisma.user.findFirst({
        where: { membershipId: holderId, role: Role.MEMBER, status: UserStatus.ACTIVE },
      });
      if (!holder) {
        throw notFound("HOLDER_NOT_REGISTERED", {
          key: "api.holderNotRegistered",
          params: { holder: holderId },
        });
      }
      // Dependents are not on the club's list: their matrícula is derived from the holder's.
      await this.prisma.validMembershipId.upsert({
        where: { clubId_membershipId: { clubId: holder.clubId, membershipId: input.membershipId } },
        create: { membershipId: input.membershipId, holderName: input.name },
        update: {},
      });
    }
    const membership = await this.prisma.validMembershipId.findFirst({
      where: { membershipId: input.membershipId },
      include: { user: { select: { id: true } } },
    });
    if (!membership || !membership.isActive) {
      throw notFound("MEMBERSHIP_NOT_FOUND", "api.membershipNotFound");
    }
    if (membership.user) {
      throw conflict("MEMBERSHIP_TAKEN", "api.membershipTaken");
    }
    const pending = settings.signupRequiresApproval;
    const user = await this.prisma.user
      .create({
        data: {
          role: Role.MEMBER,
          membershipId: input.membershipId,
          name: input.name,
          passwordHash: await hash(input.password),
          status: pending ? UserStatus.PENDING : UserStatus.ACTIVE,
          // Every member starts at the club's initial rating in its primary sport.
          ratings: {
            create: { sport: settings.primarySport, elo: settings.eloInitialRating },
          },
        },
        include: authUserInclude(),
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw conflict("MEMBERSHIP_TAKEN", "api.membershipTaken");
        }
        throw error;
      });
    if (pending) return { status: "PENDING", rejectionReason: null };
    return this.startSession(user, userAgent);
  }

  async login(input: LoginInput, userAgent?: string): Promise<Session> {
    // Logins are unique per club; the tenant extension adds the current club to the filter.
    const user = await this.prisma.user.findFirst({
      where:
        input.kind === "member" ? { membershipId: input.membershipId } : { email: input.email },
      include: authUserInclude(),
    });
    const valid = user?.isActive && (await verify(user.passwordHash, input.password));
    if (!user || !valid) {
      throw unauthorized(
        "INVALID_CREDENTIALS",
        input.kind === "member" ? "api.invalidCredentialsMember" : "api.invalidCredentialsStaff",
      );
    }
    // Only after the password matched, so the status never leaks to someone guessing.
    if (user.status === UserStatus.PENDING) throw forbidden("SIGNUP_PENDING", "api.signupPending");
    if (user.status === UserStatus.REJECTED) {
      throw new DomainException(HttpStatus.FORBIDDEN, "SIGNUP_REJECTED", {
        key: "api.signupRejected",
        params: { reason: user.rejectionReason ?? "" },
      });
    }
    return this.startSession(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<Session> {
    const rotated = await this.tokens.rotateRefresh(refreshToken, userAgent);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: authUserInclude(),
    });
    if (!user?.isActive || user.status !== UserStatus.ACTIVE) {
      throw unauthorized("ACCOUNT_DISABLED", "api.accountDisabled");
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
      include: authUserInclude(),
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
  const player = toPlayerSummary(user);
  return {
    id: user.id,
    clubId: user.clubId,
    role: user.role,
    name: user.name,
    membershipId: user.membershipId,
    email: user.email,
    photoUrl: user.photoUrl,
    categories: player.categories,
    elo: player.elo,
    guestPassesSuspended: user.guestPassesSuspendedAt !== null,
    coach: user.coach
      ? {
          ...toCoachSummary(user.coach),
          courtIds: user.coach.allowedCourts.map((entry) => entry.courtId),
        }
      : null,
    permissions: permissionsOf(user.staffRoles.map((entry) => entry.role)),
    bookingSuspendedUntil: user.bookingSuspendedUntil?.toISOString() ?? null,
  };
}
