"use client";

import { CalendarPlus, ClipboardList, type LucideIcon, Medal, UserPlus } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Sheet } from "@/components/ui/sheet";
import { listItemVariants, tap } from "@/lib/motion";

const ACTIONS: {
  href: string;
  key: "book" | "report" | "guest" | "tournaments";
  icon: LucideIcon;
}[] = [
  { href: "/app/courts", key: "book", icon: CalendarPlus },
  { href: "/app/matches/report", key: "report", icon: ClipboardList },
  { href: "/app/guests?new=1", key: "guest", icon: UserPlus },
  { href: "/app/tournaments", key: "tournaments", icon: Medal },
];

/** The central "+" menu: book a court, report a result, invite a guest, tournaments. */
export function ActionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("shell.actions");
  const router = useRouter();
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("title")}>
      <ul className="space-y-2">
        {ACTIONS.map((action, index) => (
          <motion.li
            key={action.href}
            custom={index}
            variants={listItemVariants}
            initial="hidden"
            animate="show"
          >
            <motion.button
              type="button"
              whileTap={tap}
              onClick={() => {
                onOpenChange(false);
                router.push(action.href);
              }}
              className="flex w-full items-center gap-4 rounded-lg border border-border bg-surface-2 p-4 text-left transition-tokens hover:bg-surface-3"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <action.icon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-title font-semibold">{t(action.key)}</span>
                <span className="block text-small text-muted-foreground">
                  {t(`${action.key}Description`)}
                </span>
              </span>
            </motion.button>
          </motion.li>
        ))}
      </ul>
    </Sheet>
  );
}
