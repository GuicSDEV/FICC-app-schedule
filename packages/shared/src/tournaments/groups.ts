import type { SetScore } from "../score";

/** Number of groups needed for `entries` with at most `groupSize` each. */
export function groupCount(entries: number, groupSize: number): number {
  return Math.max(1, Math.ceil(entries / Math.max(2, groupSize)));
}

/**
 * Snake distribution of entries sorted by seed: row 1 left to right, row 2 right to left…, so
 * every group gets a similar mix of strong and weaker entries.
 */
export function snakeGroups<T>(seeded: readonly T[], groups: number): T[][] {
  const result: T[][] = Array.from({ length: groups }, () => []);
  seeded.forEach((entry, index) => {
    const row = Math.floor(index / groups);
    const column = index % groups;
    result[row % 2 === 0 ? column : groups - 1 - column]!.push(entry);
  });
  return result;
}

/** Round-robin fixtures (circle method): every entry meets every other once, grouped by round. */
export function roundRobin<T>(entries: readonly T[]): [T, T][][] {
  const list: (T | null)[] = [...entries];
  if (list.length % 2 === 1) list.push(null);
  const rounds: [T, T][][] = [];
  const count = list.length;
  for (let round = 0; round < count - 1; round += 1) {
    const pairs: [T, T][] = [];
    for (let index = 0; index < count / 2; index += 1) {
      const home = list[index];
      const away = list[count - 1 - index];
      if (home != null && away != null) pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairs);
    // Keep the first entry fixed and rotate the rest.
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/** A decided group match, sets from entry `a`'s point of view. */
export interface GroupResult {
  a: string;
  b: string;
  winner: string;
  sets: SetScore[];
  /** Walkovers count as a 2-0 (6-0, 6-0) win for the standings. */
  walkover?: boolean;
}

export interface StandingRow {
  entryId: string;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
  /** 1-based position after the tiebreakers. */
  position: number;
}

const ratio = (won: number, lost: number) => (won + lost === 0 ? 0 : won / (won + lost));

/**
 * Group table. Order: wins → head-to-head (among the tied entries) → sets ratio → games ratio →
 * the order entries were given in (their seed).
 */
export function groupStandings(
  entryIds: readonly string[],
  results: readonly GroupResult[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    entryIds.map((entryId) => [
      entryId,
      {
        entryId,
        played: 0,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        position: 0,
      },
    ]),
  );
  for (const result of results) {
    const a = rows.get(result.a);
    const b = rows.get(result.b);
    if (!a || !b) continue;
    const sets = result.walkover
      ? result.winner === result.a
        ? [
            { a: 6, b: 0, tiebreak: false },
            { a: 6, b: 0, tiebreak: false },
          ]
        : [
            { a: 0, b: 6, tiebreak: false },
            { a: 0, b: 6, tiebreak: false },
          ]
      : result.sets;
    a.played += 1;
    b.played += 1;
    if (result.winner === result.a) {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
    for (const set of sets) {
      // A match tie-break counts as one set and as one game for its winner.
      const gamesA = set.tiebreak ? (set.a > set.b ? 1 : 0) : set.a;
      const gamesB = set.tiebreak ? (set.b > set.a ? 1 : 0) : set.b;
      if (set.a > set.b) {
        a.setsWon += 1;
        b.setsLost += 1;
      } else if (set.b > set.a) {
        b.setsWon += 1;
        a.setsLost += 1;
      }
      a.gamesWon += gamesA;
      a.gamesLost += gamesB;
      b.gamesWon += gamesB;
      b.gamesLost += gamesA;
    }
  }

  const seedOrder = new Map(entryIds.map((id, index) => [id, index]));
  const byWins = [...rows.values()].sort(
    (x, y) => y.wins - x.wins || seedOrder.get(x.entryId)! - seedOrder.get(y.entryId)!,
  );
  const ordered: StandingRow[] = [];
  for (let index = 0; index < byWins.length;) {
    const tied = byWins.filter((row) => row.wins === byWins[index]!.wins);
    index += tied.length;
    if (tied.length === 1) {
      ordered.push(tied[0]!);
      continue;
    }
    const ids = new Set(tied.map((row) => row.entryId));
    const h2h = new Map(tied.map((row) => [row.entryId, 0]));
    for (const result of results) {
      if (ids.has(result.a) && ids.has(result.b))
        h2h.set(result.winner, (h2h.get(result.winner) ?? 0) + 1);
    }
    tied.sort(
      (x, y) =>
        h2h.get(y.entryId)! - h2h.get(x.entryId)! ||
        ratio(y.setsWon, y.setsLost) - ratio(x.setsWon, x.setsLost) ||
        ratio(y.gamesWon, y.gamesLost) - ratio(x.gamesWon, x.gamesLost) ||
        seedOrder.get(x.entryId)! - seedOrder.get(y.entryId)!,
    );
    ordered.push(...tied);
  }
  return ordered.map((row, index) => ({ ...row, position: index + 1 }));
}

/**
 * Knockout seeds from group tables (each ordered best first): all group winners in group order,
 * then all runners-up in group order, and so on. With the standard seed positions this pairs
 * A1 v B2 and B1 v A2 (2 groups) or A1 v D2, D1 v A2, B1 v C2, C1 v B2 (4 groups), so entries of
 * the same group never meet in the first knockout round.
 */
export function knockoutSeedsFromGroups<T>(
  tables: readonly (readonly T[])[],
  advancePerGroup: number,
): T[] {
  const seeds: T[] = [];
  for (let place = 0; place < advancePerGroup; place += 1) {
    for (const table of tables) {
      const entry = table[place];
      if (entry !== undefined) seeds.push(entry);
    }
  }
  return seeds;
}
