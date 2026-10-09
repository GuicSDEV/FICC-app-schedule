import { describe, expect, it } from "vitest";

import { calculateMatchElo, updateRating } from "./elo";

describe("updateRating", () => {
  it("moves equal players by K/2", () => {
    expect(updateRating(1200, 1200, 1)).toBe(1216);
    expect(updateRating(1200, 1200, 0)).toBe(1184);
  });

  it("leaves equal players unchanged on a draw", () => {
    expect(updateRating(1300, 1300, 0.5)).toBe(1300);
  });

  it("rewards an upset more than an expected win", () => {
    expect(updateRating(1200, 1400, 1) - 1200).toBe(24);
    expect(updateRating(1400, 1200, 1) - 1400).toBe(8);
  });

  it("honours a custom K-factor", () => {
    expect(updateRating(1200, 1200, 1, 16)).toBe(1208);
  });

  it("agrees with calculateMatchElo for singles", () => {
    const { deltaA } = calculateMatchElo({ sideA: [1310], sideB: [1245], winner: "A" });
    expect(updateRating(1310, 1245, 1)).toBe(1310 + deltaA);
  });
});
