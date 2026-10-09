import {
  Ban,
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
  | "tournaments";

export interface NavItem {
  href: string;
  label: NavLabel;
  icon: LucideIcon;
  /** Match exactly (area roots) instead of by prefix. */
  exact?: boolean;
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
  { href: "/app/guests", label: "guests", icon: UserCheck },
  { href: "/app/profile", label: "profile", icon: User },
];

export const COACH_NAV: NavItem[] = [
  { href: "/coach", label: "agenda", icon: CalendarClock, exact: true },
  { href: "/coach/courts", label: "courts", icon: CalendarDays },
  { href: "/coach/profile", label: "profile", icon: User },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "freezes", icon: Ban, exact: true },
  { href: "/admin/coaches", label: "coaches", icon: GraduationCap },
  { href: "/admin/lessons", label: "lessons", icon: CalendarClock },
  { href: "/admin/tournaments", label: "tournaments", icon: Medal },
  { href: "/admin/disputes", label: "disputes", icon: Scale },
  { href: "/admin/guests", label: "guests", icon: UserCheck },
  { href: "/admin/members", label: "members", icon: Users },
  { href: "/gate", label: "gate", icon: ScanLine },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
