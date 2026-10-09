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

describe("tournament score formats in the sport rules", () => {
  it("picks the schema for each format", () => {
    const full = [
      { a: 6, b: 4, tiebreak: false },
      { a: 3, b: 6, tiebreak: false },
      { a: 7, b: 5, tiebreak: false },
    ];
    const tiebreak = [full[0]!, full[1]!, { a: 10, b: 8, tiebreak: true }];
    expect(TennisRules.scoreSchemaFor("BEST_OF_3_MATCH_TIEBREAK").safeParse(tiebreak).success).toBe(
      true,
    );
    expect(TennisRules.scoreSchemaFor("BEST_OF_3").safeParse(full).success).toBe(true);
    expect(TennisRules.scoreSchemaFor("BEST_OF_3").safeParse(tiebreak).success).toBe(false);
    expect(TennisRules.scoreSchemaFor("PRO_SET_8").safeParse([{ a: 8, b: 3 }]).success).toBe(true);
  });

  it("decides one set under each format", () => {
    const regular = { a: 6, b: 3, tiebreak: false };
    const tiebreak = { a: 8, b: 10, tiebreak: true };
    expect(TennisRules.setWinnerFor("BEST_OF_3_MATCH_TIEBREAK", regular)).toBe("A");
    expect(TennisRules.setWinnerFor("BEST_OF_3_MATCH_TIEBREAK", tiebreak)).toBe("B");
    expect(TennisRules.setWinnerFor("BEST_OF_3", regular)).toBe("A");
    expect(TennisRules.setWinnerFor("BEST_OF_3", tiebreak)).toBeNull();
    expect(TennisRules.setWinnerFor("PRO_SET_8", { a: 8, b: 6, tiebreak: false })).toBe("A");
    expect(TennisRules.setWinnerFor("PRO_SET_8", tiebreak)).toBeNull();
    expect(TennisRules.setsToWin).toBe(2);
  });
});
