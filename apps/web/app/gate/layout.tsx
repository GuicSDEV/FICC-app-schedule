import type { ReactNode } from "react";

import { GateShell } from "@/components/shell/shells";
import { roleHint } from "@/lib/role-hint";

export default async function GateLayout({ children }: { children: ReactNode }) {
  return <GateShell roleHint={await roleHint()}>{children}</GateShell>;
}
