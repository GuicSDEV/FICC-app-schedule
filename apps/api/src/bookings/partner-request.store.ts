import { Injectable } from "@nestjs/common";
import { PartnerRequestStatus } from "@ficc/db";
import {
  type IsoDate,
  type PartnerRequestsChangedEvent,
  SOCKET_EVENTS,
  toDbDate,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

/**
 * Closing "looking for a partner" requests. Kept apart from PartnerRequestsService so the booking
 * flow can close them without depending on it.
 */
@Injectable()
export class PartnerRequestStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly realtime: RealtimeService,
  ) {}

  /** A booking at this date + slot answers the open requests of every player in it. */
  async closeMatched(
    playerIds: readonly string[],
    date: IsoDate,
    timeSlotId: string,
    bookingId: string,
  ): Promise<void> {
    const { count } = await this.prisma.partnerRequest.updateMany({
      where: {
        userId: { in: [...playerIds] },
        date: toDbDate(date),
        timeSlotId,
        status: PartnerRequestStatus.OPEN,
      },
      data: { status: PartnerRequestStatus.MATCHED, bookingId, closedAt: this.clock.now() },
    });
    if (count > 0) this.announce(date);
  }

  /** Every member's list for that date refreshes. */
  announce(date: IsoDate): void {
    this.realtime.toClub(SOCKET_EVENTS.partnerRequestsChanged, {
      date,
    } satisfies PartnerRequestsChangedEvent);
  }
}
