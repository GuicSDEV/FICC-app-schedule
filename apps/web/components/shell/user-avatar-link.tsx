"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { useSession } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { tap } from "@/lib/motion";

/** Header avatar that opens the profile (shared-layout morph into the profile hero). */
export function UserAvatarLink({ href }: { href: string }) {
  const t = useTranslations("shell");
  const { user } = useSession();
  if (!user) return null;
  return (
    <Link href={href} className="inline-flex size-11 items-center justify-center rounded-full">
      <span className="sr-only">{t("myProfile")}</span>
      {/* whileTap makes motion add a tab stop: the link is the only one. */}
      <motion.span layoutId="avatar-me" whileTap={tap} tabIndex={-1} className="rounded-full">
        <span aria-hidden>
          <Avatar
            name={user.coach?.displayName ?? user.name}
            src={user.coach?.photoUrl ?? user.photoUrl}
            size="sm"
          />
        </span>
      </motion.span>
    </Link>
  );
}
