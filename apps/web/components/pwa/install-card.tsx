"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { enter, haptic, popVariants } from "@/lib/motion";
import { useInstall } from "@/lib/pwa";

const DISMISSED_KEY = "ficc:install-dismissed";

/**
 * "Instalar o app" card: the browser's install prompt on Android/desktop, or the share-sheet steps
 * on iPhone. Hidden once installed, and on the dashboard after the person closes it.
 */
export function InstallCard({ dismissible = true }: { dismissible?: boolean }) {
  const t = useTranslations("pwa.install");
  const { mode, install } = useInstall();
  const [dismissed, setDismissed] = useState(true);
  const [iosOpen, setIosOpen] = useState(false);
  useEffect(() => {
    setDismissed(dismissible && localStorage.getItem(DISMISSED_KEY) === "1");
  }, [dismissible]);

  const visible = mode !== null && !dismissed;
  return (
    <>
      <AnimatePresence initial={false}>
        {visible ? (
          <motion.section
            variants={popVariants}
            initial={enter("hidden")}
            animate="show"
            exit="hidden"
            aria-label={t("title")}
            className="flex items-center gap-4 rounded-lg border border-ball/30 bg-ball-soft p-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static icon, no optimization needed */}
            <img
              src="/icons/icon-192.png"
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ball-ink">{t("title")}</p>
              <p className="text-small text-muted-foreground">{t("body")}</p>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                if (mode === "ios") {
                  setIosOpen(true);
                  return;
                }
                if (await install()) haptic([10, 30, 10]);
              }}
            >
              <Download /> {t("cta")}
            </Button>
            {dismissible ? (
              <button
                type="button"
                aria-label={t("dismiss")}
                onClick={() => {
                  localStorage.setItem(DISMISSED_KEY, "1");
                  setDismissed(true);
                }}
                className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-tokens hover:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>
      <Sheet open={iosOpen} onOpenChange={setIosOpen} title={t("iosTitle")}>
        <ol className="space-y-4 text-body">
          <li className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Share className="size-5" />
            </span>
            {t("iosStep1")}
          </li>
          <li className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <SquarePlus className="size-5" />
            </span>
            {t("iosStep2")}
          </li>
        </ol>
      </Sheet>
    </>
  );
}
