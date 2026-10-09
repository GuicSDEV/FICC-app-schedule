"use client";

import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";

import { EloCelebration } from "@/components/matches/elo-celebration";
import { useLogout, useSession } from "@/components/providers/session-provider";
import { ChampionCelebration } from "@/components/tournaments/champion-celebration";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ActionSheet } from "./action-sheet";
import { AreaGuard } from "./area-guard";
import { BottomNav } from "./bottom-nav";
import { Brand } from "./brand";
import { FreezeBanner } from "./freeze-banner";
import { adminNavFor, COACH_NAV, isActive, MEMBER_SIDEBAR, MEMBER_TABS } from "./nav-config";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

function SidebarFooter({ children }: { children?: ReactNode }) {
  const t = useTranslations("shell");
  const logout = useLogout();
  return (
    <div className="flex flex-col gap-2">
      {children}
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => void logout()}
          aria-label={t("signOut")}
          className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="size-5" />
        </button>
      </div>
    </div>
  );
}

/** Space reserved at the bottom on phones for the tab bar and safe area. */
const MOBILE_BOTTOM = "pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-12";

export function MemberShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <AreaGuard area="/app">
      <div className="flex min-h-dvh">
        <Sidebar
          group="member"
          items={MEMBER_SIDEBAR}
          header={<Brand subtitle={t("memberArea")} />}
          footer={
            <SidebarFooter>
              <Button onClick={() => setActionsOpen(true)} block className="justify-start">
                <Plus /> {t("newAction")}
              </Button>
            </SidebarFooter>
          }
        />
        <main className={cn("min-w-0 flex-1 px-4 md:px-8", MOBILE_BOTTOM)}>
          <div className="mx-auto w-full max-w-5xl">
            <div className="pt-[max(0.75rem,env(safe-area-inset-top))] empty:hidden md:pt-4">
              <FreezeBanner />
            </div>
            {children}
          </div>
        </main>
        <BottomNav
          group="member"
          left={MEMBER_TABS.left}
          right={MEMBER_TABS.right}
          onAction={() => setActionsOpen(true)}
          actionLabel={t("actionsLabel")}
        />
        <ActionSheet open={actionsOpen} onOpenChange={setActionsOpen} />
        <EloCelebration />
        <ChampionCelebration />
      </div>
    </AreaGuard>
  );
}

export function CoachShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  return (
    <AreaGuard area="/coach">
      <div data-area="coach" className="flex min-h-dvh">
        <Sidebar
          group="coach"
          items={COACH_NAV}
          header={<Brand subtitle={t("coachArea")} />}
          footer={<SidebarFooter />}
        />
        <main className={cn("min-w-0 flex-1 px-4 md:px-8", MOBILE_BOTTOM)}>
          <div className="mx-auto w-full max-w-5xl">
            <div className="pt-[max(0.75rem,env(safe-area-inset-top))] empty:hidden md:pt-4">
              <FreezeBanner />
            </div>
            {children}
          </div>
        </main>
        <BottomNav group="coach" left={COACH_NAV} />
      </div>
    </AreaGuard>
  );
}

/** Admin: sidebar on wide screens, a scrollable tab row on phones. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const { user } = useSession();
  const router = useRouter();
  const items = adminNavFor(user?.permissions ?? []);
  // The admin home is the freezes page; staff without that permission land on their first page.
  const landing = items[0]?.href;
  useEffect(() => {
    if (user && pathname === "/admin" && !user.permissions.includes("COURTS_MANAGE") && landing) {
      router.replace(landing);
    }
  }, [user, pathname, landing, router]);
  return (
    <AreaGuard area="/admin">
      <div className="flex min-h-dvh">
        <Sidebar
          group="admin"
          items={items}
          header={<Brand subtitle={t("adminArea")} />}
          footer={<SidebarFooter />}
        />
        <main className="min-w-0 flex-1 px-4 pb-12 md:px-8">
          <nav
            aria-label={nav("sections")}
            className="sticky top-0 z-40 -mx-4 no-scrollbar flex gap-2 overflow-x-auto border-b border-border glass px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:hidden"
          >
            {items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-small font-medium transition-tokens",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {nav(`items.${item.label}`)}
                </Link>
              );
            })}
          </nav>
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </AreaGuard>
  );
}

/** Gate: full-screen tool with a minimal header. */
export function GateShell({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  const logout = useLogout();
  return (
    <AreaGuard area="/gate">
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b border-border glass pt-safe">
          <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
            <Brand subtitle={t("gateArea")} />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => void logout()}
                aria-label={t("signOut")}
                className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
              >
                <LogOut className="size-5" />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
          {children}
        </main>
      </div>
    </AreaGuard>
  );
}
