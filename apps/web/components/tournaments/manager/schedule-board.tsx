"use client";

import type { ScheduleBoard, TournamentDetail, TournamentMatchView } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CloudRain, Send, Sparkles, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { type DragEvent, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { haptic, sheetVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { datesBetween, invalidateTournament } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

import { useStageLabel } from "../match-row";

const DRAG_TYPE = "application/x-ficc-match";

/** First names of both sides: "Ana × Bia". */
function short(match: TournamentMatchView): string {
  const side = (entry: TournamentMatchView["a"]) =>
    entry ? entry.players.map((player) => player.name.split(" ")[0]).join("/") : "?";
  return `${side(match.a)} × ${side(match.b)}`;
}

function UnscheduledCard({
  match,
  selected,
  onSelect,
}: {
  match: TournamentMatchView;
  selected: boolean;
  onSelect: () => void;
}) {
  const stage = useStageLabel();
  return (
    <button
      type="button"
      draggable
      onDragStart={(event: DragEvent<HTMLButtonElement>) => {
        event.dataTransfer.setData(DRAG_TYPE, match.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full cursor-grab rounded-md border p-2.5 text-left transition-tokens active:cursor-grabbing",
        selected ? "border-primary bg-ball-soft" : "border-border bg-card hover:bg-surface-2",
      )}
    >
      <span className="block truncate text-small font-medium">{short(match)}</span>
      <span className="block truncate text-caption text-muted-foreground">
        {match.categoryName} · {stage(match)}
      </span>
    </button>
  );
}

/**
 * Order-of-play board for one day: courts × time slots with bookings, lessons and rain freezes
 * blocked. Tap a match then a free slot (or drag it on desktop); auto-schedule fills the gaps
 * respecting availability and rest; publishing notifies the players.
 */
export function ScheduleBoardView({ tournament }: { tournament: TournamentDetail }) {
  const t = useTranslations("tournaments.board");
  const format = useFormat();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const days = datesBetween(tournament.startDate, tournament.endDate);
  const [date, setDate] = useState(days[0] ?? tournament.startDate);
  const [selected, setSelected] = useState<TournamentMatchView | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoDays, setAutoDays] = useState<string[]>([]);

  const board = useQuery({
    queryKey: queryKeys.tournaments.board(tournament.id, date),
    queryFn: () => api.tournaments.board(tournament.id, date),
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["tournaments", tournament.id, "board"] });
    void client.invalidateQueries({ queryKey: queryKeys.tournaments.orderOfPlay(tournament.id) });
    void client.invalidateQueries({ queryKey: queryKeys.tournaments.pending(tournament.id) });
    void invalidateTournament(client, tournament.id);
  };

  const place = useMutation({
    mutationFn: (input: { matchId: string; courtId: string; timeSlotId: string }) =>
      api.tournamentMatches.schedule(input.matchId, {
        date,
        courtId: input.courtId,
        timeSlotId: input.timeSlotId,
      }),
    onSuccess: () => {
      haptic(10);
      setSelected(null);
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const unschedule = useMutation({
    mutationFn: (matchId: string) => api.tournamentMatches.unschedule(matchId),
    onSuccess: () => {
      setSelected(null);
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const auto = useMutation({
    mutationFn: (dates: string[]) => api.tournaments.autoSchedule(tournament.id, { dates }),
    onSuccess: (result) => {
      haptic([10, 30, 10]);
      setAutoOpen(false);
      toast.success(t("autoDone", { count: result.scheduled }), {
        description:
          result.unscheduled.length > 0
            ? t("autoLeft", { count: result.unscheduled.length })
            : undefined,
      });
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const publish = useMutation({
    mutationFn: () => api.tournaments.publishDay(tournament.id, date),
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success(t("publishedDay", { day: format.dayTitle(date) }));
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const rescheduleFrozen = useMutation({
    mutationFn: () =>
      api.tournaments.rescheduleFrozen(tournament.id, { dates: days.filter((day) => day >= date) }),
    onSuccess: (result) => {
      toast.success(t("frozenMoved", { count: result.moved }), {
        description:
          result.unscheduled.length > 0
            ? t("autoLeft", { count: result.unscheduled.length })
            : undefined,
      });
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  const data: ScheduleBoard | undefined = board.data;
  const matchById = new Map(
    [...(data?.scheduled ?? []), ...(data?.unscheduled ?? [])].map((match) => [match.id, match]),
  );
  const frozenCount = (data?.scheduled ?? []).filter((match) => match.frozen).length;

  function dropOn(courtId: string, timeSlotId: string, matchId: string) {
    if (place.isPending) return;
    place.mutate({ matchId, courtId, timeSlotId });
  }

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label={t("days")}
        className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
      >
        {days.map((day) => (
          <ChoiceChip
            key={day}
            selected={day === date}
            onClick={() => {
              setDate(day);
              setSelected(null);
            }}
          >
            {format.dayTitle(day)}
          </ChoiceChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setAutoDays([date]);
            setAutoOpen(true);
          }}
        >
          <Sparkles />
          {t("auto")}
        </Button>
        <Button
          size="sm"
          loading={publish.isPending}
          disabled={!data || data.scheduled.length === 0}
          onClick={() => publish.mutate()}
        >
          <Send />
          {data?.published ? t("republish") : t("publish")}
        </Button>
        {frozenCount > 0 ? (
          <Button
            size="sm"
            variant="dangerSoft"
            loading={rescheduleFrozen.isPending}
            onClick={() => rescheduleFrozen.mutate()}
          >
            <CloudRain />
            {t("rescheduleFrozen", { count: frozenCount })}
          </Button>
        ) : null}
        {data ? (
          data.published ? (
            <Badge tone="success">{t("isPublished")}</Badge>
          ) : (
            <Badge tone="warning">{t("isDraft")}</Badge>
          )
        ) : null}
      </div>

      {board.isError ? (
        <ErrorState onRetry={() => void board.refetch()} />
      ) : !data ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <section className="space-y-2">
            <SectionLabel>{t("unscheduled", { count: data.unscheduled.length })}</SectionLabel>
            {data.unscheduled.length === 0 ? (
              <p className="text-small text-muted-foreground">{t("allScheduled")}</p>
            ) : (
              <div className="no-scrollbar flex gap-2 overflow-x-auto lg:max-h-[32rem] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
                {data.unscheduled.map((match) => (
                  <div key={match.id} className="w-56 shrink-0 lg:w-auto">
                    <UnscheduledCard
                      match={match}
                      selected={selected?.id === match.id}
                      onSelect={() =>
                        setSelected((current) => (current?.id === match.id ? null : match))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="hidden text-caption text-muted-foreground lg:block">{t("dragHint")}</p>
          </section>

          <section className="min-w-0 space-y-2">
            <SectionLabel>{format.longDayTitle(date)}</SectionLabel>
            <div className="no-scrollbar overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-max border-collapse text-caption">
                <thead>
                  <tr className="bg-surface-2">
                    <th className="sticky left-0 z-10 w-16 bg-surface-2 px-2 py-2 text-left font-medium text-muted-foreground">
                      {t("time")}
                    </th>
                    {data.courts.map((court) => (
                      <th
                        key={court.id}
                        className="min-w-[8.5rem] px-2 py-2 text-left font-semibold"
                      >
                        {court.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slots.map((slot) => (
                    <tr key={slot.id} className="border-t border-border">
                      <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 num text-muted-foreground">
                        {slot.startTime}
                      </td>
                      {data.courts.map((court) => {
                        const cell = data.cells.find(
                          (item) => item.courtId === court.id && item.timeSlotId === slot.id,
                        );
                        const key = `${court.id}:${slot.id}`;
                        const match = cell?.matchId ? matchById.get(cell.matchId) : undefined;
                        const free = cell?.state === "free" && !cell.past;
                        const target = free && selected !== null;
                        return (
                          <td key={court.id} className="p-1">
                            {match ? (
                              <button
                                type="button"
                                draggable={!match.winnerEntryId}
                                onDragStart={(event: DragEvent<HTMLButtonElement>) => {
                                  event.dataTransfer.setData(DRAG_TYPE, match.id);
                                }}
                                onClick={() =>
                                  setSelected((current) =>
                                    current?.id === match.id ? null : match,
                                  )
                                }
                                aria-pressed={selected?.id === match.id}
                                className={cn(
                                  "flex h-12 w-full flex-col justify-center rounded-md border px-2 text-left",
                                  match.frozen
                                    ? "border-lesson bg-lesson-soft text-lesson-ink"
                                    : match.winnerEntryId
                                      ? "border-border bg-surface-2 text-muted-foreground"
                                      : "border-gold/50 bg-gold/10",
                                  selected?.id === match.id && "ring-2 ring-primary",
                                )}
                              >
                                <span className="truncate font-medium">{short(match)}</span>
                                <span className="truncate text-[0.6875rem] opacity-80">
                                  {match.categoryName}
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!target}
                                onClick={() => selected && dropOn(court.id, slot.id, selected.id)}
                                onDragOver={(event) => {
                                  if (!free) return;
                                  event.preventDefault();
                                  setDropTarget(key);
                                }}
                                onDragLeave={() =>
                                  setDropTarget((current) => (current === key ? null : current))
                                }
                                onDrop={(event) => {
                                  event.preventDefault();
                                  setDropTarget(null);
                                  const id = event.dataTransfer.getData(DRAG_TYPE);
                                  if (id && free) dropOn(court.id, slot.id, id);
                                }}
                                aria-label={
                                  free
                                    ? t("placeHere", { court: court.name, time: slot.startTime })
                                    : !cell || cell.past
                                      ? t("pastCell")
                                      : t(`cell.${cell.state}`)
                                }
                                className={cn(
                                  "flex h-12 w-full items-center justify-center rounded-md border text-[0.6875rem] transition-tokens",
                                  !cell || cell.past
                                    ? "border-transparent bg-surface-2/40 text-muted-foreground/60"
                                    : cell.state === "free"
                                      ? cn(
                                          "border-dashed border-border-strong",
                                          target &&
                                            "border-primary bg-ball-soft/60 hover:bg-ball-soft",
                                          dropTarget === key && "border-primary bg-ball-soft",
                                        )
                                      : cell.state === "frozen"
                                        ? "border-transparent bg-lesson-soft text-lesson-ink"
                                        : cell.state === "lesson"
                                          ? "border-transparent bg-lesson-soft/60 text-lesson-ink"
                                          : "border-transparent bg-surface-3 text-muted-foreground",
                                )}
                              >
                                {cell && !cell.past && cell.state !== "free"
                                  ? t(`cell.${cell.state}`)
                                  : null}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <AnimatePresence>
        {selected ? (
          <motion.div
            key="selection"
            variants={sheetVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-center gap-2 rounded-xl border border-border bg-surface p-3 shadow-raised md:bottom-6"
          >
            <CalendarClock className="size-5 shrink-0 text-ball-ink" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-medium">{short(selected)}</p>
              <p className="truncate text-caption text-muted-foreground">
                {selected.schedule ? t("moveHint") : t("placeHint")}
              </p>
            </div>
            {selected.schedule && !selected.winnerEntryId ? (
              <Button
                size="sm"
                variant="secondary"
                loading={unschedule.isPending}
                onClick={() => unschedule.mutate(selected.id)}
              >
                <Undo2 />
                {t("unschedule")}
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("cancelSelection")}
              onClick={() => setSelected(null)}
            >
              <X />
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Sheet
        open={autoOpen}
        onOpenChange={setAutoOpen}
        title={t("autoTitle")}
        description={t("autoDescription")}
        footer={
          <Button
            size="lg"
            block
            loading={auto.isPending}
            disabled={autoDays.length === 0}
            onClick={() => auto.mutate(autoDays)}
          >
            <Sparkles />
            {t("autoRun", { count: autoDays.length })}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {days.map((day) => (
            <ChoiceChip
              key={day}
              selected={autoDays.includes(day)}
              showCheck
              onClick={() =>
                setAutoDays((current) =>
                  current.includes(day)
                    ? current.filter((item) => item !== day)
                    : [...current, day].sort(),
                )
              }
            >
              {format.dayTitle(day)}
            </ChoiceChip>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
