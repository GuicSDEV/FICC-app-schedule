import { Injectable } from "@nestjs/common";
import type { SlotHold } from "@ficc/db";
import {
  fromDbDate,
  type IsoDate,
  type SlotAlternative,
  SOCKET_EVENTS,
  type SlotHoldsChangedEvent,
  type SlotHoldUpdatedEvent,
  type SlotHoldView,
  toDbDate,
} from "@ficc/shared";

import { Clock } from "../common/clock";
import { conflict } from "../common/domain.exception";
import { serializable, type Tx } from "../common/transactions";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { clubSettings } from "../tenancy/tenant-context";

/** A waiting member whose screen stopped checking in for this long loses their place. */
export const WAITER_STALE_MS = 45_000;

export interface SlotKey {
  courtId: string;
  date: IsoDate;
  timeSlotId: string;
}

type Db = Tx | PrismaService;

const whereSlot = (slot: SlotKey) => ({
  courtId: slot.courtId,
  date: toDbDate(slot.date),
  timeSlotId: slot.timeSlotId,
});

export const slotKeyOf = (row: Pick<SlotHold, "courtId" | "date" | "timeSlotId">): SlotKey => ({
  courtId: row.courtId,
  date: fromDbDate(row.date),
  timeSlotId: row.timeSlotId,
});

/** What a settle changed, so events go out after the transaction commits. */
export interface SettleResult {
  slot: SlotKey;
  holder: SlotHold | null;
  waiters: SlotHold[];
  /** The holder changed (expired, left, or a waiter took over). */
  changed: boolean;
  promoted: SlotHold | null;
}

/**
 * Rows of SlotHold: who keeps a free court while booking it and who waits in line for it. Holds
 * never claim the slot (SlotOccupancy does, with the booking); they only decide who may book first.
 * Every rule runs on the club clock, never the database clock.
 */
@Injectable()
export class SlotHoldStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly realtime: RealtimeService,
  ) {}

  holdMs(): number {
    return clubSettings().slotHoldSeconds * 1000;
  }

  /**
   * Brings one slot up to date: drops an expired holder and waiters who went silent, and hands the
   * court to the first in line when nobody holds it.
   */
  async settle(db: Db, slot: SlotKey, now: Date): Promise<SettleResult> {
    const rows = await db.slotHold.findMany({
      where: whereSlot(slot),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    let holder = rows.find((row) => row.expiresAt !== null) ?? null;
    let changed = false;
    const gone: string[] = [];
    if (holder && holder.expiresAt! <= now) {
      gone.push(holder.id);
      holder = null;
      changed = true;
    }
    const staleBefore = now.getTime() - WAITER_STALE_MS;
    const waiters = rows.filter((row) => {
      if (row.expiresAt !== null) return false;
      if (row.lastSeenAt.getTime() < staleBefore) {
        gone.push(row.id);
        return false;
      }
      return true;
    });
    if (gone.length > 0) await db.slotHold.deleteMany({ where: { id: { in: gone } } });
    let promoted: SlotHold | null = null;
    if (!holder && waiters.length > 0) {
      const next = waiters.shift()!;
      promoted = await db.slotHold.update({
        where: { id: next.id },
        data: { expiresAt: new Date(now.getTime() + this.holdMs()), lastSeenAt: now },
      });
      holder = promoted;
      changed = true;
    }
    return { slot, holder, waiters, changed, promoted };
  }

  /** Settles a slot in its own short transaction and announces what changed. */
  async settleAndAnnounce(slot: SlotKey): Promise<SettleResult> {
    const result = await serializable(this.prisma, (tx) => this.settle(tx, slot, this.clock.now()));
    this.announce(result);
    return result;
  }

  /** Booking rule: a court someone else is keeping cannot be booked by anyone else. */
  async assertNotHeldByOther(db: Db, userId: string, slot: SlotKey, now: Date): Promise<void> {
    const holder = await db.slotHold.findFirst({
      where: { ...whereSlot(slot), expiresAt: { gt: now } },
    });
    if (holder && holder.userId !== userId) {
      throw conflict("SLOT_HELD", "api.slotHeld", { holdUntil: holder.expiresAt!.toISOString() });
    }
  }

  /** Courts kept right now on a date (to leave them out of suggestions). */
  async heldCells(date: IsoDate, now: Date): Promise<Set<string>> {
    const rows = await this.prisma.slotHold.findMany({
      where: { date: toDbDate(date), expiresAt: { gt: now } },
      select: { courtId: true, timeSlotId: true },
    });
    return new Set(rows.map((row) => `${row.courtId}:${row.timeSlotId}`));
  }

  /** The court was booked: everyone keeping or waiting for it is told, with other options. */
  async clearBooked(slot: SlotKey, bookedBy: string, alternatives: SlotAlternative[]) {
    const rows = await this.prisma.slotHold.findMany({ where: whereSlot(slot) });
    if (rows.length === 0) return;
    await this.prisma.slotHold.deleteMany({ where: whereSlot(slot) });
    this.realtime.toClub(SOCKET_EVENTS.slotHoldsChanged, {
      ...slot,
      hold: null,
    } satisfies SlotHoldsChangedEvent);
    for (const row of rows) {
      if (row.userId === bookedBy) continue;
      this.realtime.toUser(row.userId, SOCKET_EVENTS.slotHoldUpdated, {
        hold: null,
        reason: "TAKEN",
        alternatives,
      } satisfies SlotHoldUpdatedEvent);
    }
  }

  view(
    row: SlotHold,
    settled: Pick<SettleResult, "holder" | "waiters">,
    now: Date,
    alternatives: SlotAlternative[] = [],
  ): SlotHoldView {
    const slot = slotKeyOf(row);
    const holding = row.expiresAt !== null;
    const position = holding
      ? null
      : settled.waiters.findIndex((waiter) => waiter.id === row.id) + 1 || null;
    return {
      status: holding ? "HOLDING" : "WAITING",
      ...slot,
      expiresAt: holding ? row.expiresAt!.toISOString() : null,
      holderExpiresAt: holding ? null : (settled.holder?.expiresAt?.toISOString() ?? null),
      position,
      alternatives: holding ? [] : alternatives,
      serverNow: now.toISOString(),
    };
  }

  /** Tells every calendar who keeps the court now, and the member whose turn it became. */
  announce(result: SettleResult): void {
    if (!result.changed) return;
    this.realtime.toClub(SOCKET_EVENTS.slotHoldsChanged, {
      ...result.slot,
      hold: result.holder?.expiresAt
        ? { userId: result.holder.userId, until: result.holder.expiresAt.toISOString() }
        : null,
    } satisfies SlotHoldsChangedEvent);
    if (result.promoted) {
      this.realtime.toUser(result.promoted.userId, SOCKET_EVENTS.slotHoldUpdated, {
        hold: this.view(result.promoted, result, this.clock.now()),
        reason: "PROMOTED",
        alternatives: [],
      } satisfies SlotHoldUpdatedEvent);
    }
  }
}
