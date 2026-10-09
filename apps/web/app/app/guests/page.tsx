"use client";

import { clubToday, type GuestPassItem } from "@ficc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { GuestPassSheet } from "@/components/guests/guest-pass-sheet";
import { QrCard } from "@/components/guests/qr-card";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { NotificationBell } from "@/components/shell/notification-bell";
import { PageHeader } from "@/components/shell/page-header";
import { AlertBanner } from "@/components/ui/alert-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/card";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { enter, listItemVariants, tap } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";
import { useErrorMessage } from "@/lib/use-error-message";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

type PassState = "valid" | "used" | "cancelled" | "expired";

function passState(pass: GuestPassItem, today: string): PassState {
  if (pass.status === "USED") return "used";
  if (pass.status === "CANCELLED") return "cancelled";
  return pass.visitDate < today ? "expired" : "valid";
}

const STATE_TONE = {
  valid: "ballSoft",
  used: "success",
  cancelled: "neutral",
  expired: "neutral",
} as const;

function PassRow({
  pass,
  state,
  index,
  onOpen,
}: {
  pass: GuestPassItem;
  state: PassState;
  index: number;
  onOpen?: () => void;
}) {
  const t = useTranslations("guests");
  const format = useFormat();
  const content = (
    <>
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full",
          state === "valid"
            ? "bg-primary text-primary-foreground"
            : "bg-surface-2 text-muted-foreground",
        )}
      >
        <QrCode className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {pass.anonymized ? t("anonymized") : pass.guestName}
        </span>
        <span className="block truncate text-caption text-muted-foreground">
          {format.dayTitle(pass.visitDate)}
          {pass.documentMasked ? ` · ${pass.documentMasked}` : ""}
          {pass.booking ? ` · ${pass.booking.courtName} ${pass.booking.startTime}` : ""}
        </span>
      </span>
      <Badge tone={STATE_TONE[state]} className="h-6 shrink-0 px-2.5">
        {state === "used" && pass.usedAt
          ? t("usedAt", { time: format.time(pass.usedAt) })
          : t(`state.${state}`)}
      </Badge>
    </>
  );
  return (
    <motion.li
      custom={index}
      variants={listItemVariants}
      initial={enter("hidden")}
      animate="show"
      exit="exit"
    >
      {onOpen ? (
        <motion.button
          type="button"
          whileTap={tap}
          onClick={onOpen}
          aria-label={t("openPass", { guest: pass.guestName ?? "" })}
          className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-card transition-tokens hover:bg-surface-2"
        >
          {content}
        </motion.button>
      ) : (
        <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5">
          {content}
        </div>
      )}
    </motion.li>
  );
}

function PassSheet({
  pass,
  onOpenChange,
}: {
  pass: GuestPassItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("guests");
  const common = useTranslations("common");
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [confirming, setConfirming] = useState(false);
  const [shown, setShown] = useState<GuestPassItem | null>(pass);
  useEffect(() => {
    if (pass) {
      setShown(pass);
      setConfirming(false);
    }
  }, [pass]);
  const cancel = useMutation({
    mutationFn: (id: string) => api.guests.cancel(id),
    onSuccess: () => {
      toast(t("cancelled"));
      onOpenChange(false);
    },
    onError: (failure) => toast.error(errorMessage(failure, t("cancelFailed"))),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.guestPasses }),
  });

  return (
    <Sheet
      open={pass !== null}
      onOpenChange={onOpenChange}
      title={t("passTitle")}
      footer={
        shown ? (
          confirming ? (
            <div className="space-y-2">
              <p className="text-center text-small text-muted-foreground">{t("cancelWarning")}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  {common("keep")}
                </Button>
                <Button
                  variant="danger"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate(shown.id)}
                >
                  {t("cancelPass")}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" block onClick={() => setConfirming(true)}>
              {t("cancelPass")}
            </Button>
          )
        ) : undefined
      }
    >
      {shown ? <QrCard pass={shown} /> : null}
    </Sheet>
  );
}

function GuestsScreen() {
  const t = useTranslations("guests");
  const client = useQueryClient();
  const club = useClub();
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const creating = params.get("new") === "1";
  const [openPass, setOpenPass] = useState<GuestPassItem | null>(null);
  const query = useQuery({ queryKey: queryKeys.guestPasses, queryFn: api.guests.mine });
  const today = club ? clubToday(new Date(), club.timezone) : "";
  const suspended = Boolean(user?.guestPassesSuspended);

  const passes = query.data ?? [];
  const withState = passes.map((pass) => ({ pass, state: passState(pass, today) }));
  const upcoming = withState
    .filter((entry) => entry.state === "valid")
    .sort((a, b) => a.pass.visitDate.localeCompare(b.pass.visitDate));
  const history = withState
    .filter((entry) => entry.state !== "valid")
    .sort((a, b) => b.pass.visitDate.localeCompare(a.pass.visitDate));

  const setCreating = (open: boolean) =>
    router.replace(open ? `${pathname}?new=1` : pathname, { scroll: false });

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<NotificationBell />} />
      <PullToRefresh
        onRefresh={() => client.invalidateQueries({ queryKey: queryKeys.guestPasses })}
      >
        <div className="mx-auto mt-5 max-w-2xl space-y-7">
          {suspended ? (
            <AlertBanner show tone="danger" title={t("suspendedTitle")}>
              {t("suspendedDescription")}
            </AlertBanner>
          ) : null}

          <Button block size="lg" disabled={suspended} onClick={() => setCreating(true)}>
            <UserPlus /> {t("new")}
          </Button>

          {query.isError ? (
            <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />
          ) : query.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : passes.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : (
            <>
              <section className="space-y-3" aria-label={t("upcoming")}>
                <SectionLabel>{t("upcoming")}</SectionLabel>
                {upcoming.length === 0 ? (
                  <p className="text-small text-muted-foreground">{t("noUpcoming")}</p>
                ) : (
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {upcoming.map(({ pass, state }, index) => (
                        <PassRow
                          key={pass.id}
                          pass={pass}
                          state={state}
                          index={index}
                          onOpen={() => setOpenPass(pass)}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </section>
              {history.length > 0 ? (
                <section className="space-y-3" aria-label={t("history")}>
                  <SectionLabel>{t("history")}</SectionLabel>
                  <ul className="space-y-2">
                    {history.map(({ pass, state }, index) => (
                      <PassRow key={pass.id} pass={pass} state={state} index={index} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </PullToRefresh>

      <GuestPassSheet open={creating && !suspended} onOpenChange={setCreating} />
      <PassSheet pass={openPass} onOpenChange={(open) => !open && setOpenPass(null)} />
    </>
  );
}

export default function GuestsPage() {
  return (
    <Suspense>
      <GuestsScreen />
    </Suspense>
  );
}
