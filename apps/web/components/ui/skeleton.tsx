import { cn } from "@/lib/utils";

/** Shimmer placeholder (never a spinner). Keeps the final layout's size to avoid shifts. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden rounded-md bg-surface-2", className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent" />
    </div>
  );
}
