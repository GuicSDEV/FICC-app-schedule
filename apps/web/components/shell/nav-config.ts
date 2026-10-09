import {
  Ban,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Home,
  type LucideIcon,
  Scale,
  ScanLine,
  Swords,
  Trophy,
  User,
  UserCheck,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match exactly (area roots) instead of by prefix. */
  exact?: boolean;
}

/** Member bottom bar: two tabs, the central "+", two tabs. Profile lives in the header avatar. */
export const MEMBER_TABS: { left: NavItem[]; right: NavItem[] } = {
  left: [
    { href: "/app", label: "Início", icon: Home, exact: true },
    { href: "/app/courts", label: "Quadras", icon: CalendarDays },
  ],
  right: [
    { href: "/app/ranking", label: "Ranking", icon: Trophy },
    { href: "/app/matches", label: "Partidas", icon: Swords },
  ],
};

export const MEMBER_SIDEBAR: NavItem[] = [
  ...MEMBER_TABS.left,
  ...MEMBER_TABS.right,
  { href: "/app/guests", label: "Convidados", icon: UserCheck },
  { href: "/app/profile", label: "Perfil", icon: User },
];

export const COACH_NAV: NavItem[] = [
  { href: "/coach", label: "Agenda", icon: CalendarClock, exact: true },
  { href: "/coach/courts", label: "Quadras", icon: CalendarDays },
  { href: "/coach/profile", label: "Perfil", icon: User },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Interdições", icon: Ban, exact: true },
  { href: "/admin/coaches", label: "Professores", icon: GraduationCap },
  { href: "/admin/lessons", label: "Aulas", icon: CalendarClock },
  { href: "/admin/disputes", label: "Disputas", icon: Scale },
  { href: "/admin/guests", label: "Convidados", icon: UserCheck },
  { href: "/admin/members", label: "Sócios", icon: Users },
  { href: "/gate", label: "Portaria", icon: ScanLine },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
