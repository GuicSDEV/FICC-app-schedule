import type { z } from "zod";

import type { MatchFormat, Sport, TeamSide } from "./enums";
import {
  formatScore,
  type MatchScore,
  matchScoreSchema,
  type MatchScoreInput,
  matchTiebreakWinner,
  parseScore,
  regularSetWinner,
  type SetScore,
} from "./score";

/**
 * Everything that depends on the sport being played: team sizes, how a score is validated and
 * written. Matches look their rules up by `Match.sport`; adding a sport means adding one
 * implementation here, never branching on the sport elsewhere.
 */
export interface SportRules {
  sport: Sport;
  /** Players per side for each format. */
  teamSize: Record<MatchFormat, number>;
  /** Validates the sets (side A's point of view) and resolves the winner. */
  scoreSchema: z.ZodType<MatchScore, MatchScoreInput>;
  /** Parses a typed score such as "6-4, 3-6, [10-8]". */
  parseScore(text: string): MatchScore;
  /** Writes sets back as text. */
  formatScore(sets: readonly SetScore[]): string;
  /** Winner of one finished set (or deciding tie-break); null while it is not a valid result. */
  setWinner(set: SetScore): TeamSide | null;
  /** Sets needed to win the match. */
  setsToWin: number;
}

/** Tennis, best of 3 with an optional deciding match tie-break. */
export const TennisRules: SportRules = {
  sport: "TENNIS",
  teamSize: { SINGLES: 1, DOUBLES: 2 },
  scoreSchema: matchScoreSchema,
  parseScore,
  formatScore,
  setWinner: (set) => (set.tiebreak ? matchTiebreakWinner(set) : regularSetWinner(set)),
  setsToWin: 2,
};

const RULES: Record<Sport, SportRules> = { TENNIS: TennisRules };

export function sportRules(sport: Sport): SportRules {
  return RULES[sport];
}
