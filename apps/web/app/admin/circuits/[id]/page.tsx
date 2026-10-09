"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AdminHeader } from "@/components/admin/admin-header";
import { CircuitView } from "@/components/tournaments/circuit-view";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export default function AdminCircuitPage() {
  const t = useTranslations("tournaments.circuit");
  const { id } = useParams<{ id: string }>();
  const circuit = useQuery({
    queryKey: queryKeys.circuit(id),
    queryFn: () => api.circuits.get(id),
  });
  return (
    <>
      <AdminHeader
        title={circuit.data?.name ?? t("title")}
        subtitle={circuit.data ? t("season", { season: circuit.data.season }) : undefined}
      />
      <div className="mt-5 max-w-3xl">
        <CircuitView circuitId={id} stageHref={(stage) => `/admin/tournaments/${stage}`} />
      </div>
    </>
  );
}
