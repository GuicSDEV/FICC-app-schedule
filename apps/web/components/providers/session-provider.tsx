"use client";

import type { AuthUser } from "@ficc/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { api, ApiError } from "@/lib/api";
import { clearOfflineData } from "@/lib/pwa";
import { queryKeys } from "@/lib/query-keys";

/** True when the API left its readable role cookie, i.e. a session may exist. */
function hasSessionHint(): boolean {
  return typeof document !== "undefined" && /(?:^|; )ficc_role=/.test(document.cookie);
}

/** The signed-in user (null when signed out). Refreshes the session transparently. */
export function useSession() {
  // On the server there are no cookies to read: only a user the page prefetched is known.
  const isServer = typeof window === "undefined";
  const enabled = !isServer && hasSessionHint();
  const query = useQuery({
    enabled,
    queryKey: queryKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return await api.auth.me();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
  const known = isServer || enabled;
  return {
    user: known ? (query.data ?? null) : null,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    /** No answer yet: the shell may render optimistically meanwhile. */
    pending: known && query.data === undefined && !query.isError && (isServer || !query.isFetched),
    refetch: query.refetch,
  };
}

export function useLogout() {
  const client = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    client.clear();
    clearOfflineData();
    router.replace("/login");
  }, [client, router]);
}
