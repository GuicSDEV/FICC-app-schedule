"use client";

import {
  type AdminMemberItem,
  formatMembershipId,
  hasPermission,
  type MembershipImportResult,
  parseMembershipCsv,
  type PendingSignup,
  signupDecisionSchema,
  type UserStatus,
} from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Search, UserCheck, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AdminHeader } from "@/components/admin/admin-header";
import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { ChoiceChip, ChipGroup } from "@/components/ui/choice-chip";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, haptic, listItemVariants, popVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useDebounced } from "@/lib/use-debounced";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";

/** Imports the list of valid matrículas (CSV "matricula,nome") used to validate sign-ups. */
function MembershipImport() {
  const t = useTranslations("admin.members");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<MembershipImportResult | null>(null);
  const preview = csv.trim() ? parseMembershipCsv(csv) : null;

  const upload = useMutation({
    mutationFn: () => api.admin.importMemberships(csv),
    onSuccess: (data) => {
      haptic();
      setResult(data);
      toast.success(t("imported", { created: data.created, updated: data.updated }));
      void client.invalidateQueries({ queryKey: ["admin", "members"] });
    },
    onError: (failure) => toast.error(errorMessage(failure, t("importFailed"))),
  });

  async function readFile(file: File | undefined) {
    if (!file) return;
    setCsv(await file.text());
    setResult(null);
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <SectionLabel>{t("importTitle")}</SectionLabel>
        <p className="mt-1 text-small text-muted-foreground">{t("importDescription")}</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        onChange={(event) => void readFile(event.target.files?.[0])}
        aria-label={t("chooseFile")}
      />
      <Button variant="secondary" onClick={() => fileRef.current?.click()}>
        <FileUp /> {t("chooseFile")}
      </Button>
      <Textarea
        value={csv}
        onChange={(event) => {
          setCsv(event.target.value);
          setResult(null);
        }}
        placeholder={"matricula,nome\n104218,Rafael Almeida"}
        aria-label={t("paste")}
        className="min-h-32 num text-small"
      />
      {preview ? (
        <p className="text-small text-muted-foreground">
          {t("preview", { rows: preview.rows.length, errors: preview.errors.length })}
          {preview.errors.length > 0
            ? ` ${t("previewErrors", {
                lines: preview.errors
                  .slice(0, 5)
                  .map((error) => error.line)
                  .join(", "),
              })}`
            : ""}
        </p>
      ) : null}
      <Button
        block
        loading={upload.isPending}
        disabled={!preview || preview.rows.length === 0}
        onClick={() => upload.mutate()}
      >
        {t("import")}
      </Button>
      {result ? (
        <motion.div
          variants={popVariants}
          initial={enter("hidden")}
          animate="show"
          className="rounded-md bg-surface-2 px-4 py-3 text-small"
        >
          <p className="font-medium">
            {t("imported", { created: result.created, updated: result.updated })}
          </p>
          {result.errors.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {result.errors.slice(0, 10).map((error) => (
                <li key={error.line}>
                  {t("lineError", { line: error.line, message: error.message })}
                </li>
              ))}
            </ul>
          ) : null}
        </motion.div>
      ) : null}
    </Card>
  );
}

/** Rejects a sign-up with a reason the person reads when trying to log in. */
function RejectSheet({
  signup,
  onOpenChange,
}: {
  signup: PendingSignup | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.members.approvals");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const input = { decision: "REJECT" as const, reason };
  const check = signupDecisionSchema.safeParse(input);
  const reject = useMutation({
    mutationFn: () => api.admin.decideMember(signup!.id, input),
    onSuccess: () => {
      haptic();
      toast.success(t("rejected", { name: signup!.name }));
      void client.invalidateQueries({ queryKey: queryKeys.admin.pendingMembers });
      void client.invalidateQueries({ queryKey: ["admin", "members"] });
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });
  return (
    <Sheet
      open={signup !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          setTouched(false);
        }
        onOpenChange(open);
      }}
      title={t("rejectTitle", { name: signup?.name ?? "" })}
      description={t("rejectHint")}
      footer={
        <Button
          size="lg"
          block
          variant="danger"
          loading={reject.isPending}
          onClick={() => {
            setTouched(true);
            if (check.success) reject.mutate();
          }}
        >
          {t("reject")}
        </Button>
      }
    >
      <Field
        label={t("reason")}
        htmlFor="reject-reason"
        error={touched && !check.success ? issueMessage(check.error.issues[0]) : undefined}
      >
        <Textarea
          id="reject-reason"
          value={reason}
          maxLength={300}
          placeholder={t("reasonPlaceholder")}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </Sheet>
  );
}

function ApprovalsPanel() {
  const t = useTranslations("admin.members.approvals");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const format = useFormat();
  const pending = useQuery({
    queryKey: queryKeys.admin.pendingMembers,
    queryFn: api.admin.pendingMembers,
  });
  const [rejecting, setRejecting] = useState<PendingSignup | null>(null);
  const approve = useMutation({
    mutationFn: (signup: PendingSignup) =>
      api.admin.decideMember(signup.id, { decision: "APPROVE" }),
    onSuccess: (_, signup) => {
      haptic([10, 30, 10]);
      toast.success(t("approved", { name: signup.name }));
      client.setQueryData<PendingSignup[]>(queryKeys.admin.pendingMembers, (current) =>
        current?.filter((entry) => entry.id !== signup.id),
      );
      void client.invalidateQueries({ queryKey: ["admin", "members"] });
    },
    onError: (failure) => toast.error(errorMessage(failure)),
  });

  if (pending.isError) return <ErrorState onRetry={() => void pending.refetch()} />;
  if (!pending.data) {
    return (
      <div className="space-y-2">
        {[0, 1].map((key) => (
          <Skeleton key={key} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <section className="space-y-3" aria-label={t("title")}>
      <p className="text-small text-muted-foreground">{t("hint")}</p>
      {pending.data.length === 0 ? (
        <EmptyState icon={UserCheck} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {pending.data.map((signup, index) => {
              const nameDiffers =
                signup.listedName !== null &&
                signup.listedName.trim().toLowerCase() !== signup.name.trim().toLowerCase();
              return (
                <motion.li
                  key={signup.id}
                  layout
                  custom={index}
                  variants={listItemVariants}
                  initial={enter("hidden")}
                  animate="show"
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={signup.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{signup.name}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        <span className="num">{formatMembershipId(signup.membershipId)}</span> ·{" "}
                        {t("signedUp", { when: format.relative(signup.createdAt) })}
                      </p>
                    </div>
                  </div>
                  {signup.listedName ? (
                    <p
                      className={
                        nameDiffers
                          ? "text-small text-warning-ink"
                          : "text-small text-muted-foreground"
                      }
                    >
                      {t(nameDiffers ? "listedNameDiffers" : "listedName", {
                        name: signup.listedName,
                      })}
                    </p>
                  ) : (
                    <p className="text-small text-muted-foreground">{t("notListed")}</p>
                  )}
                  {signup.holderMembershipId ? (
                    <p className="text-small text-muted-foreground">
                      {t("dependentOf", { holder: formatMembershipId(signup.holderMembershipId) })}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setRejecting(signup)}>
                      {t("reject")}
                    </Button>
                    <Button
                      loading={approve.isPending && approve.variables?.id === signup.id}
                      onClick={() => approve.mutate(signup)}
                    >
                      {t("approve")}
                    </Button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <RejectSheet signup={rejecting} onOpenChange={(open) => !open && setRejecting(null)} />
    </section>
  );
}

/** A member's details: status, dependents and no-show history. */
function MemberSheet({
  member,
  onOpenChange,
}: {
  member: AdminMemberItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("admin.members");
  const labels = useTranslations("labels");
  const format = useFormat();
  const { user } = useSession();
  const canNoShows = hasPermission(user, "BOOKINGS_MANAGE");
  const history = useQuery({
    queryKey: queryKeys.admin.memberNoShows(member?.player.id ?? ""),
    queryFn: () => api.admin.memberNoShows(member!.player.id),
    enabled: member !== null && canNoShows,
  });
  return (
    <Sheet
      open={member !== null}
      onOpenChange={onOpenChange}
      title={member?.player.name ?? ""}
      description={
        member?.player.membershipId ? formatMembershipId(member.player.membershipId) : undefined
      }
    >
      {member ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge
              tone={
                member.status === "ACTIVE"
                  ? "success"
                  : member.status === "PENDING"
                    ? "warning"
                    : "danger"
              }
            >
              {labels(`userStatus.${member.status}`)}
            </Badge>
            {member.isActive ? null : <Badge>{t("inactive")}</Badge>}
            {member.bookingSuspendedUntil ? (
              <Badge tone="danger">
                {t("suspendedUntil", { date: format.dateTime(member.bookingSuspendedUntil) })}
              </Badge>
            ) : null}
            {member.guestPassesSuspended ? (
              <Badge tone="danger">{t("guestsSuspended")}</Badge>
            ) : null}
          </div>
          {member.dependents.length > 0 ? (
            <section className="space-y-2">
              <SectionLabel>{t("dependents")}</SectionLabel>
              <ul className="space-y-1 text-small">
                {member.dependents.map((dependent) => (
                  <li key={dependent.id} className="flex justify-between gap-3">
                    <span className="truncate">{dependent.name}</span>
                    <span className="num text-muted-foreground">
                      {formatMembershipId(dependent.membershipId)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {canNoShows ? (
            <section className="space-y-2">
              <SectionLabel>{t("noShows.title")}</SectionLabel>
              {history.isError ? (
                <ErrorState onRetry={() => void history.refetch()} />
              ) : !history.data ? (
                <Skeleton className="h-24 rounded-lg" />
              ) : history.data.items.length === 0 ? (
                <p className="text-small text-muted-foreground">{t("noShows.empty")}</p>
              ) : (
                <>
                  <p className="text-small text-muted-foreground">
                    {t("noShows.recent", { count: history.data.recent })}
                  </p>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {history.data.items.map((item) => (
                      <li key={item.id} className="space-y-0.5 px-4 py-3">
                        <p className="flex flex-wrap items-center gap-2 text-small font-medium">
                          <Badge
                            tone={item.kind === "NO_SHOW" ? "danger" : "warning"}
                            className="h-6 px-2"
                          >
                            {labels(`noShowKind.${item.kind}`)}
                          </Badge>
                          {format.dayTitle(item.date)} ·{" "}
                          <span className="num">{item.startTime}</span> · {item.courtName}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {item.markedBy
                            ? t("noShows.markedBy", { name: item.markedBy })
                            : t("noShows.automatic")}
                          {item.note ? ` · ${item.note}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

const STATUS_FILTERS = ["ALL", "ACTIVE", "PENDING", "REJECTED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function MembersPanel() {
  const t = useTranslations("admin.members");
  const labels = useTranslations("labels");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [open, setOpen] = useState<AdminMemberItem | null>(null);
  const query = useDebounced(term.trim());
  const statusParam: UserStatus | undefined = status === "ALL" ? undefined : status;
  const members = useQuery({
    queryKey: queryKeys.admin.members(query, statusParam),
    queryFn: () => api.admin.members(query || undefined, statusParam),
    placeholderData: (previous) => previous,
  });
  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: api.categories,
    staleTime: 60 * 60_000,
  });
  const categoryName = (key: string) =>
    categories.data?.find((entry) => entry.key === key)?.name ?? key;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section className="space-y-3" aria-label={t("listTitle")}>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="pl-11"
            enterKeyHint="search"
          />
        </div>
        <ChipGroup label={t("statusFilter")} className="no-scrollbar flex-nowrap overflow-x-auto">
          {STATUS_FILTERS.map((entry) => (
            <ChoiceChip key={entry} selected={status === entry} onClick={() => setStatus(entry)}>
              {entry === "ALL" ? t("allStatuses") : labels(`userStatus.${entry}`)}
            </ChoiceChip>
          ))}
        </ChipGroup>
        {members.isError ? (
          <ErrorState onRetry={() => void members.refetch()} />
        ) : !members.data ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : members.data.length === 0 ? (
          <EmptyState icon={Users} title={t("empty")} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {members.data.map((entry, index) => (
              <motion.li
                key={entry.player.id}
                custom={index}
                variants={listItemVariants}
                initial={enter("hidden")}
                animate="show"
              >
                <motion.button
                  type="button"
                  whileTap={tap}
                  onClick={() => setOpen(entry)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-tokens hover:bg-surface-2"
                >
                  <Avatar name={entry.player.name} src={entry.player.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{entry.player.name}</span>
                      {entry.status !== "ACTIVE" ? (
                        <Badge
                          tone={entry.status === "PENDING" ? "warning" : "danger"}
                          className="h-6 px-2"
                        >
                          {labels(`userStatus.${entry.status}`)}
                        </Badge>
                      ) : null}
                      {entry.isActive ? null : <Badge className="h-6 px-2">{t("inactive")}</Badge>}
                      {entry.bookingSuspendedUntil ? (
                        <Badge tone="danger" className="h-6 px-2">
                          {t("bookingSuspended")}
                        </Badge>
                      ) : null}
                      {entry.recentNoShows > 0 ? (
                        <Badge tone="warning" className="h-6 px-2">
                          {t("noShowsBadge", { count: entry.recentNoShows })}
                        </Badge>
                      ) : null}
                      {entry.guestPassesSuspended ? (
                        <Badge tone="danger" className="h-6 px-2">
                          {t("guestsSuspended")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {entry.player.membershipId
                        ? formatMembershipId(entry.player.membershipId)
                        : "—"}{" "}
                      · {entry.player.categories.map(categoryName).join(", ")}
                      {entry.dependents.length > 0
                        ? ` · ${t("dependentsCount", { count: entry.dependents.length })}`
                        : ""}
                    </span>
                  </span>
                  <span className="shrink-0 num text-small text-muted-foreground">
                    {entry.player.elo}
                  </span>
                </motion.button>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
      <MembershipImport />
      <MemberSheet member={open} onOpenChange={(next) => !next && setOpen(null)} />
    </div>
  );
}

type Tab = "members" | "approvals";

export default function AdminMembersPage() {
  const t = useTranslations("admin.members");
  const { user } = useSession();
  const canManage = hasPermission(user, "MEMBERS_MANAGE");
  const canApprove = hasPermission(user, "MEMBERS_APPROVE");
  const pending = useQuery({
    queryKey: queryKeys.admin.pendingMembers,
    queryFn: api.admin.pendingMembers,
    enabled: canApprove,
  });
  const [chosen, setChosen] = useState<Tab>("members");
  const tab: Tab = !canManage ? "approvals" : !canApprove ? "members" : chosen;
  const waiting = pending.data?.length ?? 0;

  return (
    <>
      <AdminHeader
        title={t("title")}
        subtitle={canManage ? t("subtitle") : t("approvals.subtitle")}
      />
      {canManage && canApprove ? (
        <SegmentedControl
          label={t("title")}
          value={tab}
          onChange={setChosen}
          options={[
            { value: "members", label: t("tabs.members") },
            {
              value: "approvals",
              label:
                waiting > 0 ? t("tabs.approvalsCount", { count: waiting }) : t("tabs.approvals"),
            },
          ]}
          className="mt-5 max-w-md"
        />
      ) : null}
      <div className="mt-6">{tab === "approvals" ? <ApprovalsPanel /> : <MembersPanel />}</div>
    </>
  );
}
