import { TennisBall } from "@/components/ui/tennis-ball";
import { cn } from "@/lib/utils";

/** Club wordmark. */
export function Brand({ subtitle, className }: { subtitle?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <TennisBall className="size-8" />
      <span className="leading-none">
        <span className="block font-display text-title font-bold tracking-tight">FICC Tênis</span>
        {subtitle ? (
          <span className="mt-0.5 block text-caption text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}
