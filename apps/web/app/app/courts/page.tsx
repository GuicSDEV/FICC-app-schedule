import { clubToday } from "@ficc/shared";

import { CourtsView } from "@/app/app/courts/courts-view";
import { getClub } from "@/lib/club-server";
import { queryKeys } from "@/lib/query-keys";
import { Prefetched } from "@/lib/server-prefetch";

export default async function CourtsPage() {
  const club = await getClub();
  const today = club ? clubToday(new Date(), club.timezone) : null;
  return (
    <Prefetched
      queries={() => [
        { key: queryKeys.courts, path: "/courts" },
        ...(today
          ? [{ key: queryKeys.schedule(today), path: "/schedule", query: { date: today } }]
          : []),
      ]}
    >
      <CourtsView />
    </Prefetched>
  );
}
