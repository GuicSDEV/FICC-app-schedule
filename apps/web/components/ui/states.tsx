"use client";

import { AlertTriangle, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";
import { TennisBall } from "./tennis-ball";

/** Designed empty state for lists. */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
          <Icon className="size-6" />
        </span>
      ) : (
        <TennisBall className="size-10 opacity-80" />
      )}
      <div className="space-y-1">
        <p className="font-display text-title font-semibold">{title}</p>
        {description ? <p className="text-small text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Designed error state with a retry. */
export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("states");
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-6 py-8 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-6 text-danger-ink" />
      <p className="text-small text-foreground">{message ?? t("loadFailed")}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
