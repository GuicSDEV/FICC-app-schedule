import type { ReactNode } from "react";

import { AdminShell } from "@/components/shell/shells";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
