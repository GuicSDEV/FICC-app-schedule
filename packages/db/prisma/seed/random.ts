/**
 * Small seeded PRNG (mulberry32) so every seed run produces the same members' results,
 * scores and pairings.
 */
export function createRandom(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function int(min: number, max: number): number {
    return min + Math.floor(next() * (max - min + 1));
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("Cannot pick from an empty list");
    return items[int(0, items.length - 1)] as T;
  }

  function weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return entries.at(-1)![0];
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = int(0, index);
      [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
    }
    return copy;
  }

  return {
    next,
    int,
    pick,
    weighted,
    shuffle,
    chance: (probability: number) => next() < probability,
  };
}

export type Random = ReturnType<typeof createRandom>;
