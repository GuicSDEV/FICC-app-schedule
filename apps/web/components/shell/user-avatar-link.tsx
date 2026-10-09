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
    <Link
      href={href}
      aria-label={t("myProfile")}
      className="inline-flex size-11 items-center justify-center rounded-full"
    >
      <motion.span layoutId="avatar-me" whileTap={tap} className="rounded-full">
        <Avatar
          name={user.coach?.displayName ?? user.name}
          src={user.coach?.photoUrl ?? user.photoUrl}
          size="sm"
        />
      </motion.span>
    </Link>
  );
}
