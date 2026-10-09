"use client";

import type { ClubInfo } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { createContext, type ReactNode, useContext } from "react";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const ClubContext = createContext<ClubInfo | null>(null);

/** The device's zone, used only until the club's own zone is known. */
const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Loads the club this deployment serves (GET /club: name, branding, locale, time zone, rules) and
 * re-provides next-intl with the club's locale and time zone, so every date and number in the UI
 * is formatted the club's way.
 */
export function ClubProvider({
  children,
  initialClub,
}: {
  children: ReactNode;
  /** Fetched by the root layout on the server, so the first paint already has the club. */
  initialClub: ClubInfo | null;
}) {
  const locale = useLocale();
  const messages = useMessages();
  const { data: club } = useQuery({
    queryKey: queryKeys.club,
    queryFn: api.club,
    staleTime: 60 * 60_000,
    initialData: initialClub ?? undefined,
    // Server copy may be up to 5 minutes old: paint with it, then refresh in the background.
    initialDataUpdatedAt: 0,
  });
  return (
    <ClubContext.Provider value={club ?? null}>
      <NextIntlClientProvider
        locale={club?.locale ?? locale}
        messages={messages}
        timeZone={club?.timezone ?? deviceTimeZone()}
      >
        {children}
      </NextIntlClientProvider>
    </ClubContext.Provider>
  );
}

/** The current club, or null while it loads. */
export function useClub(): ClubInfo | null {
  return useContext(ClubContext);
}
