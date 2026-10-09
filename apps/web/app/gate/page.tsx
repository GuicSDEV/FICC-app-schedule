"use client";

import { type GatePassView, type GateScanResponse, gateSearchQuerySchema } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Keyboard, ScanLine, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { QrScanner } from "@/components/gate/qr-scanner";
import { ScanResult } from "@/components/gate/scan-result";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, fadeVariants, listItemVariants } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { useIssueMessage } from "@/lib/use-issue-message";

type Tab = "scan" | "manual" | "history";

function PassCard({
  pass,
  onCheckIn,
  pending,
}: {
  pass: GatePassView;
  onCheckIn: () => void;
  pending: boolean;
}) {
  const t = useTranslations("gate.manual");
  const format = useFormat();
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-title font-semibold">{pass.guestName}</p>
          <p className="num text-small text-muted-foreground">
            {pass.documentType} {pass.document}
          </p>
        </div>
        <Badge
          tone={
            pass.status === "ACTIVE" ? "ballSoft" : pass.status === "USED" ? "success" : "neutral"
          }
        >
          {t(`status.${pass.status}`)}
        </Badge>
      </div>
      <div className="flex items-center gap-2 text-small text-muted-foreground">
        <Avatar name={pass.host.name} src={pass.host.photoUrl} size="xs" />
        {t("hostedBy", { name: pass.host.name })} · {format.dayTitle(pass.visitDate)}
      </div>
      {pass.status === "ACTIVE" ? (
        <Button block onClick={onCheckIn} loading={pending}>
          {t("checkIn")}
        </Button>
      ) : pass.usedAt ? (
        <p className="text-small text-muted-foreground">
          {t("usedAt", { time: format.time(pass.usedAt) })}
        </p>
      ) : null}
    </div>
  );
}

export default function GatePage() {
  const t = useTranslations("gate");
  const labels = useTranslations("labels");
  const format = useFormat();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const issueMessage = useIssueMessage();
  const [tab, setTab] = useState<Tab>("scan");
  const [result, setResult] = useState<GateScanResponse | null>(null);
  const [document, setDocument] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const show = (response: GateScanResponse) => {
    setResult(response);
    void client.invalidateQueries({ queryKey: queryKeys.gateScans });
  };

  const scan = useMutation({
    mutationFn: api.gate.scan,
    onSuccess: show,
    onError: (failure) => toast.error(errorMessage(failure, t("scanFailed"))),
  });
  const checkIn = useMutation({
    mutationFn: api.gate.checkIn,
    onSuccess: (response) => {
      show(response);
      void client.invalidateQueries({ queryKey: ["gate", "passes"] });
    },
    onError: (failure) => toast.error(errorMessage(failure, t("scanFailed"))),
  });
  const passes = useQuery({
    queryKey: ["gate", "passes", searched],
    queryFn: () => api.gate.search(searched!),
    enabled: searched !== null,
  });
  const scans = useQuery({
    queryKey: queryKeys.gateScans,
    queryFn: api.gate.scans,
    enabled: tab === "history",
  });

  const onScan = useCallback((token: string) => scan.mutate(token), [scan]);
  const close = useCallback(() => setResult(null), []);

  function search() {
    const parsed = gateSearchQuerySchema.safeParse({ document });
    if (!parsed.success) {
      setSearchError(issueMessage(parsed.error.issues[0]));
      return;
    }
    setSearchError(null);
    setSearched(document);
  }

  return (
    <>
      {/* The gate shell already has a sticky header, so this title block scrolls away. */}
      <div className="pt-5">
        <h1 className="font-display text-headline font-semibold">{t("title")}</h1>
        <p className="mb-4 text-small text-muted-foreground">{t("subtitle")}</p>
        <SegmentedControl
          label={t("tabs.label")}
          options={[
            { value: "scan", label: t("tabs.scan") },
            { value: "manual", label: t("tabs.manual") },
            { value: "history", label: t("tabs.history") },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === "scan" ? (
          <motion.section
            key="scan"
            variants={fadeVariants}
            initial={enter("hidden")}
            animate="show"
            exit="exit"
            aria-label={t("tabs.scan")}
            className="mt-5 space-y-4"
          >
            <QrScanner paused={result !== null || scan.isPending} onResult={onScan} />
            <p className="flex items-center justify-center gap-2 text-center text-small text-muted-foreground">
              <ScanLine className="size-4" aria-hidden /> {t("scanHint")}
            </p>
            <Button variant="ghost" block onClick={() => setTab("manual")}>
              <Keyboard /> {t("noCamera")}
            </Button>
          </motion.section>
        ) : tab === "manual" ? (
          <motion.section
            key="manual"
            variants={fadeVariants}
            initial={enter("hidden")}
            animate="show"
            exit="exit"
            aria-label={t("tabs.manual")}
            className="mt-5 space-y-4"
          >
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                search();
              }}
            >
              <Input
                value={document}
                onChange={(event) => setDocument(event.target.value)}
                placeholder={t("manual.placeholder")}
                aria-label={t("manual.label")}
                inputMode="text"
                autoComplete="off"
                className="num"
                aria-invalid={Boolean(searchError) || undefined}
              />
              <Button type="submit" size="icon" aria-label={t("manual.search")} className="size-12">
                <Search />
              </Button>
            </form>
            <FieldError>{searchError}</FieldError>
            <p className="text-small text-muted-foreground">{t("manual.hint")}</p>
            {searched === null ? null : passes.isError ? (
              <ErrorState onRetry={() => void passes.refetch()} />
            ) : passes.isLoading ? (
              <Skeleton className="h-40 rounded-lg" />
            ) : (passes.data ?? []).length === 0 ? (
              <EmptyState
                icon={Search}
                title={t("manual.noneTitle")}
                description={t("manual.noneDescription")}
              />
            ) : (
              <ul className="space-y-3">
                {passes.data!.map((pass, index) => (
                  <motion.li
                    key={pass.id}
                    custom={index}
                    variants={listItemVariants}
                    initial={enter("hidden")}
                    animate="show"
                  >
                    <PassCard
                      pass={pass}
                      pending={checkIn.isPending && checkIn.variables === pass.id}
                      onCheckIn={() => checkIn.mutate(pass.id)}
                    />
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.section>
        ) : (
          <motion.section
            key="history"
            variants={fadeVariants}
            initial={enter("hidden")}
            animate="show"
            exit="exit"
            aria-label={t("tabs.history")}
            className="mt-5"
          >
            {scans.isError ? (
              <ErrorState onRetry={() => void scans.refetch()} />
            ) : scans.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((key) => (
                  <Skeleton key={key} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : (scans.data ?? []).length === 0 ? (
              <EmptyState
                icon={History}
                title={t("history.emptyTitle")}
                description={t("history.emptyDescription")}
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {scans.data!.map((entry, index) => (
                  <motion.li
                    key={entry.id}
                    custom={index}
                    variants={listItemVariants}
                    initial={enter("hidden")}
                    animate="show"
                    className="flex min-h-16 items-center gap-3 px-4 py-3"
                  >
                    <span
                      aria-hidden
                      className={
                        entry.result === "ACCEPTED"
                          ? "size-2.5 shrink-0 rounded-full bg-success"
                          : "size-2.5 shrink-0 rounded-full bg-danger"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-medium">
                        {labels(`gateScanResult.${entry.result}`)}
                        {entry.guestName ? ` · ${entry.guestName}` : ""}
                      </span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {entry.hostName ? t("history.host", { name: entry.hostName }) + " · " : ""}
                        {t(`history.method.${entry.method}`)} · {entry.scannedBy}
                      </span>
                    </span>
                    <span className="shrink-0 num text-caption text-muted-foreground">
                      {format.time(entry.scannedAt)}
                    </span>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result ? <ScanResult key={result.scannedAt} result={result} onClose={close} /> : null}
      </AnimatePresence>
    </>
  );
}
