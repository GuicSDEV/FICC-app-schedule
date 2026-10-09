import { Prisma } from "@ficc/db";

import type { TenantPrismaClient } from "../prisma/prisma.service";

/** The club-scoped client inside an interactive transaction. */
export type Tx = Omit<
  TenantPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * Runs `work` in a SERIALIZABLE transaction and retries on serialization conflicts and deadlocks,
 * so rules checked by reading (player busy, booking limit) hold under concurrent requests.
 */
export async function serializable<T>(
  prisma: TenantPrismaClient,
  work: (tx: Tx) => Promise<T>,
  attempts = 8,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Opening-time rushes queue many transactions for the pool: wait instead of failing.
        maxWait: 10_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (!isRetryableConflict(error) || attempt >= attempts) throw error;
      // Jittered backoff so the retries of a rush do not collide again.
      await new Promise((resolve) =>
        setTimeout(resolve, 15 * attempt + Math.random() * 40 * attempt),
      );
    }
  }
}

/**
 * P2034 is Prisma's write conflict; a Postgres deadlock (40P01) or serialization failure (40001)
 * raised mid-statement can also arrive as an unknown request error carrying only the SQLSTATE.
 */
function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    return /\b(40P01|40001)\b/.test(error.message);
  }
  return false;
}

/** True for a unique-constraint violation, optionally on a given set of columns. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
