"use client";

import { formatMembershipId, type PlayerSummary } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { enter, listItemVariants, popVariants, spring, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

/**
 * Picks members by name or matrícula. Chosen players show as avatar chips that pop in and out;
 * the search hides once `max` people are chosen.
 */
export function MemberPicker({
  label,
  selected,
  onChange,
  max,
  excludeIds = [],
  invalid,
}: {
  label: string;
  selected: PlayerSummary[];
  onChange: (players: PlayerSummary[]) => void;
  max: number;
  /** People who can't be picked (the viewer, players already on the other side…). */
  excludeIds?: string[];
  invalid?: boolean;
}) {
  const t = useTranslations("picker");
  const inputId = useId();
  const listId = useId();
  const [term, setTerm] = useState("");
  const query = useDebounced(term.trim());
  const full = selected.length >= max;
  const enabled = query.length >= 2 && !full;

  const results = useQuery({
    queryKey: queryKeys.memberSearch(query),
    queryFn: () => api.members.search(query),
    enabled,
    staleTime: 60_000,
  });
  const hidden = new Set([...excludeIds, ...selected.map((player) => player.id)]);
  const options = (results.data ?? []).filter((player) => !hidden.has(player.id));

  function add(player: PlayerSummary) {
    onChange([...selected, player].slice(0, max));
    setTerm("");
  }

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="text-small font-medium">
        {label}{" "}
        <span className="num text-muted-foreground">
          ({selected.length}/{max})
        </span>
      </label>

      <ul className="flex min-h-11 flex-wrap gap-2" aria-label={t("chosen")}>
        <AnimatePresence initial={false} mode="popLayout">
          {selected.map((player) => (
            <motion.li
              key={player.id}
              layout
              variants={popVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
              transition={spring.snappy}
            >
              <span className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface-2 pr-1 pl-1.5">
                <Avatar name={player.name} src={player.photoUrl} size="sm" />
                <span className="max-w-[8.5rem] truncate text-small font-medium">
                  {player.name}
                </span>
                <motion.button
                  type="button"
                  whileTap={tap}
                  onClick={() => onChange(selected.filter((entry) => entry.id !== player.id))}
                  aria-label={t("remove", { name: player.name })}
                  className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-1 after:content-[''] hover:bg-surface-3 hover:text-foreground"
                >
                  <X className="size-4" />
                </motion.button>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {selected.length === 0 ? (
          <li className="flex items-center text-small text-muted-foreground">{t("noneChosen")}</li>
        ) : null}
      </ul>

      {full ? null : (
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={inputId}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("placeholder")}
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-expanded={enabled}
            aria-controls={listId}
            aria-invalid={invalid || undefined}
            className="pl-11"
          />
        </div>
      )}

      {enabled ? (
        <ul id={listId} role="listbox" aria-label={t("results")} className="space-y-1">
          {results.isLoading
            ? [0, 1, 2].map((index) => (
                <li key={index} className="flex h-14 items-center gap-3 px-2">
                  <Skeleton className="size-10 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                </li>
              ))
            : options.map((player, index) => (
                <motion.li
                  key={player.id}
                  role="option"
                  aria-selected={false}
                  custom={index}
                  variants={listItemVariants}
                  initial={enter("hidden")}
                  animate="show"
                >
                  <motion.button
                    type="button"
                    whileTap={tap}
                    onClick={() => add(player)}
                    className="flex h-14 w-full items-center gap-3 rounded-md px-2 text-left transition-tokens hover:bg-surface-2"
                  >
                    <Avatar name={player.name} src={player.photoUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{player.name}</span>
                      <span className="block num text-caption text-muted-foreground">
                        {player.membershipId ? formatMembershipId(player.membershipId) : "—"}
                      </span>
                    </span>
                    <span className="num text-small text-muted-foreground">{player.elo}</span>
                  </motion.button>
                </motion.li>
              ))}
          {!results.isLoading && options.length === 0 ? (
            <li className={cn("px-2 py-3 text-small text-muted-foreground")}>
              {t("noResults", { query })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
