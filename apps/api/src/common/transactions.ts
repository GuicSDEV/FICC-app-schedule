import { Prisma, PrismaClient } from "@ficc/db";

export type Tx = Prisma.TransactionClient;

/**
 * Runs `work` in a SERIALIZABLE transaction and retries on serialization conflicts (P2034), so
 * rules checked by reading (player busy, booking limit) hold under concurrent requests.
 */
export async function serializable<T>(
  prisma: PrismaClient,
  work: (tx: Tx) => Promise<T>,
  attempts = 4,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    }
  }
}

/** True for a unique-constraint violation, optionally on a given set of columns. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
