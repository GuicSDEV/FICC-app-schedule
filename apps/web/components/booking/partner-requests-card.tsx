"use client";

import type { PartnerRequestItem } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { enter, fadeVariants, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { cn } from "@/lib/utils";

export const PARTNER_REQUESTS_ID = "procurando-parceiro";

/** The day's members looking for a partner, and the button to become one of them. */
export function PartnerRequestsCard({
  date,
  canPost,
  onPost,
  onPlay,
}: {
  date: string;
  /** The day takes bookings (not a free-play or closed day). */
  canPost: boolean;
  onPost: () => void;
  onPlay: (request: PartnerRequestItem) => void;
}) {
  const t = useTranslations("partners");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const requests = useQuery({
    queryKey: queryKeys.partnerRequests(date),
    queryFn: () => api.partnerRequests.list(date),
    enabled: date !== "",
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.partnerRequests.cancel(id),
    onSuccess: () => {
      haptic();
      toast.success(t("cancelled"));
    },
    onError: (failure) => toast.error(errorMessage(failure)),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.partnerRequests(date) }),
  });
  const items = requests.data ?? [];

  return (
    <Card id={PARTNER_REQUESTS_ID} className="scroll-mt-24 space-y-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ball-soft text-ball-ink">
          <UsersRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <SectionLabel>{t("title")}</SectionLabel>
          <p className="mt-0.5 text-small text-muted-foreground">{t("hint")}</p>
        </div>
      </div>

      {requests.isLoading ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : items.length === 0 ? (
        <p className="text-small text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-2" aria-label={t("title")}>
          <AnimatePresence initial={false}>
            {items.map((request, index) => (
              <motion.li
                key={request.id}
                custom={index}
                variants={listItemVariants}
                initial={enter("hidden")}
                animate="show"
                exit="exit"
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  request.mine ? "border-primary/50 bg-ball-soft" : "border-border bg-surface-2",
                )}
              >
                <Link
                  href={`/app/players/${request.player.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar name={request.player.name} src={request.player.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {request.mine ? t("you") : request.player.name}
                    </span>
                    <span className="block text-small text-muted-foreground">
                      <span className="num font-semibold text-foreground">{request.startTime}</span>{" "}
                      · {t(`type.${request.type}`)} ·{" "}
                      <span className="num">{t("elo", { elo: request.player.elo })}</span>
                    </span>
                    {request.note ? (
                      <span className="mt-0.5 block text-small break-words text-muted-foreground italic">
                        “{request.note}”
                      </span>
                    ) : null}
                  </span>
                </Link>
                {request.mine ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={cancel.isPending && cancel.variables === request.id}
                    onClick={() => cancel.mutate(request.id)}
                  >
                    {t("cancel")}
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => onPlay(request)}>
                    {t("play")}
                  </Button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {canPost ? (
        <Button block variant="secondary" onClick={onPost}>
          <UsersRound /> {t("post")}
        </Button>
      ) : null}
    </Card>
  );
}

/** "2 procurando parceiro" above the calendar, jumping to the list. */
export function PartnerRequestsPill({ date, viewerId }: { date: string; viewerId?: string }) {
  const t = useTranslations("partners");
  const requests = useQuery({
    queryKey: queryKeys.partnerRequests(date),
    queryFn: () => api.partnerRequests.list(date),
    enabled: date !== "",
  });
  const others = (requests.data ?? []).filter((request) => request.player.id !== viewerId).length;
  return (
    <AnimatePresence initial={false}>
      {others > 0 ? (
        <motion.a
          key="pill"
          href={`#${PARTNER_REQUESTS_ID}`}
          variants={fadeVariants}
          initial={enter("hidden")}
          animate="show"
          exit="exit"
          className="flex min-h-11 items-center gap-2 rounded-full border border-primary/40 bg-ball-soft px-4 text-small font-medium text-ball-ink"
        >
          <UsersRound className="size-4" aria-hidden />
          {t("pill", { count: others })}
        </motion.a>
      ) : null}
    </AnimatePresence>
  );
}
