import { RankingView } from "@/app/app/ranking/ranking-view";
import { queryKeys } from "@/lib/query-keys";
import { Prefetched } from "@/lib/server-prefetch";

export default function RankingPage() {
  return (
    <Prefetched
      queries={() => [
        { key: queryKeys.leaderboard("ALL"), path: "/leaderboard" },
        { key: queryKeys.categories, path: "/categories" },
      ]}
    >
      <RankingView />
    </Prefetched>
  );
}
