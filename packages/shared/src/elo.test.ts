import { describe, expect, it } from "vitest";

import {
  calculateMatchElo,
  ELO_INITIAL_RATING,
  ELO_K_FACTOR,
  expectedScore,
  teamRating,
} from "./elo";

describe("expectedScore", () => {
  it("is 0.5 between equal ratings", () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
  });

  it("is about 0.91 for a 400-point favorite", () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 10);
  });

  it("is complementary for both players", () => {
    expect(expectedScore(1350, 1180) + expectedScore(1180, 1350)).toBeCloseTo(1, 12);
  });
});

describe("teamRating", () => {
  it("averages the players", () => {
    expect(teamRating([1300, 1100])).toBe(1200);
    expect(teamRating([1250, 1200])).toBe(1225);
  });

  it("rejects an empty team", () => {
    expect(() => teamRating([])).toThrow(RangeError);
  });
});

describe("calculateMatchElo", () => {
  it("uses K = 32 and a 1200 starting rating", () => {
    expect(ELO_K_FACTOR).toBe(32);
    expect(ELO_INITIAL_RATING).toBe(1200);
  });

  it("moves equal players by K/2", () => {
    expect(calculateMatchElo({ sideA: [1200], sideB: [1200], winner: "A" })).toEqual({
      deltaA: 16,
      deltaB: -16,
    });
  });

  it("gives a favorite a small gain for an expected win", () => {
    // E = 0.7597 → 32 × 0.2403 = 7.69
    expect(calculateMatchElo({ sideA: [1400], sideB: [1200], winner: "A" })).toEqual({
      deltaA: 8,
      deltaB: -8,
    });
  });

  it("rewards beating a higher-rated player more", () => {
    const upset = calculateMatchElo({ sideA: [1200], sideB: [1400], winner: "A" });
    const expected = calculateMatchElo({ sideA: [1400], sideB: [1200], winner: "A" });
    expect(upset.deltaA).toBe(24);
    expect(upset.deltaA).toBeGreaterThan(expected.deltaA);
  });

  it("costs more to lose to a lower-rated player", () => {
    const { deltaA } = calculateMatchElo({ sideA: [1400], sideB: [1200], winner: "B" });
    expect(deltaA).toBe(-24);
  });

  it("rates doubles by team average and gives each player the team delta", () => {
    expect(calculateMatchElo({ sideA: [1300, 1100], sideB: [1200, 1200], winner: "B" })).toEqual({
      deltaA: -16,
      deltaB: 16,
    });
  });

  it("is zero-sum and integer for any ratings", () => {
    for (let ratingA = 900; ratingA <= 1700; ratingA += 37) {
      for (let ratingB = 900; ratingB <= 1700; ratingB += 53) {
        for (const winner of ["A", "B"] as const) {
          const { deltaA, deltaB } = calculateMatchElo({
            sideA: [ratingA],
            sideB: [ratingB],
            winner,
          });
          expect(Number.isInteger(deltaA)).toBe(true);
          expect(deltaA + deltaB).toBe(0);
          expect(Object.is(deltaA, -0) || Object.is(deltaB, -0)).toBe(false);
          expect(winner === "A" ? deltaA : deltaB).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("rejects mismatched or oversized teams", () => {
    expect(() => calculateMatchElo({ sideA: [1200], sideB: [1200, 1200], winner: "A" })).toThrow(
      RangeError,
    );
    expect(() => calculateMatchElo({ sideA: [1, 2, 3], sideB: [1, 2, 3], winner: "A" })).toThrow(
      RangeError,
    );
  });
});
