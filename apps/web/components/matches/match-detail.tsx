"use client";

import { disputeMatchSchema, type MatchDetail } from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, MessageSquareWarning, Scale, Swords } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { otherSide, scoreFrom, sideFirstNames, sidePlayers } from "@/lib/matches";
import { haptic } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { formatDelta, useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";
import { cn } from "@/lib/utils";

import { ScoreRow, scoreboard, STATUS_TONE } from "./match-card";

/** Approve / dispute calls, keeping every list that shows matches in sync. */
function useMatchActions(match: MatchDetail) {
  const t = useTranslations("matchDetail");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const settle = (updated?: MatchDetail) => {
    if (updated) client.setQueryData(queryKeys.match(updated.id), updated);
    void client.invalidateQueries({ queryKey: queryKeys.matchesMine });
    void client.invalidateQueries({ queryKey: queryKeys.match(match.id) });
    void client.invalidateQueries({ queryKey: ["players"] });
    void client.invalidateQueries({ queryKey: queryKeys.me });
  };
  const approve = useMutation({
    mutationFn: () => api.matches.approve(match.id),
    onSuccess: (updated) => {
      haptic([12, 40, 12]);
      settle(updated);
    },
    onError: (failure) => {
      toast.error(errorMessage(failure, t("approveFailed")));
      settle();
    },
  });
  const dispute = useMutation({
    mutationFn: (comment: string | undefined) => api.matches.dispute(match.id, comment),
    onSuccess: (updated) => {
      haptic();
      toast(t("disputed"), { description: t("disputedDescription") });
      settle(updated);
    },
    onError: (failure) => toast.error(errorMessage(failure, t("disputeFailed"))),
  });
  return { approve, dispute };
}

function DisputeSheet({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (comment: string | undefined) => void;
  pending: boolean;
}) {
  const t = useTranslations("matchDetail");
  const issueMessage = useIssueMessage();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = disputeMatchSchema.safeParse({ comment });
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]));
      return;
    }
    onSubmit(parsed.data.comment ?? undefined);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("disputeTitle")}
      description={t("disputeDescription")}
      footer={
        <Button block size="lg" variant="danger" loading={pending} onClick={submit}>
          {t("disputeSubmit")}
        </Button>
      }
    >
      <Field label={t("disputeComment")} htmlFor="dispute-comment" error={error ?? undefined}>
        <Textarea
          id="dispute-comment"
          value={comment}
          maxLength={500}
          onChange={(event) => {
            setComment(event.target.value);
            setError(null);
          }}
          placeholder={t("disputePlaceholder")}
          aria-invalid={Boolean(error) || undefined}
        />
      </Field>
    </Sheet>
  );
}

/** Where the match stands and what the viewer can do about it. */
function StatusPanel({ match }: { match: MatchDetail }) {
  const t = useTranslations("matchDetail");
  const format = useFormat();
  const { approve, dispute } = useMatchActions(match);
  const [disputing, setDisputing] = useState(false);
  const reporterSide = match.players.find((player) => player.user.id === match.reportedBy.id)?.side;
  const responders = reporterSide ? sideFirstNames(match, otherSide(reporterSide)) : "";

  if (match.status === "PENDING" && match.viewer.canRespond) {
    return (
      <div className="space-y-3 rounded-lg border border-ball/40 bg-ball-soft p-4">
        <p className="text-small text-foreground">
          {t.rich("respondPrompt", {
            name: match.reportedBy.name,
            when: format.relative(match.approvalDeadline),
            b: (chunks) => <span className="font-semibold">{chunks}</span>,
          })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="dangerSoft"
            className="flex-1"
            onClick={() => setDisputing(true)}
            disabled={approve.isPending}
          >
            <MessageSquareWarning /> {t("dispute")}
          </Button>
          <Button
            className="flex-1"
            loading={approve.isPending}
            disabled={dispute.isPending}
            onClick={() => approve.mutate()}
          >
            <CheckCircle2 /> {t("approve")}
          </Button>
        </div>
        <DisputeSheet
          open={disputing}
          onOpenChange={setDisputing}
          pending={dispute.isPending}
          onSubmit={(comment) => dispute.mutate(comment, { onSuccess: () => setDisputing(false) })}
        />
      </div>
    );
  }

  const line = (icon: React.ReactNode, text: React.ReactNode, tone = "bg-surface-2") => (
    <div className={cn("flex gap-3 rounded-lg p-4 text-small", tone)}>
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 space-y-1">{text}</div>
    </div>
  );

  switch (match.status) {
    case "PENDING":
      return line(
        <Clock className="size-4" />,
        <p>
          {t("waitingFor", {
            names: responders,
            when: format.relative(match.approvalDeadline),
          })}
        </p>,
      );
    case "DISPUTED":
      return line(
        <Scale className="size-4" />,
        <>
          <p className="font-medium text-foreground">
            {t("disputedBy", { name: match.respondedBy?.name ?? "" })}
          </p>
          {match.disputeComment ? (
            <p className="text-muted-foreground">“{match.disputeComment}”</p>
          ) : null}
          <p className="text-muted-foreground">{t("disputedWaiting")}</p>
        </>,
        "bg-danger-soft",
      );
    case "VOIDED":
      return line(
        <Scale className="size-4" />,
        <>
          <p className="font-medium text-foreground">{t("voided")}</p>
          {match.resolutionNote ? (
            <p className="text-muted-foreground">“{match.resolutionNote}”</p>
          ) : null}
        </>,
      );
    case "CONFIRMED":
      return line(
        <CheckCircle2 className="size-4 text-success-ink" />,
        <>
          <p className="text-foreground">
            {match.confirmation === "AUTO_APPROVED"
              ? t("confirmedAuto")
              : match.confirmation === "ADMIN_RESOLVED"
                ? t("confirmedAdmin")
                : t("confirmedBy", { name: match.respondedBy?.name ?? "" })}
            {match.confirmedAt ? ` · ${format.dateTime(match.confirmedAt)}` : ""}
          </p>
          {match.resolutionNote ? (
            <p className="text-muted-foreground">“{match.resolutionNote}”</p>
          ) : null}
        </>,
      );
  }
}

/** Full match: scoreboard, status with approve/dispute, and each player's rating change. */
export function MatchDetailView({ match }: { match: MatchDetail }) {
  const t = useTranslations("matchDetail");
  const common = useTranslations("common");
  const labels = useTranslations("labels");
  const format = useFormat();
  const { user } = useSession();
  const board = scoreboard(match);
  const singles = match.format === "SINGLES";
  const [a] = sidePlayers(match, "A");
  const [b] = sidePlayers(match, "B");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[match.status]}>{t(`status.${match.status}`)}</Badge>
        <Badge tone={match.surface === "HARTRU" ? "hartru" : "saibro"}>
          {match.court ? `${match.court.name} · ` : ""}
          {labels(`surface.${match.surface}`)}
        </Badge>
        <Badge>{singles ? common("singles") : common("doubles")}</Badge>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-small text-muted-foreground">{format.longDayTitle(match.playedOn)}</p>
        <ScoreRow match={match} side={board.first} sets={board.firstSets} size="detail" />
        <ScoreRow match={match} side={board.second} sets={board.secondSets} size="detail" />
        <p className="num text-small text-muted-foreground">{scoreFrom(match.sets, board.first)}</p>
      </div>

      <StatusPanel match={match} />

      <section className="space-y-3" aria-label={t("players")}>
        <SectionLabel>{t("players")}</SectionLabel>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {match.players.map((player) => (
            <li key={player.user.id}>
              <Link
                href={`/app/players/${player.user.id}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 transition-tokens hover:bg-surface-2"
              >
                <Avatar name={player.user.name} src={player.user.photoUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {player.user.name}
                    {player.user.id === user?.id ? (
                      <span className="text-muted-foreground"> {common("you")}</span>
                    ) : null}
                  </span>
                  <span className="block text-caption text-muted-foreground">
                    {player.side === match.winnerSide && match.status !== "VOIDED"
                      ? t("winner")
                      : t("loser")}
                  </span>
                </span>
                {player.delta != null && player.eloBefore != null && player.eloAfter != null ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num text-small text-muted-foreground">
                      {player.eloBefore} → {player.eloAfter}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-6 items-center rounded-full px-2 num text-caption font-semibold",
                        player.delta > 0
                          ? "bg-ball text-on-color"
                          : player.delta < 0
                            ? "bg-danger-soft text-danger-ink"
                            : "bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {formatDelta(player.delta)}
                    </span>
                  </span>
                ) : (
                  <span className="num text-small text-muted-foreground">
                    {common("elo", { elo: player.user.elo })}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-caption text-muted-foreground">
        {t("reportedBy", {
          name: match.reportedBy.name,
          when: format.dateTime(match.reportedAt),
        })}
      </p>

      {singles && a && b ? (
        <ButtonLink
          href={`/app/ranking/h2h?a=${a.user.id}&b=${b.user.id}`}
          variant="secondary"
          block
        >
          <Swords /> {t("compare")}
        </ButtonLink>
      ) : null}
    </div>
  );
}
