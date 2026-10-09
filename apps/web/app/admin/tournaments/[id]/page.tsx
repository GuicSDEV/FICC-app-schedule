"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AdminHeader } from "@/components/admin/admin-header";
import { TournamentManager } from "@/components/tournaments/manager/tournament-manager";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export default function AdminTournamentPage() {
  const t = useTranslations("tournaments.admin");
  const { id } = useParams<{ id: string }>();
  const detail = useQuery({
    queryKey: queryKeys.tournaments.detail(id),
    queryFn: () => api.tournaments.get(id),
  });
  return (
    <>
      <AdminHeader title={detail.data?.name ?? t("title")} subtitle={t("manageSubtitle")} />
      <div className="mt-4">
        <TournamentManager
          tournamentId={id}
          stickyTop="top-14 md:top-0"
          duplicateHref={(copy) => `/admin/tournaments/${copy}`}
        />
      </div>
    </>
  );
}
