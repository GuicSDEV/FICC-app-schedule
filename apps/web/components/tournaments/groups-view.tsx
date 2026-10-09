"use client";

import type { GroupView, TournamentMatchView } from "@ficc/shared";
import { Check } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useSession } from "@/components/providers/session-provider";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { spring } from "@/lib/motion";
import { sideUserIds } from "@/lib/tournaments";
import { cn } from "@/lib/utils";

import { MatchRow } from "./match-row";

function Standings({
  group,
  advance,
  selectable,
  selectedEntry,
  onSelectEntry,
}: {
  group: GroupView;
  advance: number;
  selectable: boolean;
  selectedEntry: string | null;
  onSelectEntry?: (entryId: string) => void;
}) {
  const t = useTranslations("tournaments.groups");
  const { user } = useSession();
  return (
    <table className="w-full text-small">
      <thead>
        <tr className="text-caption text-muted-foreground">
          <th className="w-7 py-1.5 text-left font-medium">#</th>
          <th className="py-1.5 text-left font-medium">{t("entry")}</th>
          <th className="w-8 py-1.5 text-center font-medium" title={t("playedLong")}>
            {t("played")}
          </th>
          <th className="w-8 py-1.5 text-center font-medium" title={t("winsLong")}>
            {t("wins")}
          </th>
          <th className="w-12 py-1.5 text-center font-medium" title={t("setsLong")}>
            {t("sets")}
          </th>
          <th
            className="hidden w-14 py-1.5 text-center font-medium sm:table-cell"
            title={t("gamesLong")}
          >
            {t("games")}
          </th>
        </tr>
      </thead>
      <tbody>
        {group.standings.map((row) => {
          const qualifies = row.position <= advance;
          const mine = user ? sideUserIds(row.entry).includes(user.id) : false;
          const selected = selectedEntry === row.entry.id;
          return (
            <motion.tr
              key={row.entryId}
              layout="position"
              transition={spring.gentle}
              className={cn("border-t border-border", mine && "bg-ball-soft")}
            >
              <td className="py-2">
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full num text-caption font-semibold",
                    qualifies && row.played > 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {row.position}
                </span>
              </td>
              <td className="max-w-0 py-2">
                {selectable && onSelectEntry ? (
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectEntry(row.entry.id)}
                    className={cn(
                      "flex min-h-9 w-full items-center truncate rounded-md px-1 text-left hover:bg-surface-2",
                      selected && "ring-2 ring-primary",
                    )}
                  >
                    {row.entry.name}
                  </button>
                ) : (
                  <span className="block truncate">
                    {row.entry.name}
                    {row.entry.seed ? (
                      <span className="ml-1 num text-caption text-muted-foreground">
                        [{row.entry.seed}]
                      </span>
                    ) : null}
                  </span>
                )}
              </td>
              <td className="py-2 text-center num">{row.played}</td>
              <td className="py-2 text-center num font-semibold">{row.wins}</td>
              <td className="py-2 text-center num text-muted-foreground">
                {row.setsWon}-{row.setsLost}
              </td>
              <td className="hidden py-2 text-center num text-muted-foreground sm:table-cell">
                {row.gamesWon}-{row.gamesLost}
              </td>
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Round-robin groups: standings that re-sort with a spring as results arrive (top places that go
 * through are highlighted) and each group's fixtures.
 */
export function GroupsView({
  groups,
  advancePerGroup,
  onOpenMatch,
  selectable = false,
  selectedEntry = null,
  onSelectEntry,
}: {
  groups: GroupView[];
  advancePerGroup: number;
  onOpenMatch?: (match: TournamentMatchView) => void;
  selectable?: boolean;
  selectedEntry?: string | null;
  onSelectEntry?: (entryId: string) => void;
}) {
  const t = useTranslations("tournaments.groups");
  const { user } = useSession();
  const [view, setView] = useState<"table" | "matches">("table");

  return (
    <div className="space-y-4">
      <SegmentedControl
        label={t("viewLabel")}
        options={[
          { value: "table", label: t("standings") },
          { value: "matches", label: t("fixtures") },
        ]}
        value={view}
        onChange={setView}
        className="max-w-xs"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.id} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-title font-semibold">
                {t("name", { name: group.name })}
              </h3>
              {group.finished ? (
                <span className="inline-flex items-center gap-1 text-caption text-success-ink">
                  <Check className="size-3.5" />
                  {t("finished")}
                </span>
              ) : null}
            </div>
            {view === "table" ? (
              <LayoutGroup id={group.id}>
                <Standings
                  group={group}
                  advance={advancePerGroup}
                  selectable={selectable}
                  selectedEntry={selectedEntry}
                  onSelectEntry={onSelectEntry}
                />
              </LayoutGroup>
            ) : (
              <ul className="space-y-2">
                {[...group.matches]
                  .sort((x, y) => x.round - y.round || x.position - y.position)
                  .map((match) => (
                    <li key={match.id}>
                      <MatchRow
                        match={match}
                        viewerId={user?.id}
                        onOpen={onOpenMatch}
                        showCategory={false}
                      />
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      <p className="text-caption text-muted-foreground">
        {t("tiebreakers", { count: advancePerGroup })}
      </p>
    </div>
  );
}
