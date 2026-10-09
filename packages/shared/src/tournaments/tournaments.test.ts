import { describe, expect, it } from "vitest";

import { TennisRules } from "../sports";
import { translateIssue } from "../i18n";
import { bracketSize, knockoutFirstRound, roundCount, roundName, seedPositions } from "./bracket";
import {
  groupCount,
  groupStandings,
  knockoutSeedsFromGroups,
  roundRobin,
  snakeGroups,
} from "./groups";
import { drawSeedCount, groupPots, knockoutPots, shuffleWithinPots } from "./lots";
import { circuitRanking, DEFAULT_POINTS_TABLE, placementOf } from "./points";
import { autoSchedule, fitsRestrictions, NO_RESTRICTIONS, type OpenSlot } from "./schedule";

describe("knockout seeding", () => {
  it("sizes brackets to the next power of two", () => {
    expect([2, 3, 8, 9, 12, 16, 17].map(bracketSize)).toEqual([2, 4, 8, 16, 16, 16, 32]);
    expect(roundCount(16)).toBe(4);
  });

  it("places seeds so the top seeds meet as late as possible", () => {
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const sixteen = seedPositions(16);
    // Seeds 1 and 2 in opposite halves; 1–4 in different quarters.
    expect(sixteen.indexOf(1)).toBeLessThan(8);
    expect(sixteen.indexOf(2)).toBeGreaterThanOrEqual(8);
    const quarter = (seed: number) => Math.floor(sixteen.indexOf(seed) / 4);
    expect(new Set([1, 2, 3, 4].map(quarter)).size).toBe(4);
    expect(() => seedPositions(12)).toThrow();
  });

  it("gives the byes of a 12-entry draw to the top 4 seeds", () => {
    const seeds = Array.from({ length: 12 }, (_, index) => `S${index + 1}`);
    const pairs = knockoutFirstRound(seeds);
    expect(pairs).toHaveLength(8);
    const byes = pairs.filter((pair) => pair.a === null || pair.b === null);
    expect(byes).toHaveLength(4);
    expect(byes.map((pair) => pair.a ?? pair.b).sort()).toEqual(["S1", "S2", "S3", "S4"]);
    expect(pairs[0]).toEqual({ a: "S1", b: null });
    expect(pairs[1]).toEqual({ a: "S8", b: "S9" });
  });

  it("names rounds from the final backwards", () => {
    expect([1, 2, 3, 4].map((round) => roundName(round, 4))).toEqual([
      "ROUND_OF_16",
      "QUARTERFINAL",
      "SEMIFINAL",
      "FINAL",
    ]);
  });
});

describe("draw lots", () => {
  /** Deterministic stand-in for Math.random. */
  const sequence = (...values: number[]) => {
    let index = 0;
    return () => values[index++ % values.length]!;
  };
  const field = (count: number) => Array.from({ length: count }, (_, index) => `S${index + 1}`);

  it("protects the seeds and the byes and draws the rest", () => {
    expect(drawSeedCount(4)).toBe(2);
    expect(drawSeedCount(12)).toBe(3);
    // 12 entries: 4 byes (more than the 3 seeds), so the top 4 are protected.
    expect(knockoutPots(12)).toEqual([1, 1, 2, 8]);
    expect(knockoutPots(16)).toEqual([1, 1, 2, 12]);
    expect(knockoutPots(32)).toEqual([1, 1, 2, 4, 24]);
    expect(knockoutPots(4)).toEqual([1, 1, 2]);
    expect(knockoutPots(3)).toEqual([1, 1, 1]);
    expect(knockoutPots(2)).toEqual([1, 1]);
  });

  it("only moves entries inside their pot", () => {
    const drawn = shuffleWithinPots(field(12), knockoutPots(12), sequence(0));
    expect(drawn.slice(0, 2)).toEqual(["S1", "S2"]);
    expect(drawn.slice(2, 4).sort()).toEqual(["S3", "S4"]);
    expect(drawn.slice(4).sort()).toEqual(field(12).slice(4).sort());
    expect(drawn).not.toEqual(field(12));
    // The byes still go to the 4 best rated, whatever the lot.
    const byes = knockoutFirstRound(drawn).filter((pair) => pair.a === null || pair.b === null);
    expect(byes.map((pair) => pair.a ?? pair.b).sort()).toEqual(["S1", "S2", "S3", "S4"]);
  });

  it("gives a different draw on another lot", () => {
    const pots = knockoutPots(16);
    const draws = new Set(
      [0, 0.25, 0.5, 0.75].map((value) =>
        shuffleWithinPots(field(16), pots, sequence(value, 0.9, 0.1)).join(),
      ),
    );
    expect(draws.size).toBeGreaterThan(1);
    // A source that always picks the last place keeps the seed order.
    expect(shuffleWithinPots(field(16), pots, () => 0.999_999)).toEqual(field(16));
  });

  it("draws group pots row by row so every group keeps one entry per level", () => {
    expect(groupPots(8, 2)).toEqual([1, 1, 2, 2, 2]);
    expect(groupPots(10, 3)).toEqual([1, 1, 1, 3, 3, 1]);
    const drawn = shuffleWithinPots(field(8), groupPots(8, 2), sequence(0));
    const groups = snakeGroups(drawn, 2);
    expect(groups[0]![0]).toBe("S1");
    expect(groups[1]![0]).toBe("S2");
    const level = (entry: string) => Math.floor((Number(entry.slice(1)) - 1) / 2);
    for (const group of groups) expect(group.map(level)).toEqual([0, 1, 2, 3]);
  });
});

describe("groups", () => {
  it("distributes seeds in a snake", () => {
    expect(groupCount(8, 4)).toBe(2);
    expect(groupCount(10, 4)).toBe(3);
    expect(snakeGroups([1, 2, 3, 4, 5, 6, 7, 8], 2)).toEqual([
      [1, 4, 5, 8],
      [2, 3, 6, 7],
    ]);
    expect(snakeGroups([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 6],
      [2, 5],
      [3, 4],
    ]);
  });

  it("builds round-robin fixtures where everybody meets once", () => {
    for (const size of [3, 4, 5, 6]) {
      const entries = Array.from({ length: size }, (_, index) => index);
      const rounds = roundRobin(entries);
      const pairs = rounds.flat().map(([a, b]) => [Math.min(a, b), Math.max(a, b)].join("-"));
      expect(new Set(pairs).size).toBe((size * (size - 1)) / 2);
      expect(pairs).toHaveLength((size * (size - 1)) / 2);
      // Nobody plays twice in one round.
      for (const round of rounds) {
        const seen = round.flat();
        expect(new Set(seen).size).toBe(seen.length);
      }
    }
  });

  const set = (a: number, b: number, tiebreak = false) => ({ a, b, tiebreak });

  it("orders standings by wins, then head-to-head", () => {
    const table = groupStandings(
      ["A", "B", "C"],
      [
        { a: "A", b: "B", winner: "B", sets: [set(4, 6), set(4, 6)] },
        { a: "A", b: "C", winner: "A", sets: [set(6, 0), set(6, 0)] },
        { a: "B", b: "C", winner: "C", sets: [set(6, 7), set(6, 4), set(8, 10, true)] },
      ],
    );
    // Everyone 1-1 and the head-to-head is 1-1 too, so sets decide: B 3-2, A 2-2, C 2-3.
    expect(table.map((row) => row.entryId)).toEqual(["B", "A", "C"]);
    expect(table[0]).toMatchObject({ wins: 1, losses: 1, setsWon: 3, setsLost: 2, position: 1 });

    const twoTied = groupStandings(
      ["A", "B", "C"],
      [
        { a: "A", b: "B", winner: "B", sets: [set(6, 7), set(6, 7)] },
        { a: "A", b: "C", winner: "A", sets: [set(6, 0), set(6, 0)] },
        { a: "B", b: "C", winner: "B", sets: [set(6, 0), set(6, 0)] },
      ],
    );
    expect(twoTied.map((row) => row.entryId)).toEqual(["B", "A", "C"]);
  });

  it("uses games ratio when sets are level, and counts walkovers as 6-0 6-0", () => {
    const table = groupStandings(
      ["A", "B", "C", "D"],
      [
        { a: "A", b: "C", winner: "A", sets: [set(6, 4), set(6, 4)] },
        { a: "B", b: "D", winner: "B", sets: [set(6, 1), set(6, 1)] },
        { a: "A", b: "D", winner: "D", sets: [set(4, 6), set(4, 6)] },
        { a: "B", b: "C", winner: "C", sets: [], walkover: true },
      ],
    );
    const b = table.find((row) => row.entryId === "B")!;
    expect(b).toMatchObject({ setsWon: 2, setsLost: 2, gamesWon: 12, gamesLost: 14 });
  });

  it("seeds the knockout so group mates do not meet in its first round", () => {
    const seeds = knockoutSeedsFromGroups(
      [
        ["A1", "A2", "A3"],
        ["B1", "B2", "B3"],
      ],
      2,
    );
    expect(seeds).toEqual(["A1", "B1", "A2", "B2"]);
    expect(knockoutFirstRound(seeds)).toEqual([
      { a: "A1", b: "B2" },
      { a: "B1", b: "A2" },
    ]);
  });
});

describe("score formats", () => {
  it("validates pro-sets and best of 3 without a match tie-break", () => {
    expect(TennisRules.scoreSchemaFor("PRO_SET_8").parse([{ a: 8, b: 6 }]).winner).toBe("A");
    expect(TennisRules.scoreSchemaFor("PRO_SET_8").parse([{ a: 8, b: 9 }]).winner).toBe("B");
    const bad = TennisRules.scoreSchemaFor("PRO_SET_8").safeParse([{ a: 8, b: 7 }]);
    expect(translateIssue(bad.error!.issues[0]!)).toContain("Pro-set inválido: 8-7");
    expect(
      TennisRules.scoreSchemaFor("PRO_SET_8").safeParse([
        { a: 8, b: 2 },
        { a: 8, b: 2 },
      ]).success,
    ).toBe(false);

    const full = TennisRules.scoreSchemaFor("BEST_OF_3");
    expect(
      full.parse([
        { a: 6, b: 4 },
        { a: 3, b: 6 },
        { a: 7, b: 5 },
      ]).winner,
    ).toBe("A");
    const tiebreak = full.safeParse([
      { a: 6, b: 4 },
      { a: 3, b: 6 },
      { a: 10, b: 8, tiebreak: true },
    ]);
    expect(translateIssue(tiebreak.error!.issues[0]!)).toBe(
      "Neste formato o 3º set é um set normal",
    );
    expect(TennisRules.setWinnerFor("PRO_SET_8", { a: 9, b: 7, tiebreak: false })).toBe("A");
    expect(TennisRules.setWinnerFor("BEST_OF_3", { a: 10, b: 8, tiebreak: true })).toBeNull();
  });
});

describe("circuit points", () => {
  it("turns knockout exits into placements", () => {
    expect(placementOf({ rounds: 4, lostInRound: null, champion: true })).toBe("CHAMPION");
    expect(placementOf({ rounds: 4, lostInRound: 4, champion: false })).toBe("FINALIST");
    expect(placementOf({ rounds: 4, lostInRound: 3, champion: false })).toBe("SEMIFINAL");
    expect(placementOf({ rounds: 4, lostInRound: 1, champion: false })).toBe("ROUND_OF_16");
    expect(placementOf({ rounds: 6, lostInRound: 1, champion: false })).toBe("PARTICIPATION");
    expect(placementOf({ rounds: 2, lostInRound: null, champion: false })).toBe("PARTICIPATION");
  });

  it("sums points over stages and shares positions on ties", () => {
    const ranking = circuitRanking(
      [
        { playerKey: "ana", stageId: "s1", placement: "CHAMPION" },
        { playerKey: "bia", stageId: "s1", placement: "FINALIST" },
        { playerKey: "caio", stageId: "s1", placement: "SEMIFINAL" },
        { playerKey: "ana", stageId: "s2", placement: "SEMIFINAL" },
        { playerKey: "bia", stageId: "s2", placement: "CHAMPION" },
        { playerKey: "caio", stageId: "s2", placement: "FINALIST" },
      ],
      DEFAULT_POINTS_TABLE,
    );
    expect(ranking.map((row) => [row.playerKey, row.total, row.position])).toEqual([
      ["bia", 170, 1],
      ["ana", 145, 2],
      ["caio", 115, 3],
    ]);
    expect(ranking[0]!.stages).toEqual({ s1: 70, s2: 100 });
  });
});

describe("auto-schedule", () => {
  const slot = (date: string, court: string, start: string, weekend = false): OpenSlot => {
    const minutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
    return { date, courtId: court, timeSlotId: start, start: minutes, end: minutes + 75, weekend };
  };
  const day = (date: string, weekend = false) =>
    ["08:30", "10:00", "17:15", "18:30", "19:45"].flatMap((time) => [
      slot(date, "Q1", time, weekend),
      slot(date, "Q2", time, weekend),
    ]);

  it("respects restrictions, rest time and dependencies", () => {
    const evening = { ...NO_RESTRICTIONS, weekdayNotBefore: "18:00" };
    expect(fitsRestrictions(slot("2030-03-04", "Q1", "17:15"), [evening])).toBe(false);
    expect(fitsRestrictions(slot("2030-03-04", "Q1", "18:30"), [evening])).toBe(true);
    expect(fitsRestrictions(slot("2030-03-09", "Q1", "08:30", true), [evening])).toBe(true);

    const result = autoSchedule({
      slots: day("2030-03-04"),
      commitments: [],
      restMinutes: 60,
      matches: [
        {
          id: "m1",
          playerKeys: ["ana", "bia"],
          restrictions: [evening, NO_RESTRICTIONS],
          dependsOn: [],
        },
        {
          id: "m2",
          playerKeys: ["caio", "duda"],
          restrictions: [NO_RESTRICTIONS, NO_RESTRICTIONS],
          dependsOn: [],
        },
        {
          id: "m3",
          playerKeys: ["ana", "caio"],
          restrictions: [evening, NO_RESTRICTIONS],
          dependsOn: ["m1", "m2"],
        },
        {
          id: "m4",
          playerKeys: ["eva", "fabi"],
          restrictions: [{ ...NO_RESTRICTIONS, unavailableDates: ["2030-03-04"] }, NO_RESTRICTIONS],
          dependsOn: [],
        },
        { id: "m5", playerKeys: ["x", "y"], restrictions: [], dependsOn: ["unscheduled"] },
      ],
    });
    const at = (id: string) => result.assignments.find((entry) => entry.matchId === id);
    expect(at("m1")).toMatchObject({ timeSlotId: "18:30", courtId: "Q1" });
    expect(at("m2")).toMatchObject({ timeSlotId: "08:30", courtId: "Q1" });
    // Ana played 18:30–19:45 and needs 60 min of rest: nothing left that evening.
    expect(at("m3")).toBeUndefined();
    expect(result.unscheduled).toEqual([
      { matchId: "m3", reason: "NO_SLOT" },
      { matchId: "m4", reason: "NO_SLOT" },
      { matchId: "m5", reason: "WAITING_PREVIOUS" },
    ]);
  });

  it("never double-books a slot or a player and honours existing commitments", () => {
    const result = autoSchedule({
      slots: day("2030-03-04").filter(
        (entry) => entry.timeSlotId === "08:30" || entry.timeSlotId === "10:00",
      ),
      commitments: [{ playerKey: "ana", date: "2030-03-04", start: 510, end: 585 }],
      restMinutes: 0,
      matches: [
        { id: "a", playerKeys: ["ana", "bia"], restrictions: [], dependsOn: [] },
        { id: "b", playerKeys: ["caio", "duda"], restrictions: [], dependsOn: [] },
        { id: "c", playerKeys: ["eva", "fabi"], restrictions: [], dependsOn: [] },
      ],
    });
    expect(result.assignments).toEqual([
      { matchId: "a", date: "2030-03-04", courtId: "Q1", timeSlotId: "10:00" },
      { matchId: "b", date: "2030-03-04", courtId: "Q1", timeSlotId: "08:30" },
      { matchId: "c", date: "2030-03-04", courtId: "Q2", timeSlotId: "08:30" },
    ]);
  });
});
