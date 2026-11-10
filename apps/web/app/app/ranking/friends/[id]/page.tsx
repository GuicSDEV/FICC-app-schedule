"use client";

import {
  clubToday,
  type FriendRankingDetail,
  FRIEND_RANKING_MAX_MEMBERS,
  type PlayerSummary,
  updateFriendRankingSchema,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Settings2, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { FriendRankingFields } from "@/components/ranking/friend-rankings";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";
import { cn } from "@/lib/utils";

/** "2030-03" moved by `delta` months. */
function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function ManageSheet({
  ranking,
  open,
  onOpenChange,
}: {
  ranking: FriendRankingDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("friendRankings");
  const client = useQueryClient();
  const router = useRouter();
  const { user } = useSession();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const isOwner = ranking.ownerId === user?.id;
  const [form, setForm] = useState({
    name: ranking.name,
    scope: ranking.scope,
    period: ranking.period,
  });
  const [adding, setAdding] = useState<PlayerSummary[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm({ name: ranking.name, scope: ranking.scope, period: ranking.period });
    setAdding([]);
    setConfirmDelete(false);
  }, [open, ranking]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.friendRankings });
  };
  const save = useMutation({
    mutationFn: () => api.ranking.updateFriends(ranking.id, form),
    onSuccess: () => {
      haptic();
      toast.success(t("saved"));
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const add = useMutation({
    mutationFn: () =>
      api.ranking.addFriends(
        ranking.id,
        adding.map((player) => player.id),
      ),
    onSuccess: () => {
      haptic([10, 30, 10]);
      toast.success(t("added"));
      setAdding([]);
      refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.ranking.removeFriend(ranking.id, userId),
    onSuccess: (_result, userId) => {
      haptic();
      if (userId === user?.id) {
        toast.success(t("left"));
        refresh();
        router.push("/app/ranking");
      } else refresh();
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const destroy = useMutation({
    mutationFn: () => api.ranking.deleteFriends(ranking.id),
    onSuccess: () => {
      haptic();
      toast.success(t("deleted"));
      refresh();
      router.push("/app/ranking");
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  const valid = updateFriendRankingSchema.safeParse(form);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("manageTitle")}>
      <div className="space-y-6">
        {isOwner ? (
          <>
            <FriendRankingFields {...form} onChange={setForm} />
            {valid.success ? null : (
              <p className="text-small text-danger-ink">{issueMessage(valid.error.issues[0])}</p>
            )}
            <Button
              block
              variant="secondary"
              disabled={!valid.success}
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              {t("saveChanges")}
            </Button>
          </>
        ) : null}
        <section className="space-y-2">
          <SectionLabel>{t("members", { count: ranking.entries.length })}</SectionLabel>
          <ul className="space-y-1">
            {ranking.entries.map((entry) => (
              <li key={entry.player.id} className="flex h-12 items-center gap-3">
                <Avatar name={entry.player.name} src={entry.player.photoUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate">
                  {entry.player.name}
                  {entry.player.id === ranking.ownerId ? (
                    <span className="text-caption text-muted-foreground"> · {t("owner")}</span>
                  ) : null}
                </span>
                {isOwner && entry.player.id !== ranking.ownerId ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("remove", { name: entry.player.name })}
                    loading={remove.isPending && remove.variables === entry.player.id}
                    onClick={() => remove.mutate(entry.player.id)}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        {isOwner && ranking.entries.length < FRIEND_RANKING_MAX_MEMBERS ? (
          <div className="space-y-3">
            <MemberPicker
              label={t("addFriends")}
              selected={adding}
              onChange={setAdding}
              max={FRIEND_RANKING_MAX_MEMBERS - ranking.entries.length}
              excludeIds={ranking.entries.map((entry) => entry.player.id)}
            />
            {adding.length > 0 ? (
              <Button block loading={add.isPending} onClick={() => add.mutate()}>
                {t("addConfirm", { count: adding.length })}
              </Button>
            ) : null}
          </div>
        ) : null}
        {isOwner ? (
          confirmDelete ? (
            <Button
              block
              variant="danger"
              loading={destroy.isPending}
              onClick={() => destroy.mutate()}
            >
              {t("deleteConfirm")}
            </Button>
          ) : (
            <Button block variant="dangerSoft" onClick={() => setConfirmDelete(true)}>
              {t("delete")}
            </Button>
          )
        ) : (
          <Button
            block
            variant="dangerSoft"
            loading={remove.isPending}
            onClick={() => user && remove.mutate(user.id)}
          >
            {t("leave")}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

/** One private ranking: the table for a month (or since it began), wins first. */
export default function FriendRankingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("friendRankings");
  const format = useFormat();
  const club = useClub();
  const { user } = useSession();
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [managing, setManaging] = useState(false);
  const ranking = useQuery({
    queryKey: queryKeys.friendRanking(id, month),
    queryFn: () => api.ranking.friend(id, month),
    placeholderData: (previous) => previous,
  });
  const data = ranking.data;
  const shown = data?.month ?? null;
  const thisMonth = club ? clubToday(new Date(), club.timezone).slice(0, 7) : null;

  return (
    <>
      <PageHeader
        title={data?.name ?? t("title")}
        subtitle={data ? t(`scopes.${data.scope}`) : " "}
        leading={<BackButton fallback="/app/ranking" />}
        actions={
          data ? (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("manage")}
              onClick={() => setManaging(true)}
            >
              <Settings2 />
            </Button>
          ) : null
        }
      />
      <div className="mx-auto mt-5 max-w-2xl space-y-4">
        {ranking.isError ? (
          <ErrorState message={t("loadFailed")} onRetry={() => void ranking.refetch()} />
        ) : !data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {shown ? (
              <div className="flex items-center justify-between gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("previousMonth")}
                  onClick={() => setMonth(shiftMonth(shown, -1))}
                >
                  <ChevronLeft />
                </Button>
                <p className="font-medium capitalize">{format.monthYear(`${shown}-01`)}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("nextMonth")}
                  disabled={thisMonth !== null && shown >= thisMonth}
                  onClick={() => setMonth(shiftMonth(shown, 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            ) : (
              <p className="text-small text-muted-foreground">
                {t("sinceStart", { date: format.day(data.createdAt.slice(0, 10)) })}
              </p>
            )}
            <ol className="space-y-2">
              {data.entries.map((entry, index) => (
                <motion.li
                  key={entry.player.id}
                  custom={index}
                  variants={listItemVariants}
                  initial={enter("hidden")}
                  animate="show"
                >
                  <Link
                    href={`/app/players/${entry.player.id}`}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2.5 transition-tokens",
                      entry.player.id === user?.id
                        ? "border-primary/50 bg-ball-soft"
                        : "border-border bg-card hover:bg-surface-2",
                    )}
                  >
                    <span className="w-7 shrink-0 text-center num text-small font-semibold text-muted-foreground">
                      {entry.rank}
                    </span>
                    <Avatar name={entry.player.name} src={entry.player.photoUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{entry.player.name}</span>
                      <span className="block num text-caption text-muted-foreground">
                        {entry.matches === 0
                          ? t("noMatches")
                          : t("record", {
                              wins: entry.wins,
                              losses: entry.losses,
                              rate: entry.winRate,
                            })}
                      </span>
                    </span>
                    <span className="num text-title font-semibold">{entry.wins}</span>
                  </Link>
                </motion.li>
              ))}
            </ol>
          </>
        )}
      </div>
      {data ? <ManageSheet ranking={data} open={managing} onOpenChange={setManaging} /> : null}
    </>
  );
}
