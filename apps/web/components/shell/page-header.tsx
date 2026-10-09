import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Sticky glass header with a display title; actions sit on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={cn("glass sticky top-0 z-30 -mx-4 border-b border-border px-4 pt-safe md:-mx-8 md:px-8", className)}>
      <div className="flex min-h-16 items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-headline font-semibold">{title}</h1>
          {subtitle ? <p className="truncate text-small text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
