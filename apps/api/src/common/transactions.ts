import { Prisma } from "@ficc/db";

import type { TenantPrismaClient } from "../prisma/prisma.service";

/** The club-scoped client inside an interactive transaction. */
export type Tx = Omit<
  TenantPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * Runs `work` in a SERIALIZABLE transaction and retries on serialization conflicts (P2034), so
 * rules checked by reading (player busy, booking limit) hold under concurrent requests.
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
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt >= attempts) throw error;
      // Jittered backoff so the retries of a rush do not collide again.
      await new Promise((resolve) =>
        setTimeout(resolve, 15 * attempt + Math.random() * 40 * attempt),
      );
    }
  }
}

/** True for a unique-constraint violation, optionally on a given set of columns. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
