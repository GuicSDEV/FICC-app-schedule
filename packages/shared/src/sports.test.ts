import { describe, expect, it } from "vitest";

import { translateIssue } from "./i18n";
import { sportRules, TennisRules } from "./sports";

describe("SportRules", () => {
  it("resolves tennis for TENNIS", () => {
    expect(sportRules("TENNIS")).toBe(TennisRules);
    expect(TennisRules.teamSize).toEqual({ SINGLES: 1, DOUBLES: 2 });
  });

  it("validates, parses and formats tennis scores", () => {
    const parsed = TennisRules.parseScore("6-4, 3-6, [10-8]");
    expect(parsed.winner).toBe("A");
    expect(TennisRules.formatScore(parsed.sets)).toBe("6-4, 3-6, [10-8]");
    const invalid = TennisRules.scoreSchema.safeParse([{ a: 6, b: 5, tiebreak: false }]);
    expect(invalid.success).toBe(false);
    expect(invalid.error!.issues.map((issue) => translateIssue(issue))).toContain(
      "Informe pelo menos 2 sets",
    );
  });

  it("knows when a single tennis set is won", () => {
    expect(TennisRules.setWinner({ a: 7, b: 5, tiebreak: false })).toBe("A");
    expect(TennisRules.setWinner({ a: 4, b: 6, tiebreak: false })).toBe("B");
    expect(TennisRules.setWinner({ a: 6, b: 5, tiebreak: false })).toBeNull();
    expect(TennisRules.setWinner({ a: 10, b: 8, tiebreak: true })).toBe("A");
    expect(TennisRules.setWinner({ a: 10, b: 9, tiebreak: true })).toBeNull();
    expect(TennisRules.setsToWin).toBe(2);
  });
});
