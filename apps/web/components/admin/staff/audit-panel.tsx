"use client";

import type { AuditLogItem } from "@ficc/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ScrollText } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, listItemVariants, popVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/** Page size of GET /admin/audit. */
const PAGE = 100;
const METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

function splitAction(action: string): { method: Method | null; path: string } {
  const [method, ...rest] = action.split(" ");
  return METHODS.includes(method as Method)
    ? { method: method as Method, path: rest.join(" ") }
    : { method: null, path: action };
}

function AuditRow({ entry, index }: { entry: AuditLogItem; index: number }) {
  const t = useTranslations("adminStaff.audit");
  const format = useFormat();
  const [open, setOpen] = useState(false);
  const { method, path } = splitAction(entry.action);
  const hasDetails =
    entry.details !== null &&
    entry.details !== undefined &&
    !(typeof entry.details === "object" && Object.keys(entry.details).length === 0);
  return (
    <motion.li
      custom={index % PAGE}
      variants={listItemVariants}
      initial={enter("hidden")}
      animate="show"
    >
      <motion.button
        type="button"
        whileTap={hasDetails ? tap : undefined}
        aria-expanded={hasDetails ? open : undefined}
        disabled={!hasDetails}
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-tokens enabled:hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            {method ? (
              <Badge
                tone={method === "DELETE" ? "danger" : method === "POST" ? "ballSoft" : "neutral"}
                className="h-6 px-2"
              >
                {t(`method.${method}`)}
              </Badge>
            ) : null}
            <span className="min-w-0 truncate font-mono text-caption">{path}</span>
          </span>
          <span className="block text-caption text-muted-foreground">
            {entry.actor?.name ?? t("unknownActor")} · {format.dateTime(entry.createdAt)}
          </span>
        </span>
        {hasDetails ? (
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        ) : null}
      </motion.button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.pre
            variants={popVariants}
            initial={enter("hidden")}
            animate="show"
            exit="hidden"
            className="mx-4 mb-3 max-h-64 overflow-auto rounded-md bg-surface-2 p-3 font-mono text-caption break-all whitespace-pre-wrap"
          >
            {JSON.stringify(entry.details, null, 2)}
          </motion.pre>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/** Every create, change and removal made by staff, newest first. */
export function AuditPanel() {
  const t = useTranslations("adminStaff.audit");
  const [actorId, setActorId] = useState<string | undefined>(undefined);
  const staff = useQuery({ queryKey: queryKeys.admin.staff, queryFn: api.admin.staff });
  const log = useInfiniteQuery({
    queryKey: queryKeys.admin.staffAudit(actorId),
    queryFn: ({ pageParam }) => api.admin.auditLog({ actorId, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === PAGE ? last.at(-1)?.createdAt : undefined),
  });
  const entries = log.data?.pages.flat() ?? [];

  return (
    <section className="space-y-4" aria-label={t("title")}>
      <p className="max-w-prose text-small text-muted-foreground">{t("hint")}</p>
      <ChipGroup label={t("filter")} className="no-scrollbar flex-nowrap overflow-x-auto">
        <ChoiceChip selected={actorId === undefined} onClick={() => setActorId(undefined)}>
          {t("everyone")}
        </ChoiceChip>
        {(staff.data ?? []).map((person) => (
          <ChoiceChip
            key={person.id}
            selected={actorId === person.id}
            onClick={() => setActorId(person.id)}
          >
            {person.name}
          </ChoiceChip>
        ))}
      </ChipGroup>
      {log.isError ? (
        <ErrorState onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("empty")} />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {entries.map((entry, index) => (
              <AuditRow key={entry.id} entry={entry} index={index} />
            ))}
          </ul>
          {log.hasNextPage ? (
            <Button
              variant="secondary"
              block
              loading={log.isFetchingNextPage}
              onClick={() => void log.fetchNextPage()}
            >
              {t("more")}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
