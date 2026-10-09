"use client";

import type { DrawView, TournamentMatchView } from "@ficc/shared";
import { Minus, Plus, Trophy } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { type PointerEvent, useMemo, useRef, useState, type WheelEvent } from "react";

import { useSession } from "@/components/providers/session-provider";
import { duration, ease, spring, tap } from "@/lib/motion";
import { sideUserIds } from "@/lib/tournaments";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/** Geometry of the bracket (px). */
const CARD_W = 236;
const CARD_H = 92;
const ROW_GAP = 18;
const COL_GAP = 56;
const HEADER_H = 36;
const CHAMPION_W = 180;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;
/** How long a new winner counts as fresh (its ball is travelling). */
const FRESH_MS = 2400;

type Side = TournamentMatchView["a"];

/** Center of match `index` of round column `column` (0 = first round). */
function centerY(column: number, index: number): number {
  const unit = CARD_H + ROW_GAP;
  return HEADER_H + (index + 0.5) * unit * 2 ** column;
}

/** Elbow from the right edge of a match to the left edge of the next one. */
function connector(fromX: number, fromY: number, toX: number, toY: number): string {
  const midX = fromX + (toX - fromX) / 2;
  return `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;
}

function SideRow({
  side,
  match,
  sideKey,
  mine,
  selectable,
  selected,
  onSelect,
}: {
  side: Side;
  match: TournamentMatchView;
  sideKey: "A" | "B";
  mine: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect?: (entryId: string) => void;
}) {
  const t = useTranslations("tournaments.bracket");
  const outcomes = useTranslations("tournaments.outcomeShort");
  const won = side !== null && match.winnerEntryId === side.id;
  const lost = side !== null && match.winnerEntryId !== null && !won;
  const feeder = sideKey === "A" ? match.feederA : match.feederB;
  const games = match.sets.map((set) => (sideKey === "A" ? set.a : set.b));
  const other = match.sets.map((set) => (sideKey === "A" ? set.b : set.a));

  const content = (
    <>
      <span className="w-5 shrink-0 text-right num text-caption text-muted-foreground">
        {side?.seed ?? ""}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left text-small",
          won
            ? "font-semibold text-foreground"
            : lost
              ? "text-muted-foreground"
              : "text-foreground",
          !side && "text-caption text-muted-foreground italic",
        )}
      >
        {side
          ? side.name
          : match.outcome === "BYE"
            ? t("bye")
            : feeder
              ? t("winnerOf", { number: feeder.position + 1 })
              : t("tbd")}
      </span>
      {won && match.outcome && match.outcome !== "PLAYED" && match.outcome !== "BYE" ? (
        <span className="rounded-sm bg-surface-3 px-1 text-[0.625rem] font-semibold text-muted-foreground uppercase">
          {outcomes(match.outcome)}
        </span>
      ) : null}
      <span className="flex shrink-0 gap-1.5 num text-small">
        {games.map((value, index) => (
          <span
            key={index}
            className={cn(
              "w-4 text-center",
              value > (other[index] ?? 0)
                ? "font-semibold text-foreground"
                : "text-muted-foreground",
            )}
          >
            {value}
          </span>
        ))}
      </span>
    </>
  );

  const classes = cn(
    "flex h-8 w-full items-center gap-2 rounded-md px-2",
    mine && "bg-ball-soft",
    selected && "ring-2 ring-primary",
  );

  if (selectable && side && onSelect) {
    return (
      <motion.button
        type="button"
        whileTap={tap}
        aria-pressed={selected}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(side.id);
        }}
        className={cn(classes, "hover:bg-surface-2")}
      >
        {content}
      </motion.button>
    );
  }
  return <div className={classes}>{content}</div>;
}

function MatchBox({
  match,
  viewerId,
  onOpen,
  selectable,
  selectedEntry,
  onSelectEntry,
}: {
  match: TournamentMatchView;
  viewerId?: string;
  onOpen?: (match: TournamentMatchView) => void;
  selectable: boolean;
  selectedEntry: string | null;
  onSelectEntry?: (entryId: string) => void;
}) {
  const t = useTranslations("tournaments.bracket");
  const format = useFormat();
  const mineA = viewerId !== undefined && sideUserIds(match.a).includes(viewerId);
  const mineB = viewerId !== undefined && sideUserIds(match.b).includes(viewerId);
  const status =
    match.resultStatus === "REPORTED"
      ? t("awaitingConfirmation")
      : match.winnerEntryId
        ? null
        : match.schedule
          ? `${format.day(match.schedule.date)} · ${match.schedule.startTime} · ${match.schedule.courtName}`
          : null;
  const clickable =
    Boolean(onOpen) && match.outcome !== "BYE" && match.a !== null && match.b !== null;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpen?.(match) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen?.(match);
              }
            }
          : undefined
      }
      className={cn(
        "flex h-full flex-col justify-center gap-0.5 rounded-lg border bg-card p-1.5 shadow-card transition-tokens",
        mineA || mineB ? "border-primary/60" : "border-border",
        match.overdue && "border-warning",
        clickable &&
          "cursor-pointer hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none",
      )}
    >
      <SideRow
        side={match.a}
        match={match}
        sideKey="A"
        mine={mineA}
        selectable={selectable}
        selected={selectedEntry !== null && match.a?.id === selectedEntry}
        onSelect={onSelectEntry}
      />
      <SideRow
        side={match.b}
        match={match}
        sideKey="B"
        mine={mineB}
        selectable={selectable}
        selected={selectedEntry !== null && match.b?.id === selectedEntry}
        onSelect={onSelectEntry}
      />
      {status ? (
        <span className="truncate px-2 text-[0.6875rem] text-muted-foreground">{status}</span>
      ) : null}
    </div>
  );
}

/** A winner travelling along its connector to the next round. */
function TravellingBall({ path, delay }: { path: string; delay: number }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 size-3 rounded-full bg-ball shadow-glow"
      style={{ offsetPath: `path("${path}")`, offsetRotate: "0deg" }}
      initial={{ offsetDistance: "0%", opacity: 1 }}
      animate={{ offsetDistance: "100%", opacity: [1, 1, 0] }}
      transition={{ duration: duration.slow * 2.2, ease: ease.inOut, delay }}
    />
  );
}

/**
 * Knockout bracket: one column per round, SVG elbows between matches, horizontal scroll and
 * pinch / ctrl-wheel zoom. When a result comes in (live), the winner's connector lights up and a
 * ball travels to the next round.
 */
export function BracketView({
  draw,
  onOpenMatch,
  selectable = false,
  selectedEntry = null,
  onSelectEntry,
  className,
}: {
  draw: Pick<DrawView, "rounds" | "championEntryId">;
  onOpenMatch?: (match: TournamentMatchView) => void;
  /** Organizer swap mode: first-round entries are tappable. */
  selectable?: boolean;
  selectedEntry?: string | null;
  onSelectEntry?: (entryId: string) => void;
  className?: string;
}) {
  const t = useTranslations("tournaments.bracket");
  const labels = useTranslations("labels");
  const { user } = useSession();
  const reduce = useReducedMotion();
  const [zoom, setZoom] = useState(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const rounds = useMemo(
    () =>
      [...draw.rounds]
        .sort((x, y) => x.round - y.round)
        .map((round) => ({
          ...round,
          matches: [...round.matches].sort((x, y) => x.position - y.position),
        })),
    [draw.rounds],
  );
  const firstCount = rounds[0]?.matches.length ?? 0;
  const final = rounds.at(-1)?.matches[0];
  const champion =
    draw.championEntryId && final
      ? ([final.a, final.b].find((side) => side?.id === draw.championEntryId) ?? null)
      : null;

  const width = rounds.length * (CARD_W + COL_GAP) + CHAMPION_W;
  const height = HEADER_H + firstCount * (CARD_H + ROW_GAP);

  // When each winner was first seen: winners that arrive while the bracket is open travel for a
  // moment; the ones already there on the first render are drawn lit at once.
  const firstSeen = useRef<Map<string, number> | null>(null);
  const decided = rounds.flatMap((round) =>
    round.matches
      .filter((match) => match.winnerEntryId)
      .map((match) => `${match.id}:${match.winnerEntryId}`),
  );
  const now = Date.now();
  if (firstSeen.current === null) firstSeen.current = new Map(decided.map((key) => [key, 0]));
  for (const key of decided) if (!firstSeen.current.has(key)) firstSeen.current.set(key, now);
  const fresh = new Set(
    decided.filter((key) => now - (firstSeen.current?.get(key) ?? 0) < FRESH_MS),
  );

  const lines: { key: string; d: string; lit: boolean; fresh: boolean }[] = [];
  rounds.forEach((round, column) => {
    if (column === 0) return;
    round.matches.forEach((match, index) => {
      const toX = column * (CARD_W + COL_GAP);
      const toY = centerY(column, index);
      const feeders = rounds[column - 1]!.matches.slice(index * 2, index * 2 + 2);
      feeders.forEach((feeder, offset) => {
        const fromX = (column - 1) * (CARD_W + COL_GAP) + CARD_W;
        const fromY = centerY(column - 1, index * 2 + offset);
        const lit = feeder.winnerEntryId !== null && feeder.outcome !== "BYE";
        lines.push({
          key: `${feeder.id}-${match.id}`,
          d: connector(fromX, fromY, toX, toY),
          lit,
          fresh: lit && fresh.has(`${feeder.id}:${feeder.winnerEntryId}`),
        });
      });
    });
  });
  if (final) {
    const fromX = (rounds.length - 1) * (CARD_W + COL_GAP) + CARD_W;
    const y = centerY(rounds.length - 1, 0);
    const lit = final.winnerEntryId !== null;
    lines.push({
      key: "champion",
      d: `M ${fromX} ${y} H ${fromX + COL_GAP}`,
      lit,
      fresh: lit && fresh.has(`${final.id}:${final.winnerEntryId}`),
    });
  }

  const clamp = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y), zoom };
    }
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [p1, p2] = [...pointers.current.values()];
      const distance = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
      setZoom(clamp((pinch.current.zoom * distance) / pinch.current.distance));
    }
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }
  function onWheel(event: WheelEvent<HTMLDivElement>) {
    // Trackpad pinch arrives as ctrl + wheel.
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom((current) => clamp(current * (event.deltaY < 0 ? 1.08 : 0.92)));
  }

  if (rounds.length === 0) return null;

  return (
    <div className={cn("relative", className)}>
      <div className="absolute right-2 bottom-2 z-10 flex items-center gap-1 rounded-full border border-border bg-surface/90 p-1 shadow-card backdrop-blur">
        <motion.button
          type="button"
          whileTap={tap}
          onClick={() => setZoom((current) => clamp(current - 0.15))}
          aria-label={t("zoomOut")}
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <Minus className="size-4" />
        </motion.button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="h-11 w-12 num text-caption text-muted-foreground"
          aria-label={t("zoomReset")}
        >
          {Math.round(zoom * 100)}%
        </button>
        <motion.button
          type="button"
          whileTap={tap}
          onClick={() => setZoom((current) => clamp(current + 0.15))}
          aria-label={t("zoomIn")}
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <Plus className="size-4" />
        </motion.button>
      </div>
      <div
        className="no-scrollbar max-h-[75dvh] [touch-action:pan-x_pan-y] overflow-auto rounded-lg border border-border bg-surface-2/40"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="region"
        aria-label={t("label")}
      >
        <div style={{ width: (width + 32) * zoom, height: (height + 32) * zoom }}>
          <div
            className="relative origin-top-left p-4"
            style={{ width: width + 32, height: height + 32, transform: `scale(${zoom})` }}
          >
            <div className="relative" style={{ width, height }}>
              {rounds.map((round, column) => (
                <p
                  key={round.round}
                  className="absolute top-0 truncate text-caption font-medium tracking-[0.08em] text-muted-foreground uppercase"
                  style={{ left: column * (CARD_W + COL_GAP), width: CARD_W }}
                >
                  {labels(`round.${round.name}`)}
                </p>
              ))}
              <p
                className="absolute top-0 text-caption font-medium tracking-[0.08em] text-gold uppercase"
                style={{ left: rounds.length * (CARD_W + COL_GAP), width: CHAMPION_W }}
              >
                {t("champion")}
              </p>

              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-visible"
                width={width}
                height={height}
              >
                {lines.map((line) => (
                  <path
                    key={`${line.key}-base`}
                    d={line.d}
                    fill="none"
                    strokeWidth={1.5}
                    className="stroke-border-strong"
                  />
                ))}
                {lines
                  .filter((line) => line.lit)
                  .map((line) => (
                    <motion.path
                      key={`${line.key}-lit`}
                      d={line.d}
                      fill="none"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      className="stroke-ball-ink"
                      initial={line.fresh && !reduce ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: duration.slow * 2.2, ease: ease.inOut }}
                    />
                  ))}
              </svg>
              {reduce
                ? null
                : lines
                    .filter((line) => line.fresh)
                    .map((line, index) => (
                      <TravellingBall key={`${line.key}-ball`} path={line.d} delay={index * 0.12} />
                    ))}

              {rounds.map((round, column) =>
                round.matches.map((match, index) => (
                  <div
                    key={match.id}
                    className="absolute"
                    style={{
                      left: column * (CARD_W + COL_GAP),
                      top: centerY(column, index) - CARD_H / 2,
                      width: CARD_W,
                      height: CARD_H,
                    }}
                  >
                    <MatchBox
                      match={match}
                      viewerId={user?.id}
                      onOpen={onOpenMatch}
                      selectable={selectable && column === 0}
                      selectedEntry={selectedEntry}
                      onSelectEntry={onSelectEntry}
                    />
                  </div>
                )),
              )}

              <div
                className="absolute flex items-center"
                style={{
                  left: rounds.length * (CARD_W + COL_GAP),
                  top: centerY(rounds.length - 1, 0) - 36,
                  width: CHAMPION_W,
                  height: 72,
                }}
              >
                {champion ? (
                  <motion.div
                    initial={fresh.size > 0 && !reduce ? { scale: 0.6, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ ...spring.snappy, delay: fresh.size > 0 ? duration.slow * 2 : 0 }}
                    className="flex w-full items-center gap-2 rounded-lg border border-gold/50 bg-card px-3 py-2 shadow-card"
                  >
                    <Trophy className="size-5 shrink-0 text-gold" aria-hidden />
                    <span className="min-w-0 truncate text-small font-semibold">
                      {champion.name}
                    </span>
                  </motion.div>
                ) : (
                  <div className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-caption text-muted-foreground">
                    <Trophy className="size-4 shrink-0" aria-hidden />
                    {t("tbd")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
