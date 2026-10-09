"use client";

import type { MatchDetail } from "@ficc/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { formatDayTitle, formatUntil } from "@/lib/format";
import { haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

function sideNames(match: MatchDetail, side: "A" | "B"): string {
  return match.players
    .filter((player) => player.side === side)
    .map((player) => player.user.name.split(" ")[0])
    .join(" / ");
}

/** Results the opponent reported that wait for the viewer's approval. */
export function ResultApprovals({ matches }: { matches: MatchDetail[] }) {
  const client = useQueryClient();
  const approve = useMutation({
    mutationFn: (id: string) => api.matches.approve(id),
    onSuccess: () => {
      haptic([12, 40, 12]);
      toast.success("Resultado aprovado", { description: "O Elo de todos foi atualizado." });
    },
    onError: (failure) =>
      toast.error(failure instanceof ApiError ? failure.message : "Não foi possível aprovar."),
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
              initial="hidden"
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
                    <span className="font-semibold">{match.reportedBy.name.split(" ")[0]}</span>{" "}
                    lançou um resultado
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {formatDayTitle(match.playedOn)} · aprovação automática{" "}
                    {formatUntil(match.approvalDeadline)}
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
                    <span className="text-muted-foreground"> vs </span>
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
                  Ver ou contestar <ChevronRight />
                </ButtonLink>
                <Button
                  size="sm"
                  className="flex-1"
                  loading={approve.isPending && approve.variables === match.id}
                  onClick={() => approve.mutate(match.id)}
                >
                  Aprovar
                </Button>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
