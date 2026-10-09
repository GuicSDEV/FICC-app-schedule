"use client";

import { formatMembershipId, type GateScanResponse } from "@ficc/shared";
import { CheckCircle2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { duration, enter, haptic, popVariants, spring, transitions } from "@/lib/motion";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/** How long an accepted result stays before the scanner comes back (ms). Refusals wait for a tap. */
const ACCEPTED_MS = 5000;

/** Full-screen green (entry allowed) or red (refused) answer for the gate attendant. */
export function ScanResult({ result, onClose }: { result: GateScanResponse; onClose: () => void }) {
  const t = useTranslations("gate.result");
  const format = useFormat();
  const closeRef = useRef<HTMLButtonElement>(null);
  const accepted = result.accepted;
  const pass = result.pass;

  useEffect(() => {
    haptic(accepted ? [20, 60, 20] : [80, 60, 80, 60, 80]);
    closeRef.current?.focus({ preventScroll: true });
    const timer = accepted ? setTimeout(onClose, ACCEPTED_MS) : undefined;
    return () => clearTimeout(timer);
  }, [accepted, onClose]);

  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-live="assertive"
      aria-label={result.message}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transitions.fast}
      className={cn(
        "fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 px-6 pt-safe pb-safe text-center text-white",
        accepted ? "bg-gate-accepted" : "bg-gate-refused",
      )}
    >
      <motion.span
        variants={popVariants}
        initial={enter("hidden")}
        animate="show"
        transition={spring.snappy}
      >
        {accepted ? (
          <CheckCircle2 className="size-28" strokeWidth={1.5} aria-hidden />
        ) : (
          <XCircle className="size-28" strokeWidth={1.5} aria-hidden />
        )}
      </motion.span>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...transitions.base, delay: duration.fast }}
        className="font-display text-display leading-tight font-bold"
      >
        {result.message}
      </motion.p>
      {pass ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transitions.base, delay: duration.base }}
          className="w-full max-w-sm space-y-4 rounded-xl bg-black/20 p-5"
        >
          <div>
            <p className="text-caption tracking-[0.12em] uppercase opacity-80">{t("guest")}</p>
            <p className="font-display text-headline font-semibold">{pass.guestName}</p>
            <p className="num text-small opacity-90">
              {pass.documentType} {pass.document} · {format.dayTitle(pass.visitDate)}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 border-t border-white/20 pt-4">
            <Avatar name={pass.host.name} src={pass.host.photoUrl} />
            <div className="text-left">
              <p className="text-caption tracking-[0.12em] uppercase opacity-80">{t("host")}</p>
              <p className="font-semibold">{pass.host.name}</p>
              {pass.host.membershipId ? (
                <p className="num text-small opacity-90">
                  {formatMembershipId(pass.host.membershipId)}
                </p>
              ) : null}
            </div>
          </div>
          {pass.usedAt && !accepted ? (
            <p className="text-small opacity-90">
              {t("usedAt", { when: format.dateTime(pass.usedAt) })}
            </p>
          ) : null}
        </motion.div>
      ) : null}
      <Button
        ref={closeRef}
        size="lg"
        variant="secondary"
        onClick={onClose}
        className="w-full max-w-sm border-white/30 bg-white/15 text-white hover:bg-white/25"
      >
        {t("next")}
      </Button>
    </motion.div>,
    document.body,
  );
}
