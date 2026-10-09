import type { AuthUser } from "@ficc/shared";
import { dehydrate, HydrationBoundary, QueryClient, type QueryKey } from "@tanstack/react-query";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";

import { API_PREFIX, API_URL } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export interface ServerQuery {
  key: QueryKey;
  path: string;
  query?: Record<string, string | undefined>;
}

/** GET on the API as the signed-in person (their cookies forwarded). Throws on any error. */
async function serverGet(path: string, query?: ServerQuery["query"]): Promise<unknown> {
  const url = new URL(`${API_URL}${API_PREFIX}${path}`);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value) url.searchParams.set(name, value);
  }
  const response = await fetch(url, {
    headers: { cookie: (await cookies()).toString() },
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

/**
 * Loads a page's first queries on the server and hands them to React Query, so the HTML already
 * shows the data (no wait for the scripts and a request chain). Only on a full page load: client
 * navigations skip it and render at once. Anything that fails (expired access cookie, API down)
 * is simply left for the browser to fetch as before.
 */
export async function Prefetched({
  queries,
  children,
}: {
  /** The page's queries; may depend on the signed-in user. */
  queries: (me: AuthUser) => ServerQuery[];
  children: ReactNode;
}) {
  // Moving between screens (an RSC request, not a full page load): the browser already has or
  // fetches the data itself, so do not hold the screen change on API round trips here.
  if ((await headers()).has("rsc")) return children;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const me = await client
    .fetchQuery({
      queryKey: queryKeys.me,
      queryFn: () => serverGet("/auth/me") as Promise<AuthUser>,
    })
    .catch(() => null);
  if (me) {
    await Promise.all(
      queries(me).map((entry) =>
        client.prefetchQuery({
          queryKey: entry.key,
          queryFn: () => serverGet(entry.path, entry.query),
        }),
      ),
    );
  }
  return <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>;
}
