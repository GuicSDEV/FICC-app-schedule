import { cn } from "@/lib/utils";

/** Thin top-down tennis court lines, a decorative background for hero areas. */
export function CourtLines({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 820"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full text-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <rect x="40" y="40" width="320" height="740" rx="2" />
      <line x1="80" y1="40" x2="80" y2="780" />
      <line x1="320" y1="40" x2="320" y2="780" />
      <line x1="80" y1="230" x2="320" y2="230" />
      <line x1="80" y1="590" x2="320" y2="590" />
      <line x1="200" y1="230" x2="200" y2="590" />
      <line x1="200" y1="40" x2="200" y2="52" />
      <line x1="200" y1="768" x2="200" y2="780" />
      <line x1="20" y1="410" x2="380" y2="410" strokeDasharray="2 5" strokeWidth="2" />
    </svg>
  );
}
