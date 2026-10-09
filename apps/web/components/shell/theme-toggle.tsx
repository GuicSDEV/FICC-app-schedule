"use client";

import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { tap } from "@/lib/motion";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== "light";
  return (
    <motion.button
      type="button"
      whileTap={tap}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
      className={
        className ??
        "inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </motion.button>
  );
}
