"use client";

import { FREEZE_REASON_LABELS } from "@ficc/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AlertBanner } from "@/components/ui/alert-banner";
import { api } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";

/** Global rain/maintenance banner while a freeze is active or about to start. */
export function FreezeBanner() {
  const { data } = useQuery({ queryKey: queryKeys.freezesActive, queryFn: api.freezes.active, refetchInterval: 60_000 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const freeze = data?.find((entry) => entry.active) ?? data?.[0];
  const key = freeze ? `${freeze.id}:${freeze.active}` : null;

  return (
    <AlertBanner
      show={Boolean(freeze) && dismissed !== key}
      tone={freeze?.reason === "MAINTENANCE" ? "maintenance" : "rain"}
      title={
        freeze
          ? `${FREEZE_REASON_LABELS[freeze.reason]} · ${freeze.courtNames.join(", ")} ${freeze.active ? "interditadas" : "serão interditadas"}`
          : ""
      }
      onDismiss={() => setDismissed(key)}
    >
      {freeze
        ? freeze.active
          ? freeze.endsAt
            ? `Previsão de liberação às ${formatTime(freeze.endsAt)}.`
            : "Sem previsão de liberação."
          : `A partir de ${formatDateTime(freeze.startsAt)}.`
        : null}
    </AlertBanner>
  );
}
