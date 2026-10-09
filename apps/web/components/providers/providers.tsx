"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/toaster";

import { ClubProvider } from "./club-provider";
import { QueryProvider } from "./query-provider";
import { SocketProvider } from "./socket-provider";

export function Providers({ children }: { children: ReactNode }) {
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
          <ClubProvider>
            <SocketProvider>{children}</SocketProvider>
            <Toaster />
          </ClubProvider>
        </QueryProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
