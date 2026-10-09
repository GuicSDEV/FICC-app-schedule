"use client";

import { useQuery } from "@tanstack/react-query";
import { Medal, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";

import { SectionLabel } from "@/components/ui/card";
import { api } from "@/lib/api";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/** Hall of fame: titles and finals of a player (hidden while there are none). */
export function TitlesList({ userId }: { userId: string }) {
  const t = useTranslations("tournaments.titles");
  const format = useFormat();
  const titles = useQuery({
    queryKey: queryKeys.titles(userId),
    queryFn: () => api.titles(userId),
  });
  const items = titles.data ?? [];
  if (items.length === 0) return null;
  const wins = items.filter((item) => item.placement === "CHAMPION").length;
  return (
    <section className="space-y-3" aria-label={t("title")}>
      <div className="flex items-center gap-2">
        <SectionLabel>{t("title")}</SectionLabel>
        {wins > 0 ? (
          <span className="inline-flex items-center gap-1 text-caption font-semibold text-gold">
            <Trophy className="size-3.5" />
            {t("count", { count: wins })}
          </span>
        ) : null}
      </div>
      <ul className="-mx-4 no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:px-0">
        {items.map((item, index) => {
          const champion = item.placement === "CHAMPION";
          return (
            <motion.li
              key={`${item.tournamentId}-${item.categoryName}`}
              custom={index}
              variants={listItemVariants}
              initial="hidden"
              animate="show"
              className={cn(
                "flex w-60 shrink-0 items-center gap-3 rounded-lg border bg-card p-3 shadow-card md:w-auto",
                champion ? "border-gold/50" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full",
                  champion ? "bg-gold text-on-color" : "bg-surface-2 text-muted-foreground",
                )}
              >
                {champion ? <Trophy className="size-5" /> : <Medal className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-small font-semibold">
                  {champion ? t("champion") : t("finalist")} · {item.categoryName}
                </span>
                <span className="block truncate text-caption text-muted-foreground">
                  {item.tournamentName} · {format.day(item.date)}
                </span>
              </span>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
