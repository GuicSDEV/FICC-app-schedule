import type { ReactNode } from "react";

import { Brand } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { CourtLines } from "@/components/ui/court-lines";

/** Full-bleed night-court hero behind the auth forms. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden">
      {/* Floodlights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 45% at 15% 0%, oklch(0.912 0.187 118.2 / 16%), transparent 70%), radial-gradient(55% 40% at 95% 10%, oklch(0.657 0.176 286.1 / 14%), transparent 70%), radial-gradient(80% 60% at 50% 110%, oklch(0.583 0.082 157.4 / 22%), transparent 70%)",
        }}
      />
      <CourtLines className="-z-10 opacity-[0.07]" />
      <header className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col justify-end px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center">
        {children}
      </main>
    </div>
  );
}
