import { Prisma } from "@ficc/db";

import type { Tx } from "../common/transactions";

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
