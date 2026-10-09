"use client";

import type { MatchDetail } from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";

function sideNames(match: MatchDetail, side: "A" | "B"): string {
  return match.players
    .filter((player) => player.side === side)
    .map((player) => player.user.name.split(" ")[0])
    .join(" / ");
}

/** Results the opponent reported that wait for the viewer's approval. */
export function ResultApprovals({ matches }: { matches: MatchDetail[] }) {
  const t = useTranslations("dashboard.approval");
  const common = useTranslations("common");
  const format = useFormat();
  const errorMessage = useErrorMessage();
  const client = useQueryClient();
  const approve = useMutation({
    mutationFn: (id: string) => api.matches.approve(id),
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success(t("approved"), { description: t("approvedDescription") });
    },
    onError: (failure) => toast.error(errorMessage(failure, t("failed"))),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.matchesMine });
      void client.invalidateQueries({ queryKey: queryKeys.me });
      void client.invalidateQueries({ queryKey: ["players"] });
    },
  });

  return (
    <ul className="space-y-3">
      <AnimatePresence initial={false}>
        {matches.map((match, index) => {
          const reporters = match.players.filter((player) => player.side !== match.viewer.side);
          return (
            <motion.li
              key={match.id}
              layout
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
              exit="exit"
              className="rounded-lg border border-border bg-card p-4 shadow-card"
            >
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {reporters.map((player) => (
                    <span key={player.user.id} className="rounded-full ring-2 ring-card">
                      <Avatar name={player.user.name} src={player.user.photoUrl} size="sm" />
                    </span>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small">
                    {t.rich("reported", {
                      name: match.reportedBy.name.split(" ")[0] ?? match.reportedBy.name,
                      b: (chunks) => <span className="font-semibold">{chunks}</span>,
                    })}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {t("autoApprove", {
                      day: format.dayTitle(match.playedOn),
                      when: format.relative(match.approvalDeadline),
                    })}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5">
                <div className="min-w-0 text-small">
                  <p className="truncate">
                    <span
                      className={
                        match.winnerSide === "A" ? "font-semibold" : "text-muted-foreground"
                      }
                    >
                      {sideNames(match, "A")}
                    </span>
                    <span className="text-muted-foreground"> {common("vs")} </span>
                    <span
                      className={
                        match.winnerSide === "B" ? "font-semibold" : "text-muted-foreground"
                      }
                    >
                      {sideNames(match, "B")}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 num font-semibold">{match.score}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <ButtonLink
                  href={`/app/matches/${match.id}`}
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                >
                  {t("review")} <ChevronRight />
                </ButtonLink>
                <Button
                  size="sm"
                  className="flex-1"
                  loading={approve.isPending && approve.variables === match.id}
                  onClick={() => approve.mutate(match.id)}
                >
                  {t("approve")}
                </Button>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
