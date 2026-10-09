"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { spring, tap } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { isActive, type NavItem } from "./nav-config";

const STORAGE_KEY = "ficc.sidebar.collapsed";

/** Collapsible sidebar for tablets and desktops (≥768px). */
export function Sidebar({
  group,
  items,
  header,
  footer,
}: {
  group: string;
  items: NavItem[];
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage can be unavailable (private mode); keep the default.
    }
  }, []);

  function toggle() {
    setCollapsed((value) => {
      try {
        localStorage.setItem(STORAGE_KEY, value ? "0" : "1");
      } catch {
        // Ignore storage failures.
      }
      return !value;
    });
  }

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface/60 px-3 py-5 transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)] md:flex",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "mb-6 flex items-center gap-2 px-1",
          collapsed ? "flex-col" : "justify-between",
        )}
      >
        <div className={cn("min-w-0", collapsed && "sr-only")}>{header}</div>
        <motion.button
          type="button"
          whileTap={tap}
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        </motion.button>
      </div>
      <nav aria-label="Navegação" className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-full px-3.5 text-small font-medium transition-tokens outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <motion.span
                  layoutId={`side-pill-${group}`}
                  transition={spring.snappy}
                  className="absolute inset-0 rounded-full bg-primary/15"
                />
              ) : null}
              <Icon className={cn("relative size-5 shrink-0", active && "text-accent-ink")} />
              <span className={cn("relative truncate", collapsed && "sr-only")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {footer ? (
        <div className={cn("mt-4", collapsed && "flex flex-col items-center")}>{footer}</div>
      ) : null}
    </aside>
  );
}
