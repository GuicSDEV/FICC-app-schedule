import { describe, expect, it } from "vitest";

import { DEFAULT_CLUB_SETTINGS } from "./club";
import { calculateMatchElo, updateRating } from "./elo";

const K = DEFAULT_CLUB_SETTINGS.eloKFactor;

describe("updateRating", () => {
  it("moves equal players by K/2", () => {
    expect(updateRating(1200, 1200, 1, K)).toBe(1216);
    expect(updateRating(1200, 1200, 0, K)).toBe(1184);
  });

  it("leaves equal players unchanged on a draw", () => {
    expect(updateRating(1300, 1300, 0.5, K)).toBe(1300);
  });

  it("rewards an upset more than an expected win", () => {
    expect(updateRating(1200, 1400, 1, K) - 1200).toBe(24);
    expect(updateRating(1400, 1200, 1, K) - 1400).toBe(8);
  });

  it("honours a custom K-factor", () => {
    expect(updateRating(1200, 1200, 1, 16)).toBe(1208);
  });

  it("agrees with calculateMatchElo for singles", () => {
    const { deltaA } = calculateMatchElo({ sideA: [1310], sideB: [1245], winner: "A", k: K });
    expect(updateRating(1310, 1245, 1, K)).toBe(1310 + deltaA);
  });
});
