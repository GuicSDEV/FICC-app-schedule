"use client";

import { type MatchDetail, resolveDisputeSchema, sportRules } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

import { AdminHeader } from "@/components/admin/admin-header";
import { ScoreRow, scoreboard } from "@/components/matches/match-card";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";

type Action = "ACCEPT" | "EDIT" | "VOID";

function ResolveSheet({
  match,
  onOpenChange,
}: {
  match: MatchDetail | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.disputes");
  const client = useQueryClient();
  const issueMessage = useIssueMessage();
  const errorMessage = useErrorMessage();
  const [action, setAction] = useState<Action>("ACCEPT");
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match) return;
    setAction("ACCEPT");
    setScore(match.score);
    setNote("");
    setError(null);
  }, [match]);

  const resolve = useMutation({
    mutationFn: (input: Parameters<typeof api.admin.resolveDispute>[1]) =>
      api.admin.resolveDispute(match!.id, input),
    onSuccess: () => {
      haptic();
      toast.success(t(`resolved.${action}`));
      void client.invalidateQueries({ queryKey: queryKeys.admin.disputes });
      void client.invalidateQueries({ queryKey: queryKeys.leaderboard() });
      onOpenChange(false);
    },
    onError: (failure) => {
      const message = errorMessage(failure, t("failed"));
      setError(message);
      toast.error(message);
    },
  });

  function submit() {
    if (!match) return;
    let sets;
    if (action === "EDIT") {
      try {
        sets = sportRules(match.sport).parseScore(score).sets;
      } catch (failure) {
        setError(failure instanceof ZodError ? issueMessage(failure.issues[0]) : t("failed"));
        return;
      }
    }
    const input = { action, ...(sets ? { score: sets } : {}), ...(note.trim() ? { note } : {}) };
    const parsed = resolveDisputeSchema.safeParse(input);
    if (!parsed.success) return setError(issueMessage(parsed.error.issues[0]));
    setError(null);
    resolve.mutate(parsed.data);
  }

  return (
    <Sheet
      open={match !== null}
      onOpenChange={onOpenChange}
      title={t("resolveTitle")}
      description={match ? t("resolveDescription", { score: match.score }) : undefined}
      footer={
        <Button
          block
          size="lg"
          variant={action === "VOID" ? "danger" : "primary"}
          loading={resolve.isPending}
          onClick={submit}
        >
          {t(`submit.${action}`)}
        </Button>
      }
    >
      <div className="space-y-5">
        <SegmentedControl
          label={t("action")}
          options={[
            { value: "ACCEPT", label: t("actions.ACCEPT") },
            { value: "EDIT", label: t("actions.EDIT") },
            { value: "VOID", label: t("actions.VOID") },
          ]}
          value={action}
          onChange={(next) => {
            setAction(next);
            setError(null);
          }}
        />
        <p className="text-small text-muted-foreground">{t(`help.${action}`)}</p>
        {action === "EDIT" ? (
          <Field label={t("score")} htmlFor="dispute-score" hint={t("scoreHint")}>
            <Input
              id="dispute-score"
              value={score}
              onChange={(event) => setScore(event.target.value)}
              className="num"
              autoComplete="off"
            />
          </Field>
        ) : null}
        <Field label={t("note")} htmlFor="dispute-note">
          <Textarea
            id="dispute-note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FieldError>{error}</FieldError>
      </div>
    </Sheet>
  );
}

/** Disputed results waiting for the club: accept, correct the score or void. */
export default function AdminDisputesPage() {
  const t = useTranslations("admin.disputes");
  const common = useTranslations("common");
  const format = useFormat();
  const disputes = useQuery({ queryKey: queryKeys.admin.disputes, queryFn: api.admin.disputes });
  const [resolving, setResolving] = useState<MatchDetail | null>(null);

  return (
    <>
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mt-6">
        {disputes.isError ? (
          <ErrorState onRetry={() => void disputes.refetch()} />
        ) : disputes.isLoading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-44 rounded-lg" />
            <Skeleton className="h-44 rounded-lg" />
          </div>
        ) : (disputes.data ?? []).length === 0 ? (
          <EmptyState icon={Scale} title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {disputes.data!.map((match, index) => {
              const board = scoreboard(match);
              return (
                <motion.li
                  key={match.id}
                  custom={index}
                  variants={listItemVariants}
                  initial={enter("hidden")}
                  animate="show"
                  className="space-y-3 rounded-lg border border-danger/30 bg-card p-4 shadow-card"
                >
                  <p className="text-caption text-muted-foreground">
                    {format.dayTitle(match.playedOn)} ·{" "}
                    {match.format === "SINGLES" ? common("singles") : common("doubles")}
                    {match.court ? ` · ${match.court.name}` : ""}
                  </p>
                  <div className="space-y-2">
                    <ScoreRow match={match} side={board.first} sets={board.firstSets} />
                    <ScoreRow match={match} side={board.second} sets={board.secondSets} />
                  </div>
                  <div className="rounded-md bg-danger-soft px-3 py-2.5 text-small">
                    <p>
                      {t("reportedBy", { name: match.reportedBy.name })} ·{" "}
                      {t("disputedBy", { name: match.respondedBy?.name ?? "" })}
                    </p>
                    {match.disputeComment ? (
                      <p className="mt-1 text-muted-foreground">“{match.disputeComment}”</p>
                    ) : null}
                  </div>
                  <Button block variant="secondary" onClick={() => setResolving(match)}>
                    {t("resolve")}
                  </Button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
      <ResolveSheet match={resolving} onOpenChange={(open) => !open && setResolving(null)} />
    </>
  );
}
