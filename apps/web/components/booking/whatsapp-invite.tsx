"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { useClub } from "@/components/providers/club-provider";
import { buttonVariants } from "@/components/ui/button";
import { useFormat } from "@/lib/use-format";
import { cn } from "@/lib/utils";

/**
 * Opens WhatsApp with a ready message ("I booked court X at Y, confirm in the app"), for the
 * player to send to whoever has to confirm. Members have no phone number in the app, so WhatsApp
 * asks who to send it to.
 */
export function WhatsAppInvite({
  court,
  date,
  time,
  className,
}: {
  court: string;
  date: string;
  time: string;
  className?: string;
}) {
  const t = useTranslations("whatsapp");
  const format = useFormat();
  const club = useClub();
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/app`;
  const text = t("message", {
    court,
    day: format.day(date),
    time,
    club: club?.name ?? "",
    link,
  });
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: "secondary", size: "lg", block: true }), className)}
    >
      <MessageCircle /> {t("send")}
    </a>
  );
}
