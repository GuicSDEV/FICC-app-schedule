"use client";

import { formatMembershipId, normalizeMembershipId, type PlayerSummary } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { enter, listItemVariants, popVariants, spring, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { matchesName } from "@/lib/search";
import { cn } from "@/lib/utils";

/** Rows shown at once; typing narrows the rest. */
const MAX_ROWS = 60;

/**
 * Picks members by name or matrícula. The club's members (A–Z) show as soon as the field is
 * tapped and narrow as the person types, filtered on the device. Chosen players show as avatar
 * chips that pop in and out; the search hides once `max` people are chosen.
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
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = selected.length >= max;

  const directory = useQuery({
    queryKey: queryKeys.memberDirectory,
    queryFn: api.members.directory,
    staleTime: 5 * 60_000,
  });
  const hidden = new Set([...excludeIds, ...selected.map((player) => player.id)]);
  const query = term.trim();
  const digits = normalizeMembershipId(query);
  const matching = (directory.data ?? []).filter(
    (player) =>
      !hidden.has(player.id) &&
      (query === "" ||
        matchesName(player.name, query) ||
        (digits.length >= 2 && (player.membershipId ?? "").startsWith(digits))),
  );
  const options = matching.slice(0, MAX_ROWS);
  const showList = open && !full;

  function add(player: PlayerSummary) {
    onChange([...selected, player].slice(0, max));
    setTerm("");
  }

  function focus() {
    setOpen(true);
    // Once the phone keyboard is up, keep the field and the first names above it.
    setTimeout(() => inputRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 350);
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
            ref={inputRef}
            id={inputId}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onFocus={focus}
            onBlur={() => setOpen(false)}
            placeholder={t("placeholder")}
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-invalid={invalid || undefined}
            className="pl-11"
          />
        </div>
      )}

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("results")}
          className="max-h-72 space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-border p-1"
        >
          {directory.isLoading
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
                    // Keep the field focused (and the keyboard up) while picking.
                    onPointerDown={(event) => event.preventDefault()}
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
          {!directory.isLoading && options.length === 0 && query !== "" ? (
            <li className={cn("px-2 py-3 text-small text-muted-foreground")}>
              {t("noResults", { query })}
            </li>
          ) : null}
          {matching.length > MAX_ROWS ? (
            <li className="px-2 py-2 text-caption text-muted-foreground">
              {t("keepTyping", { count: matching.length - MAX_ROWS })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
