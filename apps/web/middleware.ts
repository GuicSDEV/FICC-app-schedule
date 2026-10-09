import { type NextRequest, NextResponse } from "next/server";

import { AREA_BY_ROLE, AREA_ROLES, isRole } from "./lib/roles";

/**
 * Fast routing from the readable `ficc_role` cookie the API sets at login. The API still enforces
 * every permission; this only sends people to the right area before the page loads.
 */
export function middleware(request: NextRequest) {
  const role = request.cookies.get("ficc_role")?.value;
  const { pathname, search } = request.nextUrl;
  const redirect = (to: string) => NextResponse.redirect(new URL(to, request.url));

  const area = Object.keys(AREA_ROLES).find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (area) {
    if (!isRole(role)) return redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
    if (!AREA_ROLES[area]!.includes(role)) return redirect(AREA_BY_ROLE[role]);
    return NextResponse.next();
  }
  if (pathname === "/" || pathname === "/login" || pathname === "/register") {
    if (isRole(role)) return redirect(AREA_BY_ROLE[role]);
    if (pathname === "/") return redirect("/login");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/register", "/app/:path*", "/coach/:path*", "/admin/:path*", "/gate/:path*"],
};
