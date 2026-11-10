"use client";

import { ChevronRight, LogOut } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AdminHeader } from "@/components/admin/admin-header";
import { useLogout, useSession } from "@/components/providers/session-provider";
import { adminNavFor } from "@/components/shell/nav-config";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import type { Messages } from "@/i18n/messages";
import { enter, listItemVariants } from "@/lib/motion";

type AdminSection = keyof Messages["nav"]["descriptions"];

/**
 * Admin home: every section the person may use, as a menu (on phones the admin pages open from
 * here), with the theme and sign-out below.
 */
export default function AdminHomePage() {
  const t = useTranslations("admin.home");
  const nav = useTranslations("nav");
  const shell = useTranslations("shell");
  const { user } = useSession();
  const logout = useLogout();
  const items = adminNavFor(user?.permissions ?? []).filter((item) => item.href !== "/admin");

  return (
    <div className="space-y-6">
      <AdminHeader
        title={t("title")}
        subtitle={user ? t("greeting", { name: user.name.split(" ")[0] ?? "" }) : undefined}
      />
      <motion.ul
        initial={enter("hidden")}
        animate="show"
        transition={{ staggerChildren: 0.03 }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map((item) => (
          <motion.li key={item.href} variants={listItemVariants}>
            <Link
              href={item.href}
              className="flex min-h-18 items-center gap-4 rounded-lg border border-border bg-card p-4 transition-tokens hover:bg-surface-2"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ball-soft text-accent-ink">
                <item.icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{nav(`items.${item.label}`)}</span>
                <span className="block text-small text-muted-foreground">
                  {/* Admin sections only: each has a description. */}
                  {nav(`descriptions.${item.label}` as `descriptions.${AdminSection}`)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </motion.li>
        ))}
      </motion.ul>
      <div className="flex items-center gap-3 md:hidden">
        <ThemeToggle />
        <Button variant="dangerSoft" className="flex-1" onClick={() => void logout()}>
          <LogOut /> {shell("signOut")}
        </Button>
      </div>
    </div>
  );
}
