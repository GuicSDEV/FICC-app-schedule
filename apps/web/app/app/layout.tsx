import type { ReactNode } from "react";

import { MemberShell } from "@/components/shell/shells";
import { roleHint } from "@/lib/role-hint";

export default async function MemberLayout({ children }: { children: ReactNode }) {
  return <MemberShell roleHint={await roleHint()}>{children}</MemberShell>;
}
