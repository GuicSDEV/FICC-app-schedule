/**
 * Knockout draws: bracket sizes, standard seed positions (top seeds as far apart as possible)
 * and byes for draws that are not a power of two.
 */

/** Smallest power of two that fits `entries` (at least 2). */
export function bracketSize(entries: number): number {
  let size = 2;
  while (size < entries) size *= 2;
  return size;
}

/**
 * Seed number at each bracket position, e.g. 8 → [1, 8, 4, 5, 2, 7, 3, 6]: first-round pairs are
 * (1 v 8), (4 v 5), (2 v 7), (3 v 6), so seeds 1 and 2 can only meet in the final.
 */
export function seedPositions(size: number): number[] {
  if (size < 2 || (size & (size - 1)) !== 0)
    throw new Error(`Bracket size must be a power of 2: ${size}`);
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

export interface FirstRoundPair<T> {
  a: T | null;
  b: T | null;
}

/**
 * First-round pairs for entries already sorted by seed (best first). Missing seeds are byes, which
 * therefore go to the top seeds.
 */
export function knockoutFirstRound<T>(seeded: readonly T[]): FirstRoundPair<T>[] {
  const size = bracketSize(seeded.length);
  const positions = seedPositions(size).map((seed) => seeded[seed - 1] ?? null);
  const pairs: FirstRoundPair<T>[] = [];
  for (let index = 0; index < size; index += 2) {
    pairs.push({ a: positions[index] ?? null, b: positions[index + 1] ?? null });
  }
  return pairs;
}

/** Number of rounds in a knockout of this size (8 → 3). */
export function roundCount(size: number): number {
  return Math.round(Math.log2(size));
}

/** Names of knockout rounds by how many entries play them (labels in labels.round). */
export const ROUND_NAMES = [
  "FINAL",
  "SEMIFINAL",
  "QUARTERFINAL",
  "ROUND_OF_16",
  "ROUND_OF_32",
  "ROUND_OF_64",
] as const;
export type RoundName = (typeof ROUND_NAMES)[number] | "ROUND";

/** Name of `round` (1 = first) in a knockout with `rounds` rounds. */
export function roundName(round: number, rounds: number): RoundName {
  return ROUND_NAMES[rounds - round] ?? "ROUND";
}
