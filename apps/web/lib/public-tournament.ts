import type { PublicTournament } from "@ficc/shared";

import { API_PREFIX, SERVER_API_URL } from "./api";

/** Server-side read of a public tournament (page, metadata and OG image); null when missing. */
export async function fetchPublicTournament(publicId: string): Promise<PublicTournament | null> {
  try {
    const response = await fetch(
      `${SERVER_API_URL}${API_PREFIX}/public/tournaments/${encodeURIComponent(publicId)}`,
      { next: { revalidate: 30 } },
    );
    return response.ok ? ((await response.json()) as PublicTournament) : null;
  } catch {
    return null;
  }
}
