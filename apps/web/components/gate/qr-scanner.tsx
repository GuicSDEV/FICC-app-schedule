"use client";

import type { IScannerControls } from "@zxing/browser";
import { CameraOff } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ease, loop } from "@/lib/motion";

/** The same code read again within this window is ignored (ms). */
const REPEAT_MS = 4000;

type CameraState = "starting" | "running" | "denied" | "unavailable";

/**
 * Rear-camera QR scanner (@zxing/browser, loaded on demand). Reports each decoded text once;
 * pauses while `paused` (e.g. a result is on screen).
 */
export function QrScanner({
  paused,
  onResult,
}: {
  paused: boolean;
  onResult: (text: string) => void;
}) {
  const t = useTranslations("gate.scanner");
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const last = useRef<{ text: string; at: number } | null>(null);
  const latest = useRef(onResult);
  const pausedRef = useRef(paused);
  const [state, setState] = useState<CameraState>("starting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    latest.current = onResult;
    pausedRef.current = paused;
  });

  // Starts run one after another: a start that finishes after its effect was cleaned up stops
  // its stream, and zxing's stop() also clears the <video>, so it must not overlap the next one.
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    let mine: IScannerControls | null = null;
    setState("starting");
    chain.current = chain.current.then(async () => {
      if (cancelled) return;
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable");
        return;
      }
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
        const started = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoRef.current ?? undefined,
          (result) => {
            if (!result || pausedRef.current) return;
            const text = result.getText();
            const now = Date.now();
            if (last.current && last.current.text === text && now - last.current.at < REPEAT_MS)
              return;
            last.current = { text, at: now };
            latest.current(text);
          },
        );
        if (cancelled) {
          started.stop();
          return;
        }
        mine = started;
        setState("running");
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      }
    });
    return () => {
      cancelled = true;
      mine?.stop();
    };
  }, [attempt]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl border border-border bg-black shadow-raised">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label={t("preview")}
        className="size-full object-cover"
      />
      {state === "running" ? (
        <>
          {/* Corner guides */}
          <div aria-hidden className="pointer-events-none absolute inset-10">
            {[
              "top-0 left-0 border-t-4 border-l-4",
              "top-0 right-0 border-t-4 border-r-4",
              "bottom-0 left-0 border-b-4 border-l-4",
              "right-0 bottom-0 border-r-4 border-b-4",
            ].map((corner) => (
              <span key={corner} className={`absolute size-10 rounded-sm border-ball ${corner}`} />
            ))}
            {reduce ? null : (
              // The full-size wrapper moves (transform only); the line rides on its top edge.
              <motion.div
                className="absolute inset-0"
                animate={{ y: ["0%", "100%"] }}
                transition={{
                  duration: loop.shimmer,
                  ease: ease.inOut,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
              >
                <span className="absolute inset-x-0 top-0 h-0.5 bg-ball shadow-[0_0_16px_4px_var(--ball)]" />
              </motion.div>
            )}
          </div>
          {paused ? <div aria-hidden className="absolute inset-0 bg-black/50" /> : null}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
          {state === "starting" ? (
            <p className="text-small opacity-80">{t("starting")}</p>
          ) : (
            <>
              <CameraOff className="size-8 opacity-80" />
              <p className="font-medium">{state === "denied" ? t("denied") : t("unavailable")}</p>
              <p className="text-small opacity-75">{t("useManual")}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t("retry")}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
