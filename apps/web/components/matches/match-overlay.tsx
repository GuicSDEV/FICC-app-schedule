"use client";

import type { MatchDetail } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { api } from "@/lib/api";
import { duration, spring, tap, transitions } from "@/lib/motion";
import { queryKeys } from "@/lib/query-keys";

import { MatchDetailView } from "./match-detail";

/** Corner radius of the wide-screen panel in px (rounded-xl). */
const PANEL_RADIUS = 20;

export function MatchDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-48 rounded-full" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-20 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

/** Loads one match (seeded from the list when available) and renders its detail. */
export function MatchDetailLoader({ id, initial }: { id: string; initial?: MatchDetail }) {
  const t = useTranslations("matchDetail");
  const query = useQuery({
    queryKey: queryKeys.match(id),
    queryFn: () => api.matches.get(id),
    initialData: initial,
  });
  if (query.data) return <MatchDetailView match={query.data} />;
  if (query.isError)
    return <ErrorState message={t("loadFailed")} onRetry={() => void query.refetch()} />;
  return <MatchDetailSkeleton />;
}

/**
 * Detail panel that morphs out of the tapped match card (same `layoutId`). Full screen on
 * phones, a centered panel on wide screens. Escape and the back button close it.
 */
export function MatchOverlay({
  id,
  initial,
  onClose,
}: {
  id: string;
  initial?: MatchDetail;
  onClose: () => void;
}) {
  const t = useTranslations("matchDetail");
  const closeRef = useRef<HTMLButtonElement>(null);
  // Square corners on phones (full screen), rounded panel on wide screens.
  const [wide] = useState(() => window.matchMedia("(min-width: 768px)").matches);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Portaled so no transformed ancestor (page transition, pull-to-refresh) traps `fixed`.
  return createPortal(
    <div className="fixed inset-0 z-50 md:flex md:items-center md:justify-center md:p-8">
      <motion.div
        aria-hidden
        className="absolute inset-0 hidden bg-black/55 md:block"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitions.base}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="relative flex h-full w-full flex-col md:h-auto md:max-h-[88dvh] md:max-w-xl"
      >
        {/* The tapped card's surface grows into this panel; the content fades in over it. */}
        <motion.div
          aria-hidden
          layoutId={`match-${id}`}
          layoutCrossfade={false}
          transition={spring.gentle}
          style={{ borderRadius: wide ? PANEL_RADIUS : 0 }}
          className="absolute inset-0 bg-background md:border md:border-border md:shadow-raised"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { ...transitions.base, delay: duration.base } }}
          exit={{ opacity: 0, transition: { duration: 0 } }}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border px-2 pt-safe md:pt-0">
            <motion.button
              ref={closeRef}
              type="button"
              whileTap={tap}
              onClick={onClose}
              aria-label={t("back")}
              className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
            >
              <ArrowLeft className="size-5" />
            </motion.button>
            <h2 className="font-display text-title font-semibold">{t("title")}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6">
            <MatchDetailLoader id={id} initial={initial} />
          </div>
        </motion.div>
      </div>
    </div>,
    document.body,
  );
}
