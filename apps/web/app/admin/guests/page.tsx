"use client";

import { formatMembershipId } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileX2, ShieldBan, UserCheck, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminHeader } from "@/components/admin/admin-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, fadeVariants, haptic, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";

type Tab = "hosts" | "documents" | "blocks";

/** Asks for a reason before suspending a member or blocking a document. */
function ReasonSheet({
  title,
  description,
  required,
  submitLabel,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  title: string;
  description: string;
  required: boolean;
  submitLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const t = useTranslations("admin.guests");
  const validation = useTranslations("validation");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <Button
          block
          size="lg"
          variant="danger"
          loading={pending}
          onClick={() => {
            if (required && !reason.trim()) return setError(validation("reasonRequired"));
            onSubmit(reason.trim());
          }}
        >
          {submitLabel}
        </Button>
      }
    >
      <Field label={required ? t("reason") : t("reasonOptional")} htmlFor="reason">
        <Textarea
          id="reason"
          value={reason}
          maxLength={300}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
      </Field>
      <div className="mt-2">
        <FieldError>{error}</FieldError>
      </div>
    </Sheet>
  );
}

/** Guest accountability: passes per member and per document, blocks and suspensions. */
export default function AdminGuestsPage() {
  const t = useTranslations("admin.guests");
  const format = useFormat();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [tab, setTab] = useState<Tab>("hosts");
  const [suspending, setSuspending] = useState<{ id: string; name: string } | null>(null);
  const [blocking, setBlocking] = useState<{ passId: string; label: string } | null>(null);

  const hosts = useQuery({
    queryKey: queryKeys.admin.guestHosts,
    queryFn: api.admin.guestHosts,
    enabled: tab === "hosts",
  });
  const documents = useQuery({
    queryKey: queryKeys.admin.guestDocuments,
    queryFn: api.admin.guestDocuments,
    enabled: tab === "documents",
  });
  const blocks = useQuery({
    queryKey: queryKeys.admin.guestBlocks,
    queryFn: api.admin.guestBlocks,
    enabled: tab === "blocks",
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["admin", "guests"] });
  const fail = (fallback: string) => (failure: unknown) =>
    toast.error(errorMessage(failure, fallback));

  const suspend = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.admin.suspendGuests(id, reason),
    onSuccess: () => {
      haptic();
      toast.success(t("suspended"));
      setSuspending(null);
      refresh();
    },
    onError: fail(t("actionFailed")),
  });
  const unsuspend = useMutation({
    mutationFn: api.admin.unsuspendGuests,
    onSuccess: () => {
      toast.success(t("unsuspended"));
      refresh();
    },
    onError: fail(t("actionFailed")),
  });
  const block = useMutation({
    mutationFn: ({ passId, reason }: { passId: string; reason: string }) =>
      api.admin.blockFromPass(passId, reason || undefined),
    onSuccess: () => {
      haptic();
      toast.success(t("blocked"));
      setBlocking(null);
      refresh();
    },
    onError: fail(t("actionFailed")),
  });
  const lift = useMutation({
    mutationFn: api.admin.liftBlock,
    onSuccess: () => {
      toast.success(t("lifted"));
      refresh();
    },
    onError: fail(t("actionFailed")),
  });

  const loading = (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((key) => (
        <Skeleton key={key} className="h-16 rounded-lg" />
      ))}
    </div>
  );

  return (
    <>
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      <SegmentedControl
        label={t("tabs.label")}
        options={[
          { value: "hosts", label: t("tabs.hosts") },
          { value: "documents", label: t("tabs.documents") },
          { value: "blocks", label: t("tabs.blocks") },
        ]}
        value={tab}
        onChange={setTab}
        className="mt-5 md:max-w-md"
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          variants={fadeVariants}
          initial={enter("hidden")}
          animate="show"
          exit="exit"
          className="mt-5"
        >
          {tab === "hosts" ? (
            hosts.isError ? (
              <ErrorState onRetry={() => void hosts.refetch()} />
            ) : hosts.isLoading ? (
              loading
            ) : (hosts.data ?? []).length === 0 ? (
              <EmptyState icon={Users} title={t("hostsEmpty")} />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {hosts.data!.map((entry, index) => (
                  <motion.li
                    key={entry.host.id}
                    custom={index}
                    variants={listItemVariants}
                    initial={enter("hidden")}
                    animate="show"
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <Avatar name={entry.host.name} src={entry.host.photoUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{entry.host.name}</span>
                        {entry.suspended ? (
                          <Badge tone="danger" className="h-6 px-2">
                            {t("suspendedBadge")}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {entry.host.membershipId
                          ? `${formatMembershipId(entry.host.membershipId)} · `
                          : ""}
                        {t("hostStats", { passes: entry.passes, visits: entry.visits })}
                        {entry.lastVisit
                          ? ` · ${t("lastVisit", { day: format.day(entry.lastVisit) })}`
                          : ""}
                      </span>
                      {entry.suspendedReason ? (
                        <span className="block truncate text-caption text-danger-ink">
                          {entry.suspendedReason}
                        </span>
                      ) : null}
                    </span>
                    {entry.suspended ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={unsuspend.isPending && unsuspend.variables === entry.host.id}
                        onClick={() => unsuspend.mutate(entry.host.id)}
                      >
                        {t("unsuspend")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="dangerSoft"
                        onClick={() => setSuspending({ id: entry.host.id, name: entry.host.name })}
                      >
                        {t("suspend")}
                      </Button>
                    )}
                  </motion.li>
                ))}
              </ul>
            )
          ) : tab === "documents" ? (
            documents.isError ? (
              <ErrorState onRetry={() => void documents.refetch()} />
            ) : documents.isLoading ? (
              loading
            ) : (documents.data ?? []).length === 0 ? (
              <EmptyState icon={UserCheck} title={t("documentsEmpty")} />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {documents.data!.map((entry, index) => (
                  <motion.li
                    key={entry.samplePassId}
                    custom={index}
                    variants={listItemVariants}
                    initial={enter("hidden")}
                    animate="show"
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{entry.guestName}</span>
                        {entry.blocked ? (
                          <Badge tone="danger" className="h-6 px-2">
                            {t("blockedBadge")}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block truncate num text-caption text-muted-foreground">
                        {entry.documentType} {entry.documentMasked}
                      </span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {t("documentStats", { passes: entry.passes, visits: entry.visits })} ·{" "}
                        {entry.hosts.join(", ")}
                        {entry.lastVisit
                          ? ` · ${t("lastVisit", { day: format.day(entry.lastVisit) })}`
                          : ""}
                      </span>
                    </span>
                    {entry.blocked ? null : (
                      <Button
                        size="sm"
                        variant="dangerSoft"
                        onClick={() =>
                          setBlocking({
                            passId: entry.samplePassId,
                            label: `${entry.guestName} (${entry.documentMasked})`,
                          })
                        }
                      >
                        <ShieldBan className="size-4" /> {t("block")}
                      </Button>
                    )}
                  </motion.li>
                ))}
              </ul>
            )
          ) : blocks.isError ? (
            <ErrorState onRetry={() => void blocks.refetch()} />
          ) : blocks.isLoading ? (
            loading
          ) : (blocks.data ?? []).length === 0 ? (
            <EmptyState icon={FileX2} title={t("blocksEmpty")} />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {blocks.data!.map((entry, index) => (
                <motion.li
                  key={entry.id}
                  custom={index}
                  variants={listItemVariants}
                  initial={enter("hidden")}
                  animate="show"
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block num font-medium">
                      {entry.documentType} {entry.documentMasked}
                    </span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {t("blockedBy", {
                        name: entry.blockedBy,
                        when: format.dateTime(entry.createdAt),
                      })}
                      {entry.reason ? ` · ${entry.reason}` : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={lift.isPending && lift.variables === entry.id}
                    onClick={() => lift.mutate(entry.id)}
                  >
                    {t("lift")}
                  </Button>
                </motion.li>
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>

      <ReasonSheet
        open={suspending !== null}
        onOpenChange={(open) => !open && setSuspending(null)}
        title={t("suspendTitle", { name: suspending?.name ?? "" })}
        description={t("suspendDescription")}
        required
        submitLabel={t("suspend")}
        pending={suspend.isPending}
        onSubmit={(reason) => suspending && suspend.mutate({ id: suspending.id, reason })}
      />
      <ReasonSheet
        open={blocking !== null}
        onOpenChange={(open) => !open && setBlocking(null)}
        title={t("blockTitle")}
        description={t("blockDescription", { guest: blocking?.label ?? "" })}
        required={false}
        submitLabel={t("block")}
        pending={block.isPending}
        onSubmit={(reason) => blocking && block.mutate({ passId: blocking.passId, reason })}
      />
    </>
  );
}
