"use client";

import {
  type ScoreFormat,
  type SetScore,
  sportRules,
  type TeamSide,
  type TournamentMatchView,
} from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Stepper } from "@/components/matches/set-stepper";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { fadeVariants, haptic, popVariants } from "@/lib/motion";
import { invalidateTournament, scoreSeenBy, viewerSide } from "@/lib/tournaments";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";

import { useStageLabel } from "./match-row";

type Games = { a: number; b: number };
type Mode = "PLAYED" | "WALKOVER" | "RETIRED" | "DISQUALIFIED";

const EMPTY: Games = { a: 0, b: 0 };
const MAX_GAMES: Record<ScoreFormat, number> = {
  BEST_OF_3_MATCH_TIEBREAK: 7,
  BEST_OF_3: 7,
  PRO_SET_8: 9,
};
const MAX_TIEBREAK = 30;

/** Sets the form can hold for a format (pro-set: one; best of 3: three). */
const setCount = (format: ScoreFormat) => (format === "PRO_SET_8" ? 1 : 3);

/**
 * Score entry for one tournament match in its category's format. `near` is the side shown on the
 * left (the viewer's); the sets are converted to side A's point of view for the API.
 */
function ScoreEntry({
  format,
  nearName,
  farName,
  sets,
  onChange,
  thirdTiebreak,
  onThirdTiebreak,
}: {
  format: ScoreFormat;
  nearName: string;
  farName: string;
  sets: Games[];
  onChange: (sets: Games[]) => void;
  thirdTiebreak: boolean;
  onThirdTiebreak: (value: boolean) => void;
}) {
  const t = useTranslations("tournaments.score");
  const report = useTranslations("report");
  const club = useClub();
  const rules = sportRules(club?.settings.primarySport ?? "TENNIS");
  const count = setCount(format);
  const winners = sets.map((set, index) =>
    rules.setWinnerFor(format, { ...set, tiebreak: index === 2 && thirdTiebreak }),
  );
  const split =
    count === 3 && winners[0] !== null && winners[1] !== null && winners[0] !== winners[1];

  const label = (index: number) =>
    format === "PRO_SET_8"
      ? t("proSet")
      : index === 2 && thirdTiebreak
        ? report("tiebreak")
        : report("set", { number: index + 1 });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 px-3 text-center text-caption font-medium text-muted-foreground">
        <span className="truncate">{nearName}</span>
        <span className="truncate">{farName}</span>
      </div>
      <ul className="space-y-3">
        {sets.slice(0, count).map((set, index) => {
          if (index === 2 && !split) return null;
          const tiebreak = index === 2 && thirdTiebreak;
          const winner = winners[index];
          return (
            <motion.li
              key={index}
              variants={fadeVariants}
              initial="hidden"
              animate="show"
              className="space-y-2 rounded-lg border border-border bg-card p-3"
            >
              <span className="flex items-center gap-2 text-small font-medium">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full",
                    winner ? "bg-ball text-on-color" : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {winner ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span className="num text-caption">{index + 1}</span>
                  )}
                </span>
                {label(index)}
              </span>
              <div className="grid grid-cols-2 justify-items-center gap-2">
                {(["a", "b"] as const).map((key) => (
                  <Stepper
                    key={key}
                    label={report("gamesLabel", {
                      set: label(index),
                      side: key === "a" ? nearName : farName,
                    })}
                    value={set[key]}
                    max={tiebreak ? MAX_TIEBREAK : MAX_GAMES[format]}
                    emphasis={winner === (key === "a" ? "A" : "B")}
                    onChange={(value) =>
                      onChange(
                        sets.map((entry, at) =>
                          at === index ? { ...entry, [key]: value } : entry,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </motion.li>
          );
        })}
      </ul>
      {split && format === "BEST_OF_3_MATCH_TIEBREAK" ? (
        <SegmentedControl
          label={report("thirdSetLabel")}
          options={[
            { value: "tiebreak", label: report("thirdTiebreak") },
            { value: "regular", label: report("thirdRegular") },
          ]}
          value={thirdTiebreak ? "tiebreak" : "regular"}
          onChange={(value) => {
            onThirdTiebreak(value === "tiebreak");
            onChange(sets.map((entry, index) => (index === 2 ? EMPTY : entry)));
          }}
        />
      ) : null}
    </div>
  );
}

/** The near side's games → sets from side A's point of view. */
function toApiSets(
  sets: Games[],
  format: ScoreFormat,
  thirdTiebreak: boolean,
  near: TeamSide,
): SetScore[] {
  const count = setCount(format);
  const rules = sportRules("TENNIS");
  const used: SetScore[] = [];
  for (const [index, set] of sets.slice(0, count).entries()) {
    const tiebreak = index === 2 && thirdTiebreak;
    if (index === 2) {
      const [first, second] = used;
      const decided =
        first && second && rules.setWinnerFor(format, first) === rules.setWinnerFor(format, second);
      if (decided) break;
    }
    used.push({ ...set, tiebreak });
  }
  return near === "A" ? used : used.map((set) => ({ ...set, a: set.b, b: set.a }));
}

/**
 * Sheet to report, confirm or decide a tournament match. Players report their own score (the
 * opponent confirms); organizers enter the final score or a walkover, retirement or
 * disqualification directly.
 */
export function ScoreSheet({
  match: requested,
  format,
  canManage,
  onOpenChange,
}: {
  match: TournamentMatchView | null;
  format: ScoreFormat;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("tournaments.score");
  const outcomes = useTranslations("tournaments.outcome");
  const { user } = useSession();
  const client = useQueryClient();
  const club = useClub();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const stage = useStageLabel();
  const rules = sportRules(club?.settings.primarySport ?? "TENNIS");
  const match = useLastDefined(requested);

  const [sets, setSets] = useState<Games[]>([EMPTY, EMPTY, EMPTY]);
  const [thirdTiebreak, setThirdTiebreak] = useState(format === "BEST_OF_3_MATCH_TIEBREAK");
  const [mode, setMode] = useState<Mode>("PLAYED");
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [touched, setTouched] = useState(false);

  const matchId = requested?.id;
  useEffect(() => {
    if (!matchId) return;
    setSets([EMPTY, EMPTY, EMPTY]);
    setThirdTiebreak(format === "BEST_OF_3_MATCH_TIEBREAK");
    setMode("PLAYED");
    setWinnerId(null);
    setEditing(false);
    setTouched(false);
  }, [matchId, format]);

  const mySide = match ? viewerSide(match, user?.id) : null;
  const near: TeamSide = mySide ?? "A";
  const nearEntry = match ? (near === "A" ? match.a : match.b) : null;
  const farEntry = match ? (near === "A" ? match.b : match.a) : null;

  const apiSets = toApiSets(sets, format, thirdTiebreak, near);
  const check = rules.scoreSchemaFor(format).safeParse(apiSets);
  const issue = check.success ? null : issueMessage(check.error.issues[0]);

  const done = () => {
    if (match) void invalidateTournament(client, match.tournamentId);
    void client.invalidateQueries({ queryKey: ["tournaments"] });
    onOpenChange(false);
  };

  const report = useMutation({
    mutationFn: () => api.tournamentMatches.report(match!.id, apiSets),
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success(canManage ? t("savedFinal") : t("sent"), {
        description: canManage ? undefined : t("sentDescription"),
      });
      done();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const confirm = useMutation({
    mutationFn: () => api.tournamentMatches.confirm(match!.id),
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success(t("confirmed"));
      done();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const decide = useMutation({
    mutationFn: () => {
      const partial = apiSets.filter((set) => set.a > 0 || set.b > 0);
      return api.tournamentMatches.outcome(match!.id, {
        outcome: mode as Exclude<Mode, "PLAYED">,
        winnerEntryId: winnerId!,
        ...(mode === "RETIRED" && partial.length > 0 ? { sets: partial } : {}),
      });
    },
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success(t("savedFinal"));
      done();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  if (!match) {
    return (
      <Sheet open={false} onOpenChange={onOpenChange} title={t("title")}>
        {null}
      </Sheet>
    );
  }

  const reported = match.resultStatus === "REPORTED";
  const confirmed = match.resultStatus === "CONFIRMED";
  const showConfirm = reported && match.viewer.canConfirm && !editing;
  const showEntry =
    match.viewer.canReport &&
    (!reported || editing || !match.viewer.canConfirm) &&
    (!confirmed || editing);
  const winnerName = [match.a, match.b].find((side) => side?.id === match.winnerEntryId)?.name;
  const winnerSide: TeamSide = match.winnerEntryId === match.b?.id ? "B" : "A";
  const busy = report.isPending || confirm.isPending || decide.isPending;

  let footer: React.ReactNode = null;
  if (showConfirm) {
    footer = (
      <div className="flex flex-col gap-2">
        <Button size="lg" block loading={confirm.isPending} onClick={() => confirm.mutate()}>
          <Check />
          {t("confirm")}
        </Button>
        {canManage ? (
          <Button variant="ghost" block onClick={() => setEditing(true)}>
            {t("correct")}
          </Button>
        ) : null}
      </div>
    );
  } else if (showEntry && mode === "PLAYED") {
    footer = (
      <Button
        size="lg"
        block
        loading={report.isPending}
        disabled={busy}
        onClick={() => {
          setTouched(true);
          if (check.success) report.mutate();
        }}
      >
        {canManage ? t("saveFinal") : t("send")}
      </Button>
    );
  } else if (showEntry) {
    footer = (
      <Button
        size="lg"
        block
        loading={decide.isPending}
        disabled={!winnerId || busy}
        onClick={() => decide.mutate()}
      >
        {t("saveOutcome", { outcome: outcomes(mode) })}
      </Button>
    );
  } else if (confirmed && canManage && !editing) {
    footer = (
      <Button variant="secondary" block onClick={() => setEditing(true)}>
        {t("correct")}
      </Button>
    );
  }

  return (
    <Sheet
      open={requested !== null}
      onOpenChange={onOpenChange}
      title={`${match.categoryName} · ${stage(match)}`}
      description={
        match.schedule ? `${match.schedule.courtName} · ${match.schedule.startTime}` : undefined
      }
      footer={footer}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="min-w-0 flex-1 space-y-1 text-small">
            <p className={cn("truncate", match.winnerEntryId === match.a?.id && "font-semibold")}>
              {match.a?.name}
            </p>
            <p className={cn("truncate", match.winnerEntryId === match.b?.id && "font-semibold")}>
              {match.b?.name}
            </p>
          </div>
          {match.score ? <span className="num text-title font-semibold">{match.score}</span> : null}
        </div>

        {reported && !editing ? (
          <div className="flex items-start gap-2 rounded-md bg-warning-soft px-4 py-3 text-small text-warning-ink">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("reportedBy", {
                name: match.reportedBy ?? "",
                score: scoreSeenBy(match.sets, winnerSide),
                winner: winnerName ?? "",
              })}
              {match.viewer.canConfirm || canManage ? null : ` ${t("waitingOpponent")}`}
              {match.viewer.canConfirm && !canManage ? ` ${t("disagreeHint")}` : null}
            </span>
          </div>
        ) : null}

        {confirmed && !editing ? (
          <p className="flex items-center gap-2 rounded-md bg-ball-soft px-4 py-3 text-small font-medium text-ball-ink">
            <Trophy className="size-4 shrink-0" />
            {t("final", { winner: winnerName ?? "" })}
          </p>
        ) : null}

        {showEntry ? (
          <>
            {canManage ? (
              <section className="space-y-2">
                <SectionLabel>{t("how")}</SectionLabel>
                <ChipGroup label={t("how")}>
                  {(["PLAYED", "WALKOVER", "RETIRED", "DISQUALIFIED"] as const).map((value) => (
                    <ChoiceChip
                      key={value}
                      selected={mode === value}
                      onClick={() => setMode(value)}
                    >
                      {outcomes(value)}
                    </ChoiceChip>
                  ))}
                </ChipGroup>
              </section>
            ) : null}

            {mode !== "PLAYED" ? (
              <section className="space-y-2">
                <SectionLabel>{t("winner")}</SectionLabel>
                <ChipGroup label={t("winner")}>
                  {[match.a, match.b].map((side) =>
                    side ? (
                      <ChoiceChip
                        key={side.id}
                        selected={winnerId === side.id}
                        onClick={() => setWinnerId(side.id)}
                        showCheck
                      >
                        {side.name}
                      </ChoiceChip>
                    ) : null,
                  )}
                </ChipGroup>
                <p className="text-caption text-muted-foreground">{t(`hint.${mode}`)}</p>
              </section>
            ) : null}

            {mode === "PLAYED" || mode === "RETIRED" ? (
              <section className="space-y-3">
                <SectionLabel>{mode === "RETIRED" ? t("partialScore") : t("score")}</SectionLabel>
                <ScoreEntry
                  format={format}
                  nearName={nearEntry?.name ?? ""}
                  farName={farEntry?.name ?? ""}
                  sets={sets}
                  onChange={(next) => {
                    setTouched(true);
                    setSets(next);
                  }}
                  thirdTiebreak={thirdTiebreak}
                  onThirdTiebreak={setThirdTiebreak}
                />
                {mode === "PLAYED" ? (
                  <div aria-live="polite" className="min-h-12">
                    <AnimatePresence mode="wait" initial={false}>
                      {check.success ? (
                        <motion.p
                          key="ok"
                          variants={popVariants}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          className="flex items-center gap-2 rounded-md bg-ball-soft px-4 py-3 text-small font-medium text-ball-ink"
                        >
                          <Trophy className="size-4 shrink-0" />
                          {t("winsWith", {
                            name: (check.data.winner === "A" ? match.a : match.b)?.name ?? "",
                            score: scoreSeenBy(apiSets, check.data.winner),
                          })}
                        </motion.p>
                      ) : touched && issue ? (
                        <motion.p
                          key={issue}
                          variants={fadeVariants}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          className="flex items-center gap-2 rounded-md bg-surface-2 px-4 py-3 text-small text-muted-foreground"
                        >
                          <X className="size-4 shrink-0 text-danger-ink" />
                          {issue}
                        </motion.p>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}
                {!canManage ? (
                  <p className="text-caption text-muted-foreground">{t("approvalNote")}</p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {!showEntry && !showConfirm && !confirmed && !reported ? (
          <p className="text-small text-muted-foreground">{t("onlyPlayers")}</p>
        ) : null}
      </div>
    </Sheet>
  );
}
