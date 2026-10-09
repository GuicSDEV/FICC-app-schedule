import type { ReactNode } from "react";

import { CoachShell } from "@/components/shell/shells";
import { roleHint } from "@/lib/role-hint";

export default async function CoachLayout({ children }: { children: ReactNode }) {
  return <CoachShell roleHint={await roleHint()}>{children}</CoachShell>;
}
