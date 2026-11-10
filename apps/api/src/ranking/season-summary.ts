import type { RankingSeason } from "@ficc/db";
import type { SeasonSummary } from "@ficc/shared";

export function toSeasonSummary(season: RankingSeason): SeasonSummary {
  return {
    id: season.id,
    name: season.name,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt?.toISOString() ?? null,
    closedAt: season.closedAt?.toISOString() ?? null,
  };
}
