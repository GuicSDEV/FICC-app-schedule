"use client";

import {
  createFriendRankingSchema,
  FRIEND_RANKING_MAX_MEMBERS,
  type FriendRankingPeriod,
  type FriendRankingScope,
  type PlayerSummary,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, UsersRound } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MemberPicker } from "@/components/members/member-picker";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useIssueMessage } from "@/lib/use-issue-message";

/** Name, what counts and the period of a friends' ranking (create and manage share it). */
export function FriendRankingFields({
  name,
  scope,
  period,
  onChange,
}: {
  name: string;
  scope: FriendRankingScope;
  period: FriendRankingPeriod;
  onChange: (next: {
    name: string;
    scope: FriendRankingScope;
    period: FriendRankingPeriod;
  }) => void;
}) {
  const t = useTranslations("friendRankings");
  return (
    <div className="space-y-5">
      <Field label={t("name")} htmlFor="friends-name">
        <Input
          id="friends-name"
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(event) => onChange({ name: event.target.value, scope, period })}
        />
      </Field>
      <div className="space-y-2">
        <SegmentedControl
          label={t("scope")}
          value={scope}
          onChange={(next) => onChange({ name, scope: next, period })}
          options={[
            { value: "AMONG_MEMBERS", label: t("scopes.AMONG_MEMBERS") },
            { value: "ALL_MATCHES", label: t("scopes.ALL_MATCHES") },
          ]}
        />
        <p className="text-small text-muted-foreground">{t(`scopeHints.${scope}`)}</p>
      </div>
      <SegmentedControl
        label={t("period")}
        value={period}
        onChange={(next) => onChange({ name, scope, period: next })}
        options={[
          { value: "MONTHLY", label: t("periods.MONTHLY") },
          { value: "SINCE_START", label: t("periods.SINCE_START") },
        ]}
      />
    </div>
  );
}

function CreateSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("friendRankings");
  const { user } = useSession();
  const router = useRouter();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [form, setForm] = useState({
    name: "",
    scope: "AMONG_MEMBERS" as FriendRankingScope,
    period: "MONTHLY" as FriendRankingPeriod,
  });
  const [friends, setFriends] = useState<PlayerSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setForm({ name: "", scope: "AMONG_MEMBERS", period: "MONTHLY" });
    setFriends([]);
    setError(null);
  }, [open]);
  const input = { ...form, memberIds: friends.map((friend) => friend.id) };
  const create = useMutation({
    mutationFn: () => api.ranking.createFriends(input),
    onSuccess: (created) => {
      haptic([10, 30, 10]);
      toast.success(t("created"));
      void client.invalidateQueries({ queryKey: queryKeys.friendRankings });
      onOpenChange(false);
      router.push(`/app/ranking/friends/${created.id}`);
    },
    onError: (failure) => setError(errorMessage(failure)),
  });
  function submit() {
    const parsed = createFriendRankingSchema.safeParse(input);
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]));
      return;
    }
    setError(null);
    create.mutate();
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("createTitle")}
      footer={
        <Button block size="lg" loading={create.isPending} onClick={submit}>
          {t("save")}
        </Button>
      }
    >
      <div className="space-y-5">
        <FriendRankingFields {...form} onChange={setForm} />
        <MemberPicker
          label={t("friends")}
          selected={friends}
          onChange={setFriends}
          max={FRIEND_RANKING_MAX_MEMBERS - 1}
          excludeIds={user ? [user.id] : []}
        />
        {error ? <p className="text-small text-danger-ink">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/** The member's private rankings on the ranking page, and the button to create one. */
export function FriendRankingsCard() {
  const t = useTranslations("friendRankings");
  const rankings = useQuery({ queryKey: queryKeys.friendRankings, queryFn: api.ranking.friends });
  const [creating, setCreating] = useState(false);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ball-soft text-ball-ink">
          <UsersRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <SectionLabel>{t("title")}</SectionLabel>
          <p className="mt-0.5 text-small text-muted-foreground">{t("hint")}</p>
        </div>
      </div>
      {!rankings.data ? (
        <Skeleton className="h-14 rounded-lg" />
      ) : rankings.data.length === 0 ? null : (
        <ul className="space-y-2">
          {rankings.data.map((ranking, index) => (
            <motion.li
              key={ranking.id}
              custom={index}
              variants={listItemVariants}
              initial={enter("hidden")}
              animate="show"
            >
              <Link
                href={`/app/ranking/friends/${ranking.id}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 transition-tokens hover:bg-surface-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{ranking.name}</span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {t("members", { count: ranking.members })} ·{" "}
                    {ranking.leader ? t("leader", { name: ranking.leader.name }) : t("noLeader")}
                  </span>
                </span>
                {ranking.myRank ? (
                  <span className="num text-small font-semibold">{ranking.myRank}º</span>
                ) : null}
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
      <Button block variant="secondary" onClick={() => setCreating(true)}>
        <Plus /> {t("create")}
      </Button>
      <CreateSheet open={creating} onOpenChange={setCreating} />
    </Card>
  );
}
