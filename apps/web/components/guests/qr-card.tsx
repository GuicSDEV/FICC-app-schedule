"use client";

import type { GuestPassItem } from "@ficc/shared";
import { Download, Share2 } from "lucide-react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { downloadBlob, qrDataUrl, renderPassImage, shareOrDownload } from "@/lib/guest-pass-image";
import { duration, ease, spring } from "@/lib/motion";
import { useFormat } from "@/lib/use-format";

/** Maximum tilt in degrees. */
const TILT = 8;

/**
 * The guest's QR card. The code is revealed by a scan line sweeping down; the card tilts gently
 * with the finger, the mouse or the phone's orientation. Share sends an image of the pass.
 */
export function QrCard({ pass }: { pass: GuestPassItem }) {
  const t = useTranslations("guests");
  const format = useFormat();
  const club = useClub();
  const { user } = useSession();
  const reduce = useReducedMotion();
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-1, 1], [TILT, -TILT]), spring.gentle);
  const rotateY = useSpring(useTransform(x, [-1, 1], [-TILT, TILT]), spring.gentle);

  useEffect(() => {
    if (!pass.token) return;
    let active = true;
    void qrDataUrl(pass.token).then((url) => active && setQr(url));
    return () => {
      active = false;
    };
  }, [pass.token]);

  // Tilt with the phone's orientation where the browser allows it without a prompt.
  useEffect(() => {
    if (reduce) return;
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      x.set(Math.max(-1, Math.min(1, event.gamma / 30)));
      y.set(Math.max(-1, Math.min(1, (event.beta - 45) / 30)));
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [reduce, x, y]);

  function onPointerMove(event: React.PointerEvent) {
    if (reduce || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    x.set(((event.clientX - box.left) / box.width) * 2 - 1);
    y.set(((event.clientY - box.top) / box.height) * 2 - 1);
  }

  function resetTilt() {
    x.set(0);
    y.set(0);
  }

  const imageText = () => ({
    club: club?.name ?? "",
    heading: t("image.heading"),
    guestName: pass.guestName ?? "",
    date: format.longDayTitle(pass.visitDate),
    hostLine: t("image.host", { name: user?.name ?? "" }),
    footer: t("image.footer"),
  });
  const fileName = `${t("image.fileName")}-${pass.visitDate}.png`;

  async function share() {
    if (!pass.token) return;
    setBusy("share");
    try {
      const blob = await renderPassImage(pass.token, imageText());
      const result = await shareOrDownload(blob, fileName, {
        title: t("image.heading"),
        text: t("shareText", {
          guest: pass.guestName ?? "",
          club: club?.name ?? "",
          date: format.longDay(pass.visitDate),
        }),
      });
      if (result === "downloaded") toast.success(t("downloaded"));
    } catch {
      toast.error(t("shareFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!pass.token) return;
    setBusy("download");
    try {
      downloadBlob(await renderPassImage(pass.token, imageText()), fileName);
      toast.success(t("downloaded"));
    } catch {
      toast.error(t("shareFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div style={{ perspective: 900 }}>
        <motion.div
          ref={ref}
          onPointerMove={onPointerMove}
          onPointerLeave={resetTilt}
          style={reduce ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
          className="grain relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-raised"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-12 size-52 rounded-full bg-primary/15 blur-3xl"
          />
          <div className="relative space-y-1">
            <p className="text-caption font-semibold tracking-[0.12em] text-ball-ink uppercase">
              {club?.name ?? " "}
            </p>
            <p className="font-display text-headline leading-tight font-semibold">
              {pass.guestName}
            </p>
            <p className="text-small text-muted-foreground">
              {format.longDayTitle(pass.visitDate)}
              {pass.documentMasked ? (
                <>
                  {" · "}
                  <span className="num">{pass.documentMasked}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="relative mx-auto mt-5 aspect-square w-full max-w-[17rem] overflow-hidden rounded-lg bg-[#F7F6F2] p-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize
              <img
                src={qr}
                alt={t("qrAlt", { guest: pass.guestName ?? "" })}
                className="size-full [image-rendering:pixelated]"
              />
            ) : null}
            {/* Scan-line reveal: a cover slides away downwards, led by a glowing line. */}
            <motion.div
              aria-hidden
              initial={{ y: "0%" }}
              animate={qr ? { y: "101%" } : { y: "0%" }}
              transition={{ duration: duration.slow * 3, ease: ease.inOut }}
              className="absolute inset-0 bg-card"
            >
              <span className="absolute inset-x-0 top-0 h-1 -translate-y-1/2 bg-ball shadow-[0_0_24px_6px_var(--ball)]" />
            </motion.div>
          </div>

          {pass.booking ? (
            <p className="relative mt-4 text-center text-small text-muted-foreground">
              {t("linkedBooking", {
                court: pass.booking.courtName,
                time: pass.booking.startTime,
              })}
            </p>
          ) : null}
          <p className="relative mt-2 text-center text-caption text-muted-foreground">
            {t("singleEntry")}
          </p>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          loading={busy === "download"}
          disabled={!pass.token || busy !== null}
          onClick={() => void download()}
        >
          <Download /> {t("download")}
        </Button>
        <Button
          loading={busy === "share"}
          disabled={!pass.token || busy !== null}
          onClick={() => void share()}
        >
          <Share2 /> {t("share")}
        </Button>
      </div>
    </div>
  );
}
