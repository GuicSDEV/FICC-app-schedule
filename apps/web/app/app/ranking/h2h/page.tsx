"use client";

import type { H2HResponse, H2HSideStats, PlayerSummary } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Swords, UserRoundPlus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";

import { EloChart } from "@/components/charts/elo-chart-lazy";
import { MemberPicker } from "@/components/members/member-picker";
import { useSession } from "@/components/providers/session-provider";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, SectionLabel } from "@/components/ui/card";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, listItemVariants, spring, tap, transitions } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/** Ink variants keep AA contrast for text, bars and lines in both themes. */
const COLOR_A = "var(--ball-ink)";
const COLOR_B = "var(--lesson-ink)";

/** Button showing a chosen player (or a prompt) that opens the member search. */
function PlayerSlot({
  player,
  color,
  label,
  onClick,
}: {
  player: PlayerSummary | null;
  color: string;
  label: string;
  onClick: () => void;
}) {
  const t = useTranslations("h2h");
  return (
    <motion.button
      type="button"
      whileTap={tap}
      onClick={onClick}
      aria-label={player ? t("change", { name: player.name }) : label}
      className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg border border-border bg-card p-3 text-center transition-tokens hover:bg-surface-2"
    >
      {player ? (
        <Avatar name={player.name} src={player.photoUrl} size="lg" ring={color} />
      ) : (
        <span className="flex size-14 items-center justify-center rounded-full border border-dashed border-border-strong text-muted-foreground">
          <UserRoundPlus className="size-6" />
        </span>
      )}
      <span className="w-full truncate text-small font-semibold">
        {player ? player.name : label}
      </span>
      <span className="num text-caption text-muted-foreground">
        {player ? player.elo : t("tapToChoose")}
      </span>
    </motion.button>
  );
}

/** One stat with both values and a bar split by share (A left, B right). */
function CompareRow({
  label,
  a,
  b,
  format = (value) => String(value),
}: {
  label: string;
  a: number;
  b: number;
  format?: (value: number) => string;
}) {
  const total = a + b;
  const share = total === 0 ? 0.5 : a / total;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <NumberTicker
          value={a}
          from={0}
          format={format}
          className={cn(
            "text-title font-semibold",
            a >= b ? "text-foreground" : "text-muted-foreground",
          )}
        />
        <span className="text-caption text-muted-foreground">{label}</span>
        <NumberTicker
          value={b}
          from={0}
          format={format}
          className={cn(
            "text-title font-semibold",
            b >= a ? "text-foreground" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="flex h-1.5 gap-1 overflow-hidden rounded-full">
        <motion.span
          className="h-full origin-right rounded-full"
          style={{ background: COLOR_A, width: `${share * 100}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={transitions.slow}
        />
        <motion.span
          className="h-full flex-1 origin-left rounded-full"
          style={{ background: COLOR_B }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={transitions.slow}
        />
      </div>
    </div>
  );
}

function Comparison({ data }: { data: H2HResponse }) {
  const t = useTranslations("h2h");
  const common = useTranslations("common");
  const labels = useTranslations("labels");
  const format = useFormat();
  const first = (side: H2HSideStats) => side.player.name.split(" ")[0] ?? side.player.name;

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-5">
        <div className="text-center">
          <SectionLabel>{t("record")}</SectionLabel>
          <p className="mt-1 font-display text-display font-bold">
            <span style={{ color: COLOR_A }}>{data.a.h2hWins}</span>
            <span className="mx-3 text-muted-foreground">–</span>
            <span style={{ color: COLOR_B }}>{data.b.h2hWins}</span>
          </p>
          <p className="text-small text-muted-foreground">
            {t("meetings", { count: data.meetings })}
          </p>
        </div>
        <CompareRow label={t("elo")} a={data.a.player.elo} b={data.b.player.elo} />
        <CompareRow
          label={t("winRate")}
          a={data.a.winRate}
          b={data.b.winRate}
          format={(value) => `${value}%`}
        />
        <CompareRow label={t("matches")} a={data.a.matches} b={data.b.matches} />
      </Card>

      <section className="space-y-3" aria-label={t("history")}>
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>{t("history")}</SectionLabel>
          <span className="flex items-center gap-3 text-caption">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: COLOR_A }} />
              {first(data.a)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: COLOR_B }} />
              {first(data.b)}
            </span>
          </span>
        </div>
        <Card className="p-3">
          <EloChart
            label={t("chartLabel", { a: data.a.player.name, b: data.b.player.name })}
            series={[
              { key: "a", label: data.a.player.name, color: COLOR_A, points: data.a.history },
              { key: "b", label: data.b.player.name, color: COLOR_B, points: data.b.history },
            ]}
          />
        </Card>
      </section>

      <section className="space-y-3" aria-label={t("surfaces")}>
        <SectionLabel>{t("surfaces")}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {(["HARTRU", "SAIBRO"] as const).map((surface) => {
            const split = data.surfaces[surface];
            return (
              <Card key={surface} className="space-y-2 p-4">
                <Badge tone={surface === "HARTRU" ? "hartru" : "saibro"}>
                  {labels(`surface.${surface}`)}
                </Badge>
                <p className="num text-headline font-bold">
                  <span style={{ color: COLOR_A }}>{split.aWins}</span>
                  <span className="mx-1.5 text-muted-foreground">–</span>
                  <span style={{ color: COLOR_B }}>{split.bWins}</span>
                </p>
                <p className="text-caption text-muted-foreground">
                  {t("played", { count: split.played })}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-label={t("lastMeetings")}>
        <SectionLabel>{t("lastMeetings")}</SectionLabel>
        {data.lastMeetings.length === 0 ? (
          <EmptyState icon={Swords} title={t("neverMet")} description={t("neverMetDescription")} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {data.lastMeetings.map((meeting, index) => (
              <motion.li
                key={meeting.matchId}
                custom={index}
                variants={listItemVariants}
                initial={enter("hidden")}
                animate="show"
              >
                <Link
                  href={`/app/matches/${meeting.matchId}`}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-tokens hover:bg-surface-2"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: meeting.winner === "a" ? COLOR_A : COLOR_B }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-medium">
                      {t("wonBy", { name: meeting.winner === "a" ? first(data.a) : first(data.b) })}
                    </span>
                    <span className="block text-caption text-muted-foreground">
                      {format.dayTitle(meeting.playedOn)} ·{" "}
                      {meeting.format === "SINGLES" ? common("singles") : common("doubles")} ·{" "}
                      {labels(`surface.${meeting.surface}`)}
                    </span>
                  </span>
                  <span className="shrink-0 num text-small font-semibold">{meeting.score}</span>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function H2HScreen() {
  const t = useTranslations("h2h");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useSession();
  const aId = params.get("a") ?? (user?.role === "MEMBER" ? user.id : null);
  const bId = params.get("b");
  const [choosing, setChoosing] = useState<"a" | "b" | null>(null);

  const ready = Boolean(aId && bId && aId !== bId);
  const query = useQuery({
    queryKey: queryKeys.h2h(aId ?? "", bId ?? ""),
    queryFn: () => api.ranking.h2h(aId!, bId!),
    enabled: ready,
  });
  // Show players from the comparison once loaded; until then fetch the chosen ones' profiles.
  const profileA = useQuery({
    queryKey: queryKeys.player(aId ?? ""),
    queryFn: () => api.ranking.profile(aId!),
    enabled: Boolean(aId) && !query.data,
  });
  const profileB = useQuery({
    queryKey: queryKeys.player(bId ?? ""),
    queryFn: () => api.ranking.profile(bId!),
    enabled: Boolean(bId) && !query.data,
  });
  const playerA = query.data?.a.player ?? profileA.data?.player ?? null;
  const playerB = query.data?.b.player ?? profileB.data?.player ?? null;

  function pick(slot: "a" | "b", player: PlayerSummary) {
    const next = new URLSearchParams(params.toString());
    if (slot === "a" && !next.get("a") && aId) next.set("a", aId);
    next.set(slot, player.id);
    setChoosing(null);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function swap() {
    if (!aId || !bId) return;
    router.replace(`${pathname}?a=${bId}&b=${aId}`, { scroll: false });
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        leading={<BackButton fallback="/app/ranking" />}
      />
      <div className="mx-auto mt-5 max-w-2xl space-y-6">
        <div className="flex items-stretch gap-2">
          <PlayerSlot
            player={playerA}
            color={COLOR_A}
            label={t("choosePlayer")}
            onClick={() => setChoosing("a")}
          />
          <motion.button
            type="button"
            whileTap={tap}
            transition={spring.snappy}
            onClick={swap}
            disabled={!ready}
            aria-label={t("swap")}
            className="inline-flex size-11 shrink-0 items-center justify-center self-center rounded-full border border-border bg-surface-2 text-muted-foreground disabled:opacity-40"
          >
            <ArrowLeftRight className="size-4" />
          </motion.button>
          <PlayerSlot
            player={playerB}
            color={COLOR_B}
            label={t("chooseOpponent")}
            onClick={() => setChoosing("b")}
          />
        </div>

        {!ready ? (
          <EmptyState icon={Swords} title={t("pickTitle")} description={t("pickDescription")} />
        ) : query.isError ? (
          <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-60 rounded-lg" />
          </div>
        ) : (
          <Comparison data={query.data} />
        )}
      </div>

      <Sheet
        open={choosing !== null}
        onOpenChange={(open) => !open && setChoosing(null)}
        title={choosing === "a" ? t("choosePlayer") : t("chooseOpponent")}
      >
        <MemberPicker
          label={t("search")}
          selected={[]}
          onChange={(players) => players[0] && choosing && pick(choosing, players[0])}
          max={1}
          excludeIds={[aId, bId].filter((id): id is string => Boolean(id))}
        />
      </Sheet>
    </>
  );
}

export default function H2HPage() {
  return (
    <Suspense>
      <H2HScreen />
    </Suspense>
  );
}
