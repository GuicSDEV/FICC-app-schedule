"use client";

import { formatMembershipId, type MembershipImportResult, parseMembershipCsv } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Search, Users } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AdminHeader } from "@/components/admin/admin-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionLabel } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { haptic, listItemVariants, popVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useDebounced } from "@/lib/use-debounced";
import { useErrorMessage } from "@/lib/use-error-message";

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
          initial="hidden"
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

export default function AdminMembersPage() {
  const t = useTranslations("admin.members");
  const [term, setTerm] = useState("");
  const query = useDebounced(term.trim());
  const members = useQuery({
    queryKey: queryKeys.admin.members(query),
    queryFn: () => api.admin.members(query || undefined),
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
    <>
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
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
                  initial="hidden"
                  animate="show"
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Avatar name={entry.player.name} src={entry.player.photoUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{entry.player.name}</span>
                      {entry.isActive ? null : <Badge className="h-6 px-2">{t("inactive")}</Badge>}
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
                    </span>
                  </span>
                  <span className="shrink-0 num text-small text-muted-foreground">
                    {entry.player.elo}
                  </span>
                </motion.li>
              ))}
            </ul>
          )}
        </section>
        <MembershipImport />
      </div>
    </>
  );
}
