"use client";

import type { PublicTournament } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { LogIn, Printer } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Brand } from "@/components/shell/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { api } from "@/lib/api";

import {
  DrawPanel,
  EntriesPanel,
  InfoPanel,
  ResultsPanel,
  SchedulePanel,
  TabBar,
  TournamentHero,
} from "./tournament-panels";

const TABS = ["info", "entries", "draw", "schedule", "results"] as const;
type Tab = (typeof TABS)[number];

/** Read-only tournament page for anyone with the link (no login), refreshed every minute. */
export function PublicTournamentView({
  publicId,
  initial,
}: {
  publicId: string;
  initial: PublicTournament;
}) {
  const t = useTranslations("tournaments");
  const publicT = useTranslations("tournaments.public");
  const [tab, setTab] = useState<Tab>("draw");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["public-tournament", publicId],
    queryFn: () => api.tournaments.public(publicId),
    initialData: initial,
    refetchInterval: 60_000,
  });
  const data = query.data;
  const { tournament } = data;
  const category =
    tournament.categories.find((item) => item.id === categoryId) ?? tournament.categories[0];
  const draw = data.draws.find((item) => item.category.id === category?.id);

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pb-12 md:px-8">
      <header className="sticky top-0 z-30 -mx-4 flex min-h-16 items-center justify-between gap-3 border-b border-border glass px-4 pt-safe md:-mx-8 md:px-8">
        <Brand subtitle={publicT("subtitle")} />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-small font-medium hover:bg-surface-2"
          >
            <LogIn className="size-4" />
            {publicT("login")}
          </Link>
        </div>
      </header>
      <div className="mt-5 space-y-6">
        <TournamentHero
          tournament={tournament}
          actions={
            <Link
              href={`/t/${publicId}/print?view=${tab === "schedule" ? "day" : "draw"}${category ? `&category=${category.id}` : ""}`}
              target="_blank"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-caption font-medium hover:bg-surface-3"
            >
              <Printer className="size-4" />
              {publicT("print")}
            </Link>
          }
        />
        <div className="sticky top-16 z-20 -mx-4 border-b border-border glass px-4 md:-mx-8 md:px-8">
          <TabBar
            label={t("tabsLabel")}
            tabs={TABS.map((value) => ({ value, label: t(`tabs.${value}`) }))}
            value={tab}
            onChange={setTab}
          />
        </div>
        {tab === "info" ? (
          <InfoPanel tournament={tournament} />
        ) : tab === "entries" ? (
          <EntriesPanel
            tournament={tournament}
            categoryId={category?.id ?? null}
            onCategory={setCategoryId}
          />
        ) : tab === "draw" ? (
          <DrawPanel
            categories={tournament.categories}
            categoryId={category?.id ?? null}
            onCategory={setCategoryId}
            draw={draw}
            loading={false}
          />
        ) : tab === "schedule" ? (
          <SchedulePanel days={data.schedule} loading={false} />
        ) : (
          <ResultsPanel
            categories={tournament.categories}
            categoryId={category?.id ?? null}
            onCategory={setCategoryId}
            draw={draw}
            loading={false}
          />
        )}
        <p className="text-center text-caption text-muted-foreground">
          {publicT("footer", { club: data.clubName })}
        </p>
      </div>
    </div>
  );
}
