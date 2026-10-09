import { Prisma } from "@ficc/db";

import { slotEndsAt, slotStartsAt } from "@ficc/shared";

import type { Tx } from "../common/transactions";
import { clubTimeZone } from "../tenancy/tenant-context";

export const freezeWithCourts = {
  courts: { select: { courtId: true } },
} satisfies Prisma.CourtFreezeInclude;

export type FreezeWithCourts = Prisma.CourtFreezeGetPayload<{ include: typeof freezeWithCourts }>;

/** Freezes not lifted whose window overlaps [from, to). */
export function freezesOverlapping(client: Tx, from: Date, to: Date): Promise<FreezeWithCourts[]> {
  return client.courtFreeze.findMany({
    where: {
      liftedAt: null,
      startsAt: { lt: to },
      OR: [{ endsAt: null }, { endsAt: { gt: from } }],
    },
    include: freezeWithCourts,
    orderBy: { startsAt: "asc" },
  });
}

/** True when an active freeze covers this court during the slot on that date. */
export async function isCourtFrozen(
  client: Tx,
  courtId: string,
  date: string,
  slot: { startTime: string; durationMinutes: number },
): Promise<boolean> {
  const startsAt = slotStartsAt(date, slot, clubTimeZone());
  const endsAt = slotEndsAt(date, slot, clubTimeZone());
  const freezes = await freezesOverlapping(client, startsAt, endsAt);
  return freezes.some((freeze) => freeze.courts.some((entry) => entry.courtId === courtId));
}
