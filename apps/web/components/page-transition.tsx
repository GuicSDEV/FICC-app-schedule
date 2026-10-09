import type { ReactNode } from "react";

/**
 * Route enter transition (fade + 8px slide-up, `pageVariants` in CSS); used by each area's
 * template.tsx. It is a CSS animation so server-rendered content paints before hydration.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
