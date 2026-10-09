/** K-factor applied to every rated match. */
export const ELO_K_FACTOR = 32;

/** Rating every member starts with. */
export const ELO_INITIAL_RATING = 1200;

export type EloSide = "A" | "B";

export interface EloMatchInput {
  /** Current ratings of side A: one player for singles, two for doubles. */
  sideA: readonly number[];
  /** Current ratings of side B, same size as side A. */
  sideB: readonly number[];
  winner: EloSide;
  /** Override for the K-factor (defaults to {@link ELO_K_FACTOR}). */
  k?: number;
}

export interface EloMatchResult {
  /** Integer rating change applied to every player on side A. */
  deltaA: number;
  /** Integer rating change applied to every player on side B (always `-deltaA`). */
  deltaB: number;
}

/** Expected score `E_a = 1 / (1 + 10^((R_b − R_a) / 400))`: the chance that `rating` beats `opponentRating`. */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/**
 * Single-player update `R' = R + K·(S − E)`, rounded to an integer.
 * `score` is 1 for a win, 0 for a loss (0.5 is accepted for completeness).
 */
export function updateRating(
  rating: number,
  opponentRating: number,
  score: 0 | 0.5 | 1,
  k: number = ELO_K_FACTOR,
): number {
  return Math.round(rating + k * (score - expectedScore(rating, opponentRating)));
}

/** Doubles team rating: the average of its players. */
export function teamRating(ratings: readonly number[]): number {
  if (ratings.length === 0) {
    throw new RangeError("A team needs at least one player");
  }
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
}

/**
 * Elo update for a tennis match (there are no draws): `R' = R + K·(S − E)`.
 *
 * Side A's change is rounded to an integer and side B receives the exact opposite, so every
 * match is zero-sum. In doubles, each side is rated as the average of its two players and
 * every player receives the team's delta.
 */
export function calculateMatchElo({
  sideA,
  sideB,
  winner,
  k = ELO_K_FACTOR,
}: EloMatchInput): EloMatchResult {
  const teamSize = sideA.length;
  if ((teamSize !== 1 && teamSize !== 2) || sideB.length !== teamSize) {
    throw new RangeError("Elo needs 1 vs 1 (singles) or 2 vs 2 (doubles)");
  }

  const scoreA = winner === "A" ? 1 : 0;
  const deltaA = Math.round(k * (scoreA - expectedScore(teamRating(sideA), teamRating(sideB))));

  // `+ 0` turns a possible -0 into 0.
  return { deltaA: deltaA + 0, deltaB: -deltaA + 0 };
}
