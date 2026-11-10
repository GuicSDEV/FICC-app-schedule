"use client";

import type { SeasonStandingEntry } from "@ficc/shared";
import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { enter, listItemVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** One member's final place in a closed season. */
export function SeasonRow({
  entry,
  index,
  mine,
}: {
  entry: SeasonStandingEntry;
  index: number;
  mine: boolean;
}) {
  const t = useTranslations("seasons");
  return (
    <motion.li custom={index} variants={listItemVariants} initial={enter("hidden")} animate="show">
      <Link
        href={`/app/players/${entry.player.id}`}
        className={cn(
          "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 transition-tokens",
          mine ? "border-primary/50 bg-ball-soft" : "border-border bg-card hover:bg-surface-2",
        )}
      >
        <span className="w-7 shrink-0 text-center num text-small font-semibold text-muted-foreground">
          {entry.rank}
        </span>
        <Avatar name={entry.player.name} src={entry.player.photoUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{entry.player.name}</span>
          <span className="block num text-caption text-muted-foreground">
            {t("record", { wins: entry.wins, losses: entry.losses })}
          </span>
        </span>
        <span className="num font-semibold">{entry.elo}</span>
      </Link>
    </motion.li>
  );
}
