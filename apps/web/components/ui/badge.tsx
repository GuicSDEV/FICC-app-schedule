import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-caption font-medium whitespace-nowrap [&_svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted-foreground",
        ball: "bg-ball text-on-color",
        ballSoft: "bg-ball-soft text-ball-ink",
        lesson: "bg-lesson-soft text-lesson-ink",
        hartru: "bg-hartru-soft text-hartru-ink",
        saibro: "bg-saibro-soft text-saibro-ink",
        success: "bg-success/15 text-success-ink",
        danger: "bg-danger-soft text-danger-ink",
        warning: "bg-warning-soft text-warning-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
