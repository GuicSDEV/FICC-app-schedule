import { z } from "zod";

import { roundName, type RoundName } from "./bracket";

/** Where an entry finished in a category; circuits award points per placement. */
export const PLACEMENTS = [
  "CHAMPION",
  "FINALIST",
  "SEMIFINAL",
  "QUARTERFINAL",
  "ROUND_OF_16",
  "ROUND_OF_32",
  "PARTICIPATION",
] as const;
export type Placement = (typeof PLACEMENTS)[number];

export type PointsTable = Record<Placement, number>;

export const pointsTableSchema = z.object(
  Object.fromEntries(
    PLACEMENTS.map((placement) => [placement, z.number().int().min(0).max(10_000)]),
  ) as Record<Placement, z.ZodNumber>,
);

/** The example from the spec: champion 100, finalist 70, semis 45, quarters 25, R16 15, participation 5. */
export const DEFAULT_POINTS_TABLE: PointsTable = {
  CHAMPION: 100,
  FINALIST: 70,
  SEMIFINAL: 45,
  QUARTERFINAL: 25,
  ROUND_OF_16: 15,
  ROUND_OF_32: 10,
  PARTICIPATION: 5,
};

const LOST_IN: Partial<Record<RoundName, Placement>> = {
  FINAL: "FINALIST",
  SEMIFINAL: "SEMIFINAL",
  QUARTERFINAL: "QUARTERFINAL",
  ROUND_OF_16: "ROUND_OF_16",
  ROUND_OF_32: "ROUND_OF_32",
};

/**
 * Placement of an entry from the last knockout round it lost (1 = first round), whether it won
 * the final, or null when it never reached the knockout (group stage only).
 */
export function placementOf(input: {
  rounds: number;
  lostInRound: number | null;
  champion: boolean;
}): Placement {
  if (input.champion) return "CHAMPION";
  if (input.lostInRound === null) return "PARTICIPATION";
  return LOST_IN[roundName(input.lostInRound, input.rounds)] ?? "PARTICIPATION";
}

export interface CircuitResult {
  /** Stable key of a player (user id, or a guest key). */
  playerKey: string;
  stageId: string;
  placement: Placement;
}

export interface CircuitStanding {
  playerKey: string;
  total: number;
  /** Points per stage id. */
  stages: Record<string, number>;
  position: number;
}

/** Circuit ranking: sum of points over the stages, ties share a position (1, 2, 2, 4). */
export function circuitRanking(
  results: readonly CircuitResult[],
  table: PointsTable,
): CircuitStanding[] {
  const byPlayer = new Map<string, CircuitStanding>();
  for (const result of results) {
    const row = byPlayer.get(result.playerKey) ?? {
      playerKey: result.playerKey,
      total: 0,
      stages: {},
      position: 0,
    };
    const points = table[result.placement];
    // One result per player and stage: keep the best if a player somehow appears twice.
    const previous = row.stages[result.stageId] ?? 0;
    if (points > previous) {
      row.total += points - previous;
      row.stages[result.stageId] = points;
    } else if (!(result.stageId in row.stages)) {
      row.stages[result.stageId] = points;
    }
    byPlayer.set(result.playerKey, row);
  }
  const sorted = [...byPlayer.values()].sort(
    (a, b) => b.total - a.total || a.playerKey.localeCompare(b.playerKey),
  );
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    row.position = previous && previous.total === row.total ? previous.position : index + 1;
  });
  return sorted;
}
