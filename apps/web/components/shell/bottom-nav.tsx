"use client";

import { Plus } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { spring, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { isActive, type NavItem } from "./nav-config";

function Tab({ item, pathname, group }: { item: NavItem; pathname: string; group: string }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring rounded-2xl"
    >
      <motion.span whileTap={tap} className="relative flex h-8 w-14 items-center justify-center">
        {active ? (
          <motion.span
            layoutId={`nav-pill-${group}`}
            transition={spring.snappy}
            className="absolute inset-0 rounded-full bg-primary/15"
          />
        ) : null}
        <Icon className={cn("relative size-[22px] transition-tokens", active ? "text-accent-ink" : "text-muted-foreground")} />
      </motion.span>
      <span className={cn("text-[11px] font-medium leading-none transition-tokens", active ? "text-foreground" : "text-muted-foreground")}>
        {item.label}
      </span>
    </Link>
  );
}

/**
 * Glass bottom tab bar for phones. The active pill glides between tabs; an optional floating
 * action sits in the center.
 */
export function BottomNav({
  group,
  left,
  right = [],
  onAction,
  actionLabel,
}: {
  group: string;
  left: NavItem[];
  right?: NavItem[];
  onAction?: () => void;
  actionLabel?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-safe md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch px-2 pt-1 pb-1">
        {left.map((item) => (
          <Tab key={item.href} item={item} pathname={pathname} group={group} />
        ))}
        {onAction ? (
          <div className="flex flex-1 items-start justify-center">
            <motion.button
              type="button"
              onClick={onAction}
              whileTap={{ scale: 0.92 }}
              transition={spring.snappy}
              aria-label={actionLabel}
              className="-mt-6 flex size-[60px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow ring-4 ring-background outline-none focus-visible:ring-ring"
            >
              <Plus className="size-7" strokeWidth={2.4} />
            </motion.button>
          </div>
        ) : null}
        {right.map((item) => (
          <Tab key={item.href} item={item} pathname={pathname} group={group} />
        ))}
      </div>
    </nav>
  );
}
