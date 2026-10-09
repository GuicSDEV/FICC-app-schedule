import { z } from "zod";

import type { TeamSide } from "./enums";

/**
 * One set, from side A's point of view: `a` games for side A, `b` for side B.
 * `tiebreak` marks a deciding match tie-break, whose values are points (e.g. 10-8).
 */
export interface SetScore {
  a: number;
  b: number;
  tiebreak: boolean;
}

export interface MatchScore {
  sets: SetScore[];
  winner: TeamSide;
  setsWon: Record<TeamSide, number>;
}

/** Winner of a regular set: 6-0 … 6-4, 7-5 or 7-6; null when the score is not a finished set. */
export function regularSetWinner({ a, b }: Pick<SetScore, "a" | "b">): TeamSide | null {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const valid = (high === 6 && low <= 4) || (high === 7 && (low === 5 || low === 6));
  if (!valid) return null;
  return a > b ? "A" : "B";
}

/** Winner of a match tie-break: first to 10, win by 2 (11-9, 12-10 … when extended). */
export function matchTiebreakWinner({ a, b }: Pick<SetScore, "a" | "b">): TeamSide | null {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const valid = high >= 10 && high - low >= 2 && (high === 10 || high - low === 2);
  if (!valid) return null;
  return a > b ? "A" : "B";
}

/** Shape of one set; whether the numbers make a valid set is up to the sport's rules. */
export const setScoreSchema = z.object({
  a: z.number().int().min(0).max(99),
  b: z.number().int().min(0).max(99),
  tiebreak: z.boolean().default(false),
});

/**
 * Validates a best-of-3 score and resolves the winner. Regular sets must be finished sets;
 * a match tie-break is only allowed as the deciding third set; the match must end exactly when a
 * side wins its second set. Messages are catalogue keys (see i18n), translated by the API and web.
 */
export const matchScoreSchema = z
  .array(setScoreSchema)
  .min(2, { message: "validation.score.minSets" })
  .max(3, { message: "validation.score.maxSets" })
  .transform((sets, ctx): MatchScore => {
    const setsWon: Record<TeamSide, number> = { A: 0, B: 0 };
    let winner: TeamSide | null = null;

    for (const [index, set] of sets.entries()) {
      const label = `${set.a}-${set.b}`;
      if (winner) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "validation.score.alreadyDecided",
        });
        return z.NEVER;
      }
      if (set.tiebreak && index !== 2) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "validation.score.tiebreakThirdOnly",
        });
        return z.NEVER;
      }
      const setWinner = set.tiebreak ? matchTiebreakWinner(set) : regularSetWinner(set);
      if (!setWinner) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: set.tiebreak
            ? "validation.score.invalidTiebreak"
            : "validation.score.invalidSet",
          params: { score: label },
        });
        return z.NEVER;
      }
      setsWon[setWinner] += 1;
      if (setsWon[setWinner] === 2) winner = setWinner;
    }

    if (!winner) {
      ctx.addIssue({ code: "custom", path: [], message: "validation.score.tied" });
      return z.NEVER;
    }
    return { sets, winner, setsWon };
  });

export type MatchScoreInput = z.input<typeof matchScoreSchema>;

const SET_TOKEN = /^(\[)?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(\])?$/;

/** Thrown by {@link splitScoreText} for a token that is not a set ("6-4" or "[10-8]"). */
export class ScoreFormatError extends Error {
  constructor(readonly token: string) {
    super(`Malformed score token "${token}"`);
    this.name = "ScoreFormatError";
  }
}

/**
 * Splits "6-4, 3-6, [10-8]" into sets. Brackets mark the match tie-break. Throws a
 * {@link ScoreFormatError} when a token is malformed; set rules are checked by
 * {@link matchScoreSchema}.
 */
export function splitScoreText(text: string): SetScore[] {
  const tokens = text
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return tokens.map((token) => {
    const match = SET_TOKEN.exec(token);
    if (!match || Boolean(match[1]) !== Boolean(match[4])) {
      throw new ScoreFormatError(token);
    }
    return { a: Number(match[2]), b: Number(match[3]), tiebreak: Boolean(match[1]) };
  });
}

/** Parses and validates a text score such as `6-4, 3-6, [10-8]`. */
export const scoreTextSchema = z.string().transform((text, ctx): MatchScore => {
  let sets: SetScore[];
  try {
    sets = splitScoreText(text);
  } catch (error) {
    // splitScoreText only throws ScoreFormatError.
    ctx.addIssue({
      code: "custom",
      message: "validation.score.malformed",
      params: { token: (error as ScoreFormatError).token },
    });
    return z.NEVER;
  }
  const result = matchScoreSchema.safeParse(sets);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: issue.path,
        ...("params" in issue && issue.params ? { params: issue.params } : {}),
      });
    }
    return z.NEVER;
  }
  return result.data;
});

/** Parses a text score; throws a ZodError whose messages are catalogue keys when it is invalid. */
export function parseScore(text: string): MatchScore {
  return scoreTextSchema.parse(text);
}

/** `[{6,4},{3,6},{10,8,tb}]` → "6-4, 3-6, [10-8]". */
export function formatScore(sets: readonly Pick<SetScore, "a" | "b" | "tiebreak">[]): string {
  return sets.map((set) => (set.tiebreak ? `[${set.a}-${set.b}]` : `${set.a}-${set.b}`)).join(", ");
}
