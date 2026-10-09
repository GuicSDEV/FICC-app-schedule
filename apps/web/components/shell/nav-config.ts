import type { Permission } from "@ficc/shared";
import {
  Ban,
  BookOpenCheck,
  Footprints,
  Newspaper,
  Settings2,
  ShieldCheck,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Home,
  Medal,
  type LucideIcon,
  Scale,
  ScanLine,
  Swords,
  Trophy,
  User,
  UserCheck,
  Users,
} from "lucide-react";

/** Keys of the nav labels in the messages (nav.items.*). */
export type NavLabel =
  | "home"
  | "courts"
  | "ranking"
  | "matches"
  | "guests"
  | "profile"
  | "agenda"
  | "freezes"
  | "coaches"
  | "lessons"
  | "disputes"
  | "members"
  | "gate"
  | "tournaments"
  | "news"
  | "courtsNow"
  | "bookings"
  | "settings"
  | "staff";

export interface NavItem {
  href: string;
  label: NavLabel;
  icon: LucideIcon;
  /** Match exactly (area roots) instead of by prefix. */
  exact?: boolean;
  /** Admin area: shown to staff holding any of these permissions. */
  permissions?: Permission[];
}

/** Member bottom bar: two tabs, the central "+", two tabs. Profile lives in the header avatar. */
export const MEMBER_TABS: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/app", label: "home", icon: Home, exact: true },
    { href: "/app/courts", label: "courts", icon: CalendarDays },
  ],
  right: [
    { href: "/app/ranking", label: "ranking", icon: Trophy },
    { href: "/app/matches", label: "matches", icon: Swords },
  ],
};

export const MEMBER_SIDEBAR: NavItem[] = [
  ...MEMBER_TABS.left,
  ...MEMBER_TABS.right,
  { href: "/app/tournaments", label: "tournaments", icon: Medal },
  { href: "/app/news", label: "news", icon: Newspaper },
  { href: "/app/courts-now", label: "courtsNow", icon: Footprints },
  { href: "/app/guests", label: "guests", icon: UserCheck },
  { href: "/app/profile", label: "profile", icon: User },
];

export const COACH_NAV: NavItem[] = [
  { href: "/coach", label: "agenda", icon: CalendarClock, exact: true },
  { href: "/coach/courts", label: "courts", icon: CalendarDays },
  { href: "/coach/profile", label: "profile", icon: User },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "freezes", icon: Ban, exact: true, permissions: ["COURTS_MANAGE"] },
  {
    href: "/admin/bookings",
    label: "bookings",
    icon: BookOpenCheck,
    permissions: ["BOOKINGS_MANAGE"],
  },
  {
    href: "/admin/free-play",
    label: "courtsNow",
    icon: Footprints,
    permissions: ["COURTS_MANAGE"],
  },
  { href: "/admin/news", label: "news", icon: Newspaper, permissions: ["NEWS_MANAGE"] },
  {
    href: "/admin/members",
    label: "members",
    icon: Users,
    permissions: ["MEMBERS_MANAGE", "MEMBERS_APPROVE"],
  },
  {
    href: "/admin/coaches",
    label: "coaches",
    icon: GraduationCap,
    permissions: ["LESSONS_MANAGE"],
  },
  {
    href: "/admin/lessons",
    label: "lessons",
    icon: CalendarClock,
    permissions: ["LESSONS_MANAGE"],
  },
  {
    href: "/admin/tournaments",
    label: "tournaments",
    icon: Medal,
    permissions: ["TOURNAMENTS_MANAGE"],
  },
  { href: "/admin/disputes", label: "disputes", icon: Scale, permissions: ["RANKING_MANAGE"] },
  { href: "/admin/guests", label: "guests", icon: UserCheck, permissions: ["GUESTS_MANAGE"] },
  {
    href: "/admin/settings",
    label: "settings",
    icon: Settings2,
    permissions: ["SETTINGS_MANAGE", "COURTS_MANAGE"],
  },
  { href: "/admin/staff", label: "staff", icon: ShieldCheck, permissions: ["STAFF_MANAGE"] },
  { href: "/gate", label: "gate", icon: ScanLine },
];

/** Admin items this person may open. */
export function adminNavFor(permissions: readonly Permission[]): NavItem[] {
  return ADMIN_NAV.filter(
    (item) =>
      !item.permissions || item.permissions.some((permission) => permissions.includes(permission)),
  );
}

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
