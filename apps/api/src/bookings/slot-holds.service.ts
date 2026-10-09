import { Injectable } from "@nestjs/common";
import type { SlotHold } from "@ficc/db";
import { type SlotHoldInput, type SlotHoldView, toDbDate } from "@ficc/shared";

import { Clock } from "../common/clock";
import { isUniqueViolation, serializable } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";
import { BookingsService } from "./bookings.service";
import { type SettleResult, type SlotKey, slotKeyOf, SlotHoldStore } from "./slot-hold.store";

const sameSlot = (row: Pick<SlotHold, "courtId" | "timeSlotId" | "date">, slot: SlotKey) =>
  row.courtId === slot.courtId &&
  row.timeSlotId === slot.timeSlotId &&
  slotKeyOf(row).date === slot.date;

/**
 * Keeping a court while booking it. Tapping a free court keeps it for that member for the club's
 * slotHoldSeconds; anyone else who taps it waits in line and gets it, in order, when the holder
 * books another court, gives up or runs out of time. One hold or place in line per member.
 */
@Injectable()
export class SlotHoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly bookings: BookingsService,
    private readonly store: SlotHoldStore,
  ) {}

  async claim(userId: string, input: SlotHoldInput): Promise<SlotHoldView> {
    const slot: SlotKey = {
      courtId: input.courtId,
      date: input.date,
      timeSlotId: input.timeSlotId,
    };
    const now = this.clock.now();
    // Same rules as booking (open day, free court, member's own limits) so nobody keeps a court
    // they could not book in the end.
    await this.prisma.$transaction((tx) => this.bookings.assertCanStart(tx, userId, input, now));

    const run = () =>
      serializable(this.prisma, async (tx) => {
        const previous = await tx.slotHold.findFirst({ where: { userId } });
        let left: SettleResult | null = null;
        if (previous && !sameSlot(previous, slot)) {
          // One court at a time: tapping another one gives the previous back.
          await tx.slotHold.delete({ where: { id: previous.id } });
          left = await this.store.settle(tx, slotKeyOf(previous), now);
          if (previous.expiresAt) left.changed = true;
        }
        const settled = await this.store.settle(tx, slot, now);
        let mine =
          settled.holder?.userId === userId
            ? settled.holder
            : (settled.waiters.find((row) => row.userId === userId) ?? null);
        if (mine) {
          mine = await tx.slotHold.update({ where: { id: mine.id }, data: { lastSeenAt: now } });
          if (mine.expiresAt) settled.holder = mine;
          else settled.waiters = settled.waiters.map((row) => (row.id === mine!.id ? mine! : row));
        } else if (settled.holder) {
          mine = await tx.slotHold.create({
            data: { userId, ...this.where(slot), expiresAt: null, lastSeenAt: now, createdAt: now },
          });
          settled.waiters.push(mine);
        } else {
          mine = await tx.slotHold.create({
            data: {
              userId,
              ...this.where(slot),
              expiresAt: new Date(now.getTime() + this.store.holdMs()),
              lastSeenAt: now,
              createdAt: now,
            },
          });
          settled.holder = mine;
          settled.changed = true;
        }
        return { mine, settled, left };
      });

    // Two members tapping the same free court in the same instant: the database lets only one
    // hold it (unique index); the other simply runs again and joins the line.
    const result = await run().catch((error: unknown) => {
      if (isUniqueViolation(error)) return run();
      throw error;
    });
    if (result.left) this.store.announce(result.left);
    this.store.announce(result.settled);
    const alternatives =
      result.mine.expiresAt === null
        ? await this.bookings.alternatives(input.date, input.timeSlotId, input.courtId)
        : [];
    return this.store.view(result.mine, result.settled, now, alternatives);
  }

  /** The member's current hold or place in line; also checks them in while they wait. */
  async mine(userId: string): Promise<SlotHoldView | null> {
    const row = await this.prisma.slotHold.findFirst({ where: { userId } });
    if (!row) return null;
    const now = this.clock.now();
    const slot = slotKeyOf(row);
    const { settled, mine } = await serializable(this.prisma, async (tx) => {
      const settled = await this.store.settle(tx, slot, now);
      const current =
        settled.holder?.userId === userId
          ? settled.holder
          : (settled.waiters.find((entry) => entry.userId === userId) ?? null);
      const mine = current
        ? await tx.slotHold.update({ where: { id: current.id }, data: { lastSeenAt: now } })
        : null;
      return { settled, mine };
    });
    this.store.announce(settled);
    if (!mine) return null;
    const alternatives =
      mine.expiresAt === null
        ? await this.bookings.alternatives(slot.date, slot.timeSlotId, slot.courtId)
        : [];
    return this.store.view(mine, settled, now, alternatives);
  }

  /** Gives the court back (or leaves the line); the next in line gets it at once. */
  async release(userId: string): Promise<void> {
    const row = await this.prisma.slotHold.findFirst({ where: { userId } });
    if (!row) return;
    const now = this.clock.now();
    const slot = slotKeyOf(row);
    const settled = await serializable(this.prisma, async (tx) => {
      await tx.slotHold.deleteMany({ where: { id: row.id } });
      const result = await this.store.settle(tx, slot, now);
      if (row.expiresAt) result.changed = true;
      return result;
    });
    this.store.announce(settled);
  }

  private where(slot: SlotKey) {
    return {
      courtId: slot.courtId,
      timeSlotId: slot.timeSlotId,
      date: toDbDate(slot.date),
    };
  }
}
