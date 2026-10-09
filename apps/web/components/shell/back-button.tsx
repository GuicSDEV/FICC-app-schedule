"use client";

import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { tap } from "@/lib/motion";

/** Goes back in history, or to `fallback` when the page was opened directly. */
export function BackButton({ fallback }: { fallback: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <motion.button
      type="button"
      whileTap={tap}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      aria-label={t("back")}
      className="inline-flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
    >
      <ArrowLeft className="size-5" />
    </motion.button>
  );
}
