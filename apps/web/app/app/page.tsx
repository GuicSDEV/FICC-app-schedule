import { MemberDashboard } from "@/app/app/dashboard-view";
import { queryKeys } from "@/lib/query-keys";
import { Prefetched } from "@/lib/server-prefetch";

export default function DashboardPage() {
  return (
    <Prefetched
      queries={(me) => [
        { key: queryKeys.player(me.id), path: `/players/${me.id}` },
        { key: queryKeys.eloHistory(me.id), path: `/players/${me.id}/elo-history` },
        { key: queryKeys.bookingsMine, path: "/bookings/mine" },
        { key: queryKeys.matchesMine, path: "/matches/mine" },
        { key: queryKeys.tournaments.mine, path: "/tournaments/mine" },
        { key: queryKeys.news, path: "/news" },
      ]}
    >
      <MemberDashboard />
    </Prefetched>
  );
}
