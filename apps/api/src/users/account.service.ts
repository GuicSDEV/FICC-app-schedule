import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import {
  BookingCancelReason,
  BookingStatus,
  GuestPassStatus,
  PartnerRequestStatus,
  Role,
} from "@ficc/db";
import { clubToday, toDbDate, translate } from "@ficc/shared";
import { hash, verify } from "argon2";

import { BookingsService } from "../bookings/bookings.service";
import { Clock } from "../common/clock";
import { forbidden, unauthorized } from "../common/domain.exception";
import { PrismaService } from "../prisma/prisma.service";
import { clubTimeZone, tenant } from "../tenancy/tenant-context";

/**
 * A member deletes their own account (App Store / Google Play rule, LGPD). Their upcoming
 * bookings are cancelled (the other players are told, the slots open again), their personal
 * data and logins are removed, and the matrícula is free to register again. Past matches and
 * results stay, under a neutral name, so other members' history and ratings still add up.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly clock: Clock,
  ) {}

  async delete(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== Role.MEMBER) {
      throw forbidden("ACCOUNT_DELETION_MEMBERS_ONLY", "api.accountDeletionMembersOnly");
    }
    if (!(await verify(user.passwordHash, password))) {
      throw unauthorized("WRONG_PASSWORD", "api.wrongPassword");
    }
    const now = this.clock.now();
    const today = toDbDate(clubToday(now, clubTimeZone()));

    // Upcoming bookings with this member end now, through the normal cancellation.
    const upcoming = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        date: { gte: today },
        players: { some: { userId } },
      },
      select: { id: true },
    });
    for (const booking of upcoming) {
      await this.bookings.cancel(booking.id, BookingCancelReason.CANCELLED_BY_PLAYER, userId);
    }

    await this.prisma.$transaction([
      this.prisma.guestPass.updateMany({
        where: { hostId: userId, status: GuestPassStatus.ACTIVE },
        data: { status: GuestPassStatus.CANCELLED, cancelledAt: now },
      }),
      this.prisma.partnerRequest.updateMany({
        where: { userId, status: PartnerRequestStatus.OPEN },
        data: { status: PartnerRequestStatus.CANCELLED, closedAt: now },
      }),
      this.prisma.courtQueueEntry.deleteMany({ where: { userId } }),
      this.prisma.slotHold.deleteMany({ where: { userId } }),
      this.prisma.slotFavorite.deleteMany({ where: { userId } }),
      this.prisma.friendRanking.deleteMany({ where: { ownerId: userId } }),
      this.prisma.friendRankingMember.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.pushSubscription.deleteMany({ where: { userId } }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.newsReaction.deleteMany({ where: { userId } }),
      this.prisma.newsRead.deleteMany({ where: { userId } }),
      this.prisma.userCategory.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          name: translate("labels.deletedMember", {}, tenant().locale),
          membershipId: null,
          email: null,
          photoUrl: null,
          // No password can match: the account can never log in again.
          passwordHash: await hash(randomBytes(32).toString("base64url")),
          isActive: false,
          deletedAt: now,
          guestPassesSuspendedReason: null,
          rejectionReason: null,
        },
      }),
    ]);
  }
}
