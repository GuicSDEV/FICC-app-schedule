import type { MatchDetail, MatchPlayerInfo, SetScore, TeamSide } from "@ficc/shared";

export const otherSide = (side: TeamSide): TeamSide => (side === "A" ? "B" : "A");

/** Players of one side, in the order the API sent them. */
export function sidePlayers(match: MatchDetail, side: TeamSide): MatchPlayerInfo[] {
  return match.players.filter((player) => player.side === side);
}

/** "Ana / Bruno" with first names only (card-sized). */
export function sideFirstNames(match: MatchDetail, side: TeamSide): string {
  return sidePlayers(match, side)
    .map((player) => player.user.name.split(" ")[0] ?? player.user.name)
    .join(" / ");
}

/** The viewer's side first, so lists read "you vs them"; side A first when they did not play. */
export function viewerSides(match: MatchDetail): [TeamSide, TeamSide] {
  const mine = match.viewer.side ?? "A";
  return [mine, otherSide(mine)];
}

/** Sets seen from `side` (the API always sends them from side A's point of view). */
export function setsFrom(sets: readonly SetScore[], side: TeamSide): SetScore[] {
  return side === "A" ? [...sets] : sets.map((set) => ({ ...set, a: set.b, b: set.a }));
}

/** "6-4, 3-6, [10-8]" from `side`'s point of view. */
export function scoreFrom(sets: readonly SetScore[], side: TeamSide): string {
  return setsFrom(sets, side)
    .map((set) => (set.tiebreak ? `[${set.a}-${set.b}]` : `${set.a}-${set.b}`))
    .join(", ");
}

/** The viewer's own row (rating change), when they played. */
export function viewerEntry(match: MatchDetail, viewerId: string | undefined) {
  return viewerId ? match.players.find((player) => player.user.id === viewerId) : undefined;
}

/** "won" / "lost" for a player of the match, null otherwise. */
export function outcomeFor(match: MatchDetail): "won" | "lost" | null {
  if (!match.viewer.side) return null;
  return match.viewer.side === match.winnerSide ? "won" : "lost";
}
