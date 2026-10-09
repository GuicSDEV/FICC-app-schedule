"use client";

import type { MatchDetail } from "@ficc/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Swords } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useRef, useState } from "react";

import { MatchCard } from "@/components/matches/match-card";
import { MatchOverlay } from "@/components/matches/match-overlay";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

/** How long the closed card stays raised: the panel's spring back takes about this long (ms). */
const RAISE_MS = 900;

function MatchList({
  title,
  matches,
  onOpen,
  highlight,
  raisedId,
}: {
  title: string;
  matches: MatchDetail[];
  onOpen: (match: MatchDetail) => void;
  highlight?: boolean;
  raisedId: string | null;
}) {
  if (matches.length === 0) return null;
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center gap-2">
        <SectionLabel>{title}</SectionLabel>
        {highlight ? (
          <Badge tone="ball" className="h-5 px-2 num">
            {matches.length}
          </Badge>
        ) : null}
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {matches.map((match, index) => (
          <motion.li
            key={match.id}
            className={match.id === raisedId ? "relative z-20" : undefined}
            custom={index}
            variants={listItemVariants}
            initial="hidden"
            animate="show"
          >
            <MatchCard match={match} onOpen={() => onOpen(match)} raised={match.id === raisedId} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function MatchesScreen() {
  const t = useTranslations("matches");
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("m");
  const query = useQuery({ queryKey: queryKeys.matchesMine, queryFn: api.matches.mine });
  const data = query.data;
  const all = data
    ? [...data.awaitingMyResponse, ...data.awaitingOpponent, ...data.disputed, ...data.recent]
    : [];

  // The open match lives in the URL (?m=…) so the back button closes it.
  const pushed = useRef(false);
  // The last opened card stays on top until the panel has morphed back into it.
  const [raisedId, setRaisedId] = useState<string | null>(null);
  const open = (match: MatchDetail) => {
    client.setQueryData(queryKeys.match(match.id), match);
    pushed.current = true;
    setRaisedId(match.id);
    router.push(`${pathname}?m=${match.id}`, { scroll: false });
  };
  const close = useCallback(() => {
    if (pushed.current) router.back();
    else router.replace(pathname, { scroll: false });
    pushed.current = false;
    setTimeout(() => setRaisedId(null), RAISE_MS);
  }, [router, pathname]);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<NotificationBell />} />
      <PullToRefresh
        onRefresh={() => client.invalidateQueries({ queryKey: queryKeys.matchesMine })}
      >
        <div className="mt-5 space-y-7">
          <ButtonLink href="/app/matches/report" block size="lg">
            <ClipboardList /> {t("report")}
          </ButtonLink>

          <LayoutGroup>
            {query.isError ? (
              <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />
            ) : !data ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[0, 1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-[7.5rem] rounded-lg" />
                ))}
              </div>
            ) : all.length === 0 ? (
              <EmptyState
                icon={Swords}
                title={t("emptyTitle")}
                description={t("emptyDescription")}
              />
            ) : (
              <>
                <MatchList
                  title={t("awaitingMe")}
                  matches={data.awaitingMyResponse}
                  onOpen={open}
                  raisedId={raisedId}
                  highlight
                />
                <MatchList
                  title={t("awaitingOpponent")}
                  matches={data.awaitingOpponent}
                  onOpen={open}
                  raisedId={raisedId}
                />
                <MatchList
                  title={t("disputed")}
                  matches={data.disputed}
                  onOpen={open}
                  raisedId={raisedId}
                />
                <MatchList
                  title={t("recent")}
                  matches={data.recent}
                  onOpen={open}
                  raisedId={raisedId}
                />
              </>
            )}

            <AnimatePresence>
              {openId ? (
                <MatchOverlay
                  key={openId}
                  id={openId}
                  initial={all.find((match) => match.id === openId)}
                  onClose={close}
                />
              ) : null}
            </AnimatePresence>
          </LayoutGroup>
        </div>
      </PullToRefresh>
    </>
  );
}

export default function MatchesPage() {
  return (
    <Suspense>
      <MatchesScreen />
    </Suspense>
  );
}
