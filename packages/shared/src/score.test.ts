import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { translateIssue } from "./i18n";
import {
  bestOfThreeFullSetsSchema,
  formatScore,
  matchScoreSchema,
  matchTiebreakWinner,
  parseScore,
  proSetSchema,
  proSetWinner,
  regularSetWinner,
  scoreTextSchema,
  splitScoreText,
} from "./score";

const set = (a: number, b: number, tiebreak = false) => ({ a, b, tiebreak });

function errorOf(text: string): string {
  const result = scoreTextSchema.safeParse(text);
  expect(result.success).toBe(false);
  return result.error!.issues.map((issue) => translateIssue(issue)).join(" | ");
}

describe("regularSetWinner", () => {
  it.each([
    [6, 0, "A"],
    [6, 4, "A"],
    [4, 6, "B"],
    [7, 5, "A"],
    [5, 7, "B"],
    [7, 6, "A"],
    [6, 7, "B"],
  ] as const)("%i-%i is won by %s", (a, b, winner) => {
    expect(regularSetWinner({ a, b })).toBe(winner);
  });

  it.each([
    [6, 5],
    [7, 3],
    [7, 4],
    [5, 3],
    [6, 6],
    [8, 6],
    [0, 0],
  ])("%i-%i is not a finished set", (a, b) => {
    expect(regularSetWinner({ a, b })).toBeNull();
  });
});

describe("matchTiebreakWinner", () => {
  it.each([
    [10, 8, "A"],
    [10, 0, "A"],
    [8, 10, "B"],
    [11, 9, "A"],
    [12, 14, "B"],
  ] as const)("[%i-%i] is won by %s", (a, b, winner) => {
    expect(matchTiebreakWinner({ a, b })).toBe(winner);
  });

  it.each([
    [10, 9],
    [9, 7],
    [12, 9],
    [11, 10],
    [7, 5],
  ])("[%i-%i] is invalid", (a, b) => {
    expect(matchTiebreakWinner({ a, b })).toBeNull();
  });
});

describe("parseScore", () => {
  it("parses straight sets", () => {
    expect(parseScore("6-4, 6-3")).toEqual({
      sets: [set(6, 4), set(6, 3)],
      winner: "A",
      setsWon: { A: 2, B: 0 },
    });
  });

  it("parses a three-set win with a match tie-break", () => {
    expect(parseScore("6-4, 3-6, [10-8]")).toEqual({
      sets: [set(6, 4), set(3, 6), set(10, 8, true)],
      winner: "A",
      setsWon: { A: 2, B: 1 },
    });
  });

  it("returns side B as winner when B wins", () => {
    expect(parseScore("4-6, 7-6, 3-6").winner).toBe("B");
    expect(parseScore("6-7, 6-4, [8-10]").winner).toBe("B");
  });

  it("accepts extended tie-breaks, en dashes and loose spacing", () => {
    expect(parseScore(" 7-5 ,5–7,[ 12-10 ] ").sets.at(-1)).toEqual(set(12, 10, true));
  });

  it("rejects invalid sets such as 6-5 and 7-3", () => {
    expect(errorOf("6-5, 6-4")).toContain("Set inválido: 6-5");
    expect(errorOf("7-3, 6-4")).toContain("Set inválido: 7-3");
  });

  it("rejects a 10-9 match tie-break (win by 2)", () => {
    expect(errorOf("6-4, 4-6, [10-9]")).toContain("Match tie-break inválido: 10-9");
  });

  it("rejects three sets when the match was already decided", () => {
    expect(errorOf("6-4, 6-3, 4-6")).toContain("já estava decidida");
  });

  it("rejects a split match with no deciding set", () => {
    expect(errorOf("6-4, 3-6")).toContain("falta o set decisivo");
  });

  it("rejects a match tie-break before the third set", () => {
    expect(errorOf("[10-8], 6-4")).toContain("só pode ser o 3º set");
  });

  it("rejects too few or too many sets", () => {
    expect(errorOf("6-4")).toContain("pelo menos 2 sets");
    expect(errorOf("6-4, 4-6, 6-4, 6-4")).toContain("no máximo 3 sets");
  });

  it("rejects malformed tokens and unbalanced brackets", () => {
    expect(errorOf("6-4, six-three")).toContain('Placar mal formatado: "six-three"');
    expect(errorOf("6-4, 4-6, [10-8")).toContain("mal formatado");
  });

  it("throws a ZodError from parseScore", () => {
    expect(() => parseScore("6-6, 6-4")).toThrow(ZodError);
  });

  it("validates structured input with a default tie-break flag", () => {
    expect(
      matchScoreSchema.parse([
        { a: 6, b: 2 },
        { a: 6, b: 1 },
      ]).winner,
    ).toBe("A");
  });
});

describe("splitScoreText and formatScore", () => {
  it("round-trips a score", () => {
    const text = "6-4, 3-6, [10-8]";
    expect(formatScore(splitScoreText(text))).toBe(text);
  });

  it("ignores empty tokens", () => {
    expect(splitScoreText("6-4,, 6-2,")).toEqual([set(6, 4), set(6, 2)]);
  });
});

describe("tournament score formats", () => {
  const issueKeys = (error: ZodError) => error.issues.map((issue) => issue.message);

  it("best of 3 full sets: accepts a regular deciding set", () => {
    const result = bestOfThreeFullSetsSchema.parse([set(6, 4), set(3, 6), set(7, 5)]);
    expect(result.winner).toBe("A");
    expect(result.setsWon).toEqual({ A: 2, B: 1 });
  });

  it("best of 3 full sets: refuses a match tie-break", () => {
    const result = bestOfThreeFullSetsSchema.safeParse([set(6, 4), set(3, 6), set(10, 8, true)]);
    expect(result.success).toBe(false);
    expect(issueKeys(result.error!)).toEqual(["validation.score.noTiebreak"]);
    expect(result.error!.issues[0]!.path).toEqual([2]);
  });

  it("best of 3 full sets: passes on the rules' issues with their params", () => {
    const result = bestOfThreeFullSetsSchema.safeParse([set(6, 4), set(5, 5)]);
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0]!;
    expect(issue.message).toBe("validation.score.invalidSet");
    expect(issue.path).toEqual([1]);
    expect(translateIssue(issue)).toContain("5-5");
    const tied = bestOfThreeFullSetsSchema.safeParse([set(6, 4), set(3, 6)]);
    expect(issueKeys(tied.error!)).toEqual(["validation.score.tied"]);
  });

  it("pro-set winner: 8 games with a two-game lead, 9-7 or 9-8", () => {
    expect(proSetWinner({ a: 8, b: 6 })).toBe("A");
    expect(proSetWinner({ a: 7, b: 9 })).toBe("B");
    expect(proSetWinner({ a: 9, b: 8 })).toBe("A");
    expect(proSetWinner({ a: 8, b: 7 })).toBeNull();
    expect(proSetWinner({ a: 6, b: 4 })).toBeNull();
    expect(proSetWinner({ a: 10, b: 8 })).toBeNull();
  });

  it("pro-set: exactly one valid set", () => {
    expect(proSetSchema.parse([set(8, 5)])).toEqual({
      sets: [set(8, 5)],
      winner: "A",
      setsWon: { A: 1, B: 0 },
    });
    expect(proSetSchema.parse([set(4, 8)]).setsWon).toEqual({ A: 0, B: 1 });
    expect(issueKeys(proSetSchema.safeParse([set(8, 5), set(8, 5)]).error!)).toEqual([
      "validation.score.oneSet",
    ]);
    const invalid = proSetSchema.safeParse([set(8, 7)]);
    expect(issueKeys(invalid.error!)).toEqual(["validation.score.invalidProSet"]);
    expect(translateIssue(invalid.error!.issues[0]!)).toContain("8-7");
    expect(issueKeys(proSetSchema.safeParse([set(10, 8, true)]).error!)).toEqual([
      "validation.score.invalidProSet",
    ]);
  });
});
