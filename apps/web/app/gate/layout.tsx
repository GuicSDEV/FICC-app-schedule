import type { ReactNode } from "react";

import { GateShell } from "@/components/shell/shells";

export default function GateLayout({ children }: { children: ReactNode }) {
  return <GateShell>{children}</GateShell>;
}
