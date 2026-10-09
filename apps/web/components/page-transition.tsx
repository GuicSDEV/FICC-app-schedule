"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

import { pageVariants } from "@/lib/motion";

/** Route enter transition (fade + 8px slide-up); used by each area's template.tsx. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="enter">
      {children}
    </motion.div>
  );
}
