"use client";

import type { LeaderboardEntry } from "@ficc/shared";
import { ArrowDown, ArrowUp, Crown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { popVariants, spring, staggerDelay, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

const PLACES = {
  1: { ring: "var(--gold)", text: "text-gold", block: "h-28 bg-gold/15 border-gold/40" },
  2: { ring: "var(--silver)", text: "text-silver", block: "h-20 bg-silver/15 border-silver/40" },
  3: { ring: "var(--bronze)", text: "text-bronze", block: "h-16 bg-bronze/15 border-bronze/40" },
} as const;

/** Top 3 as a podium (2nd · 1st · 3rd) with gold, silver and bronze accents. */
export function Podium({
  entries,
  viewerId,
  flash,
}: {
  entries: LeaderboardEntry[];
  viewerId?: string;
  flash: Record<string, "up" | "down">;
}) {
  const t = useTranslations("ranking");
  const order = [entries[1], entries[0], entries[2]];
  return (
    <ol className="grid grid-cols-3 items-end gap-2 pt-6" aria-label={t("podium")}>
      {order.map((entry, column) => {
        if (!entry) return <li key={`empty-${column}`} />;
        const place = Math.min(entry.rank, 3) as 1 | 2 | 3;
        const style = PLACES[place];
        const first = place === 1;
        return (
          <motion.li
            key={entry.player.id}
            layout
            transition={spring.gentle}
            initial={{ opacity: 0, y: 24 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { ...spring.gentle, delay: staggerDelay(place) },
            }}
            className="flex flex-col items-center"
          >
            <motion.div whileTap={tap} className="w-full">
              <Link
                href={`/app/players/${entry.player.id}`}
                className="flex flex-col items-center gap-2 rounded-lg px-1 pb-2"
              >
                <span className="relative">
                  {first ? (
                    <Crown
                      aria-hidden
                      className="absolute -top-6 left-1/2 size-5 -translate-x-1/2 text-gold"
                    />
                  ) : null}
                  <Avatar
                    name={entry.player.name}
                    src={entry.player.photoUrl}
                    size={first ? "lg" : "md"}
                    ring={style.ring}
                  />
                </span>
                <span className="w-full truncate text-center text-small font-semibold">
                  {entry.player.name.split(" ")[0]}
                  {entry.player.id === viewerId ? (
                    <span className="sr-only"> {t("you")}</span>
                  ) : null}
                </span>
                <span className="flex h-5 items-center gap-1 num text-small text-muted-foreground">
                  {entry.elo}
                  <AnimatePresence>
                    {flash[entry.player.id] ? (
                      <motion.span
                        key={flash[entry.player.id]}
                        variants={popVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-full text-on-color",
                          flash[entry.player.id] === "up" ? "bg-ball" : "bg-danger",
                        )}
                      >
                        {flash[entry.player.id] === "up" ? (
                          <ArrowUp className="size-3" aria-label={t("movedUp")} />
                        ) : (
                          <ArrowDown className="size-3" aria-label={t("movedDown")} />
                        )}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
              </Link>
            </motion.div>
            <div
              className={cn(
                "relative flex w-full items-start justify-center rounded-t-lg border border-b-0 pt-2 transition-tokens",
                style.block,
                flash[entry.player.id] && "ring-2 ring-primary",
              )}
            >
              <span className={cn("font-display text-headline font-bold", style.text)}>
                {entry.rank}
              </span>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
