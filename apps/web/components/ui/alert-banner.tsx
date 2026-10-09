"use client";

import { AlertTriangle, CloudRain, Info, Wrench, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { dropVariants, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Tone = "rain" | "maintenance" | "danger" | "info";

const ICONS: Record<Tone, typeof Info> = {
  rain: CloudRain,
  maintenance: Wrench,
  danger: AlertTriangle,
  info: Info,
};
const STYLES: Record<Tone, string> = {
  rain: "border-warning/40 bg-warning-soft text-foreground",
  maintenance: "border-warning/40 bg-warning-soft text-foreground",
  danger: "border-danger/40 bg-danger-soft text-foreground",
  info: "border-border bg-surface-2 text-foreground",
};

/** Alert that drops in from the top with a spring (rain mode, maintenance, errors). */
export function AlertBanner({
  show,
  tone = "info",
  title,
  children,
  onDismiss,
  className,
}: {
  show: boolean;
  tone?: Tone;
  title: string;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const Icon = ICONS[tone];
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          role="status"
          aria-live="polite"
          variants={dropVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-card",
            STYLES[tone],
            className,
          )}
        >
          <span className="relative mt-0.5 shrink-0 text-warning-ink">
            <Icon
              className={cn("size-5", tone !== "rain" && tone !== "maintenance" && "text-current")}
            />
            {tone === "rain" ? (
              <span
                aria-hidden
                className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5"
              >
                {[0, 1, 2].map((drop) => (
                  <span
                    key={drop}
                    className="h-1.5 w-px animate-rain bg-current"
                    style={{ animationDelay: `calc(var(--loop-rain) * ${drop} / 3)` }}
                  />
                ))}
              </span>
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold">{title}</p>
            {children ? (
              <div className="mt-0.5 text-small text-muted-foreground">{children}</div>
            ) : null}
          </div>
          {onDismiss ? (
            <motion.button
              type="button"
              whileTap={tap}
              onClick={onDismiss}
              aria-label="Fechar aviso"
              className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </motion.button>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
