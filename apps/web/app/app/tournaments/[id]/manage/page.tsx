"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { TournamentManager } from "@/components/tournaments/manager/tournament-manager";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** A member who organizes this tournament runs it from here. */
export default function ManageTournamentPage() {
  const t = useTranslations("tournaments.manager");
  const { id } = useParams<{ id: string }>();
  const detail = useQuery({
    queryKey: queryKeys.tournaments.detail(id),
    queryFn: () => api.tournaments.get(id),
  });
  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={detail.data?.name}
        leading={<BackButton fallback={`/app/tournaments/${id}`} />}
      />
      <div className="mx-auto mt-4 max-w-6xl pb-6">
        <TournamentManager
          tournamentId={id}
          duplicateHref={(copy) => `/app/tournaments/${copy}/manage`}
        />
      </div>
    </>
  );
}
