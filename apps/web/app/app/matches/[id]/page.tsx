"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { MatchDetailLoader } from "@/components/matches/match-overlay";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";

/** Direct link to one match (notifications, dashboard). The list opens matches in an overlay. */
export default function MatchPage() {
  const t = useTranslations("matchDetail");
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <PageHeader title={t("title")} leading={<BackButton fallback="/app/matches" />} />
      <div className="mx-auto mt-5 max-w-xl">
        <MatchDetailLoader id={id} />
      </div>
    </>
  );
}
