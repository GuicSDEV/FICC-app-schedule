"use client";

import { BellRing, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { enter, haptic, popVariants } from "@/lib/motion";
import { disablePush, enablePush, isPushEnabled, type PushSupport, pushSupport } from "@/lib/push";

const DISMISSED_KEY = "ficc:push-dismissed";

/** Where push stands on this device (read after mount: it depends on the browser). */
function usePushState() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    const current = pushSupport();
    setSupport(current);
    if (current !== "supported") return;
    setDenied(Notification.permission === "denied");
    void isPushEnabled().then(setEnabled);
  }, []);
  return { support, enabled, setEnabled, denied, setDenied };
}

async function turnOn(
  setEnabled: (value: boolean) => void,
  setDenied: (value: boolean) => void,
  failed: string,
): Promise<void> {
  try {
    const ok = await enablePush();
    setEnabled(ok);
    if (ok) haptic([10, 30, 10]);
    else if (Notification.permission === "denied") setDenied(true);
    else toast.error(failed);
  } catch {
    toast.error(failed);
  }
}

/** Profile setting: phone notifications on/off for this device. */
export function PushToggle() {
  const t = useTranslations("pwa.push");
  const { support, enabled, setEnabled, denied, setDenied } = usePushState();
  const [busy, setBusy] = useState(false);
  if (support === null || support === "unsupported") return null;
  if (support === "needs-install") {
    return <p className="px-4 py-3 text-small text-muted-foreground">{t("needsInstall")}</p>;
  }
  return (
    <div className="px-4 py-2">
      <Switch
        checked={enabled}
        disabled={busy || denied}
        label={t("toggle")}
        hint={denied ? t("denied") : t("hint")}
        onChange={async (next) => {
          setBusy(true);
          if (next) await turnOn(setEnabled, setDenied, t("failed"));
          else {
            await disablePush();
            setEnabled(false);
          }
          setBusy(false);
        }}
      />
    </div>
  );
}

/** Dashboard nudge: turn on notifications, shown until enabled or closed. */
export function PushPrompt() {
  const t = useTranslations("pwa.push");
  const { support, enabled, setEnabled, denied, setDenied } = usePushState();
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  const visible = support === "supported" && !enabled && !denied && !dismissed;
  return (
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
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background/40 text-ball-ink">
            <BellRing className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ball-ink">{t("title")}</p>
            <p className="text-small text-muted-foreground">{t("body")}</p>
          </div>
          <Button
            size="sm"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await turnOn(setEnabled, setDenied, t("failed"));
              setBusy(false);
            }}
          >
            {t("enable")}
          </Button>
          <button
            type="button"
            aria-label={t("dismiss")}
            onClick={() => {
              setDismissed(true);
              try {
                localStorage.setItem(DISMISSED_KEY, "1");
              } catch {
                // Private mode: it just shows again next time.
              }
            }}
            className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground"
          >
            <X className="size-4" />
          </button>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
