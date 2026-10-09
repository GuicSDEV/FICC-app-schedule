import type { ReactNode } from "react";

import { CoachShell } from "@/components/shell/shells";

export default function CoachLayout({ children }: { children: ReactNode }) {
  return <CoachShell>{children}</CoachShell>;
}
