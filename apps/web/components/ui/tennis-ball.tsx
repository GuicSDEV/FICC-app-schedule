import { cn } from "@/lib/utils";

/** Tennis ball mark (used by pull-to-refresh and empty states). */
export function TennisBall({ className, spinning }: { className?: string; spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      className={cn("size-8", spinning && "animate-ball-spin", className)}
    >
      <circle cx="16" cy="16" r="14" fill="var(--ball)" />
      <path
        d="M5.2 7.4c5.2 3.6 5.2 13.6 0 17.2"
        fill="none"
        stroke="oklch(0.98 0.02 110)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M26.8 7.4c-5.2 3.6-5.2 13.6 0 17.2"
        fill="none"
        stroke="oklch(0.98 0.02 110)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
