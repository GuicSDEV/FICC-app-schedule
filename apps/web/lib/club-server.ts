import type { ClubInfo } from "@ficc/shared";

import { API_PREFIX, API_URL } from "@/lib/api";

/**
 * The club (GET /club) for server rendering: titles, the manifest and the first paint of every
 * page (the client cache starts from it). The build does not need the API: pages built without it
 * revalidate within 5 minutes.
 */
export async function getClub(): Promise<ClubInfo | null> {
  // Set by Next.js itself during `next build`, not by our environment.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    const response = await fetch(`${API_URL}${API_PREFIX}/club`, { next: { revalidate: 300 } });
    return response.ok ? ((await response.json()) as ClubInfo) : null;
  } catch {
    return null;
  }
}

export async function clubName(): Promise<string | null> {
  return (await getClub())?.name ?? null;
}
