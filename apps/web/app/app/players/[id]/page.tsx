"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { PlayerProfileView } from "@/components/players/player-profile";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";

export default function PlayerPage() {
  const t = useTranslations("profile");
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <PageHeader title={t("playerTitle")} leading={<BackButton fallback="/app/ranking" />} />
      <div className="mx-auto mt-5 max-w-2xl">
        <PlayerProfileView userId={id} />
      </div>
    </>
  );
}
