"use client";

import { ChevronRight, LogOut, UserCheck } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { PlayerProfileView } from "@/components/players/player-profile";
import { DeleteAccount } from "@/components/profile/delete-account";
import { useLogout, useSession } from "@/components/providers/session-provider";
import { InstallCard } from "@/components/pwa/install-card";
import { PushToggle } from "@/components/pwa/push-card";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The member's own profile, with app settings and sign-out below the ladder card. */
export default function ProfilePage() {
  const t = useTranslations("profile");
  const shell = useTranslations("shell");
  const { user } = useSession();
  const logout = useLogout();

  return (
    <>
      <PageHeader title={t("title")} actions={<NotificationBell />} />
      <div className="mx-auto mt-5 max-w-2xl">
        {user ? (
          <PlayerProfileView
            userId={user.id}
            extra={
              <section className="space-y-3" aria-label={t("settings")}>
                <SectionLabel>{t("settings")}</SectionLabel>
                <InstallCard dismissible={false} />
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  <PushToggle />
                  <Link
                    href="/app/guests"
                    className="flex min-h-14 items-center gap-3 px-4 transition-tokens hover:bg-surface-2"
                  >
                    <UserCheck className="size-5 text-muted-foreground" />
                    <span className="flex-1 font-medium">{t("guests")}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                  <div className="flex min-h-14 items-center gap-3 px-4">
                    <span className="flex-1 font-medium">{t("theme")}</span>
                    <ThemeToggle />
                  </div>
                </div>
                <Button variant="dangerSoft" block onClick={() => void logout()}>
                  <LogOut /> {shell("signOut")}
                </Button>
                <DeleteAccount />
                <p className="flex justify-center gap-4 pt-2 text-small text-muted-foreground">
                  <Link href="/privacidade" className="underline-offset-4 hover:underline">
                    {t("privacy")}
                  </Link>
                  <Link href="/termos" className="underline-offset-4 hover:underline">
                    {t("terms")}
                  </Link>
                </p>
              </section>
            }
          />
        ) : (
          <Skeleton className="h-64 rounded-xl" />
        )}
      </div>
    </>
  );
}
