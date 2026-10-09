"use client";

import type { ClubInfo } from "@ficc/shared";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useEffect } from "react";

import { Toaster } from "@/components/ui/toaster";
import { markHydrated } from "@/lib/motion";
import { startPwa } from "@/lib/pwa";

import { ClubProvider } from "./club-provider";
import { QueryProvider } from "./query-provider";
import { SocketProvider } from "./socket-provider";

export function Providers({ children, club }: { children: ReactNode; club: ClubInfo | null }) {
  useEffect(() => {
    markHydrated();
    startPwa();
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {/* Respect prefers-reduced-motion: transforms become fades, layout animations are skipped. */}
      <MotionConfig reducedMotion="user">
        <QueryProvider>
          <ClubProvider initialClub={club}>
            <SocketProvider>{children}</SocketProvider>
            <Toaster />
          </ClubProvider>
        </QueryProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
