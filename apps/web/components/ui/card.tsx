import * as React from "react";

import { cn } from "@/lib/utils";

/** Elevated surface: 16px radius, 1px hairline border, soft layered shadow. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-card", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-3 px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("font-display text-title font-semibold", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

/** Small caps-style label above sections. */
export function SectionLabel({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-caption font-medium uppercase tracking-[0.12em] text-muted-foreground", className)}
      {...props}
    />
  );
}
