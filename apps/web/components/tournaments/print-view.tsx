"use client";

import type { DrawView, OrderOfPlay, PublicTournament, TournamentMatchView } from "@ficc/shared";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { useFormat } from "@/lib/use-format";

import { useStageLabel } from "./match-row";

type Side = TournamentMatchView["a"];

function SideName({
  side,
  match,
  sideKey,
}: {
  side: Side;
  match: TournamentMatchView;
  sideKey: "A" | "B";
}) {
  const t = useTranslations("tournaments.bracket");
  const won = side !== null && side.id === match.winnerEntryId;
  const feeder = sideKey === "A" ? match.feederA : match.feederB;
  return (
    <div className="flex items-center justify-between gap-2 px-1.5 py-0.5">
      <span className={won ? "truncate font-bold" : "truncate"}>
        {side ? (
          <>
            {side.seed ? <span className="mr-1 text-neutral-500">[{side.seed}]</span> : null}
            {side.name}
          </>
        ) : match.outcome === "BYE" ? (
          <span className="text-neutral-400 italic">{t("bye")}</span>
        ) : (
          <span className="text-neutral-400 italic">
            {feeder ? t("winnerOf", { number: feeder.position + 1 }) : t("tbd")}
          </span>
        )}
      </span>
      <span className="shrink-0 tabular-nums">
        {match.sets.map((set) => (sideKey === "A" ? set.a : set.b)).join(" ")}
      </span>
    </div>
  );
}

function PrintMatch({ match }: { match: TournamentMatchView }) {
  return (
    <div className="break-inside-avoid rounded border border-neutral-400 bg-white text-[10px] leading-tight">
      <SideName side={match.a} match={match} sideKey="A" />
      <div className="border-t border-neutral-300" />
      <SideName side={match.b} match={match} sideKey="B" />
    </div>
  );
}

function PrintDraw({ draw }: { draw: DrawView }) {
  const t = useTranslations("tournaments");
  const labels = useTranslations("labels");
  const groups = useTranslations("tournaments.groups");
  const rounds = [...draw.rounds].sort((x, y) => x.round - y.round);
  return (
    <div className="space-y-6">
      {draw.groups.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {draw.groups.map((group) => (
            <div key={group.id} className="break-inside-avoid space-y-2">
              <p className="font-bold">{groups("name", { name: group.name })}</p>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-neutral-400 text-left">
                    <th className="py-0.5">#</th>
                    <th>{groups("entry")}</th>
                    <th className="text-center">{groups("played")}</th>
                    <th className="text-center">{groups("wins")}</th>
                    <th className="text-center">{groups("sets")}</th>
                    <th className="text-center">{groups("games")}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.standings.map((row) => (
                    <tr key={row.entryId} className="border-b border-neutral-200">
                      <td className="py-0.5">{row.position}</td>
                      <td>{row.entry.name}</td>
                      <td className="text-center">{row.played}</td>
                      <td className="text-center">{row.wins}</td>
                      <td className="text-center">
                        {row.setsWon}-{row.setsLost}
                      </td>
                      <td className="text-center">
                        {row.gamesWon}-{row.gamesLost}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-2 gap-1">
                {group.matches.map((match) => (
                  <PrintMatch key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {rounds.length > 0 ? (
        <div
          className="flex gap-3"
          style={{ minHeight: Math.max(240, (rounds[0]?.matches.length ?? 1) * 46) }}
        >
          {rounds.map((round) => (
            <div key={round.round} className="flex min-w-0 flex-1 flex-col">
              <p className="mb-1 text-center text-[10px] font-bold uppercase">
                {labels(`round.${round.name}`)}
              </p>
              <div className="flex flex-1 flex-col justify-around gap-1">
                {[...round.matches]
                  .sort((x, y) => x.position - y.position)
                  .map((match) => (
                    <PrintMatch key={match.id} match={match} />
                  ))}
              </div>
            </div>
          ))}
          <div className="flex w-28 shrink-0 flex-col">
            <p className="mb-1 text-center text-[10px] font-bold uppercase">
              {t("bracket.champion")}
            </p>
            <div className="flex flex-1 items-center">
              <div className="w-full rounded border-2 border-neutral-800 px-2 py-1 text-center text-[11px] font-bold">
                {(() => {
                  const final = rounds.at(-1)?.matches[0];
                  return (
                    [final?.a, final?.b].find((side) => side?.id === draw.championEntryId)?.name ??
                    "—"
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PrintDay({ day }: { day: OrderOfPlay }) {
  const stage = useStageLabel();
  const t = useTranslations("tournaments.print");
  const courts = [
    ...new Map(
      day.matches.flatMap((match) =>
        match.schedule ? [[match.schedule.courtId, match.schedule.courtName]] : [],
      ),
    ).entries(),
  ].sort((x, y) => x[1].localeCompare(y[1], undefined, { numeric: true }));
  const times = [...new Set(day.matches.map((match) => match.schedule?.startTime ?? ""))]
    .filter(Boolean)
    .sort();
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          <th className="w-14 border border-neutral-400 bg-neutral-100 p-1 text-left">
            {t("time")}
          </th>
          {courts.map(([id, name]) => (
            <th key={id} className="border border-neutral-400 bg-neutral-100 p-1 text-left">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {times.map((time) => (
          <tr key={time} className="break-inside-avoid">
            <td className="border border-neutral-400 p-1 align-top font-bold tabular-nums">
              {time}
            </td>
            {courts.map(([id]) => {
              const match = day.matches.find(
                (item) => item.schedule?.startTime === time && item.schedule.courtId === id,
              );
              return (
                <td key={id} className="border border-neutral-400 p-1 align-top">
                  {match ? (
                    <div className="space-y-0.5">
                      <p className="text-[9px] text-neutral-500 uppercase">
                        {match.categoryName} · {stage(match)}
                      </p>
                      <p className="font-semibold">{match.a?.name ?? "—"}</p>
                      <p className="text-neutral-500">×</p>
                      <p className="font-semibold">{match.b?.name ?? "—"}</p>
                      {match.score ? <p className="tabular-nums">{match.score}</p> : null}
                    </div>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Printable draw (one category) or day order of play, in black on white for the club's notice
 * board. "Imprimir" opens the browser's print dialog, which also saves as PDF.
 */
export function PrintView({
  data,
  view,
  categoryId,
  date,
}: {
  data: PublicTournament;
  view: "draw" | "day";
  categoryId?: string;
  date?: string;
}) {
  const t = useTranslations("tournaments.print");
  const format = useFormat();
  const draw = data.draws.find((item) => item.category.id === categoryId) ?? data.draws[0];
  const day =
    data.schedule.find((item) => item.date === date) ??
    data.schedule.find((item) => item.matches.length > 0) ??
    data.schedule[0];

  const subtitle =
    view === "draw"
      ? draw
        ? draw.category.name
        : t("noDraw")
      : day
        ? format.longDayTitle(day.date)
        : t("noSchedule");

  return (
    <div className="min-h-dvh bg-white p-6 text-neutral-900 print:p-0">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-small text-neutral-600">{t("hint")}</p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-small font-medium text-white"
        >
          <Printer className="size-4" />
          {t("print")}
        </button>
      </div>
      <header className="mb-4 flex items-end justify-between border-b-2 border-neutral-900 pb-2">
        <div>
          <p className="text-[11px] tracking-widest text-neutral-500 uppercase">{data.clubName}</p>
          <h1 className="text-xl font-bold">{data.tournament.name}</h1>
          <p className="text-sm">
            {view === "draw" ? t("drawOf", { name: subtitle }) : t("dayOf", { day: subtitle })}
          </p>
        </div>
        <p className="text-[10px] text-neutral-500">
          {t("updated", { when: format.dateTime(new Date().toISOString()) })}
        </p>
      </header>
      {view === "draw" ? (
        draw ? (
          <PrintDraw draw={draw} />
        ) : (
          <p>{t("noDraw")}</p>
        )
      ) : day && day.matches.length > 0 ? (
        <PrintDay day={day} />
      ) : (
        <p>{t("noSchedule")}</p>
      )}
    </div>
  );
}
