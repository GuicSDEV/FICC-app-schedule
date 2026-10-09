"use client";

import type { AuthUser } from "@ficc/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** True when the API left its readable role cookie, i.e. a session may exist. */
function hasSessionHint(): boolean {
  return typeof document !== "undefined" && /(?:^|; )ficc_role=/.test(document.cookie);
}

/** The signed-in user (null when signed out). Refreshes the session transparently. */
export function useSession() {
  const enabled = hasSessionHint();
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
  return {
    user: enabled ? (query.data ?? null) : null,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useLogout() {
  const client = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    client.clear();
    router.replace("/login");
  }, [client, router]);
}
