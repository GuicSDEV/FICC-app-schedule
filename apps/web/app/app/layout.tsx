import type { ReactNode } from "react";

import { MemberShell } from "@/components/shell/shells";

export default function MemberLayout({ children }: { children: ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
