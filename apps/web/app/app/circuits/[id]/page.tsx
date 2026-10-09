"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";
import { CircuitView } from "@/components/tournaments/circuit-view";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export default function CircuitPage() {
  const t = useTranslations("tournaments.circuit");
  const { id } = useParams<{ id: string }>();
  const circuit = useQuery({
    queryKey: queryKeys.circuit(id),
    queryFn: () => api.circuits.get(id),
  });
  return (
    <>
      <PageHeader
        title={circuit.data?.name ?? t("title")}
        subtitle={circuit.data ? t("season", { season: circuit.data.season }) : undefined}
        leading={<BackButton fallback="/app/tournaments" />}
      />
      <div className="mx-auto mt-5 max-w-3xl pb-6">
        <CircuitView circuitId={id} stageHref={(stage) => `/app/tournaments/${stage}`} />
      </div>
    </>
  );
}
