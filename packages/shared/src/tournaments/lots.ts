/**
 * The lot of a draw. Entries come sorted by seed (best first); the lot shuffles them only within
 * pots, so the top of the field keeps its protected places and everyone else is drawn at random.
 * Every draw (and every redraw) is a new lot.
 */
import { bracketSize } from "./bracket";

/** A source of numbers in [0, 1), like Math.random (the API passes a crypto-backed one). */
export type RandomSource = () => number;

/** Seeds shown in a draw: the top quarter of the field, at least 2. */
export function drawSeedCount(entries: number): number {
  return Math.max(2, Math.floor(entries / 4));
}

/**
 * Shuffles `sorted` inside consecutive pots of the given sizes (Fisher–Yates per pot). Entries
 * past the last pot stay where they are; a pot of size 1 never moves.
 */
export function shuffleWithinPots<T>(
  sorted: readonly T[],
  potSizes: readonly number[],
  random: RandomSource,
): T[] {
  const result = [...sorted];
  let start = 0;
  for (const size of potSizes) {
    const end = Math.min(result.length, start + size);
    for (let index = end - 1; index > start; index -= 1) {
      const pick = start + Math.floor(random() * (index - start + 1));
      [result[index], result[pick]] = [result[pick]!, result[index]!];
    }
    start = end;
    if (start >= result.length) break;
  }
  return result;
}

/**
 * Knockout pots, as in tennis: seeds 1 and 2 are fixed, 3–4 are drawn between their places, then
 * 5–8… The protected part of the field is the seeds, or the players who get a bye when there are
 * more byes than seeds (byes always go to the best rated). Everyone else is one pot.
 */
export function knockoutPots(entries: number): number[] {
  const protectedPlaces = Math.min(
    entries,
    Math.max(drawSeedCount(entries), bracketSize(entries) - entries),
  );
  const pots: number[] = [];
  let placed = 0;
  let size = 1;
  while (placed < protectedPlaces) {
    const pot = Math.min(size, protectedPlaces - placed);
    pots.push(pot);
    placed += pot;
    // 1, 1, 2, 4, 8…
    if (pots.length > 1) size *= 2;
  }
  if (entries > placed) pots.push(entries - placed);
  return pots;
}

/**
 * Group pots: the first row of the snake (one head per group) is fixed by seed, each later row is
 * a pot drawn at random, so every group still gets one entry of each strength level.
 */
export function groupPots(entries: number, groups: number): number[] {
  const pots: number[] = Array.from({ length: Math.min(groups, entries) }, () => 1);
  for (let placed = pots.length; placed < entries; placed += groups) {
    pots.push(Math.min(groups, entries - placed));
  }
  return pots;
}
