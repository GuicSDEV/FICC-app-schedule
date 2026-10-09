"use client";

import type { Role } from "@ficc/shared";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";

import { useSession } from "@/components/providers/session-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { AREA_BY_ROLE, AREA_ROLES } from "@/lib/roles";

/** Client-side safety net behind the middleware: signed-in users with the right role only. */
export function AreaGuard({
  area,
  children,
  roleHint = null,
}: {
  area: keyof typeof AREA_ROLES;
  children: ReactNode;
  /** Role from the cookie, read by the server: render at once while the session loads. */
  roleHint?: Role | null;
}) {
  const { user, isLoading, pending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = user ? AREA_ROLES[area]?.includes(user.role) : false;

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!allowed) router.replace(AREA_BY_ROLE[user.role]);
  }, [user, isLoading, allowed, router, pathname]);

  const optimistic = !user && pending && roleHint !== null && AREA_ROLES[area]?.includes(roleHint);
  if (optimistic) return children;
  if (!user || !allowed) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 px-4 pt-20" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  return children;
}
