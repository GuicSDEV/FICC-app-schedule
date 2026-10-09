"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AlertBanner } from "@/components/ui/alert-banner";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useFormat } from "@/lib/use-format";

/** Global rain/maintenance banner while a freeze is active or about to start. */
export function FreezeBanner() {
  const t = useTranslations("shell.freeze");
  const labels = useTranslations("labels.freezeReason");
  const format = useFormat();
  const { data } = useQuery({
    queryKey: queryKeys.freezesActive,
    queryFn: api.freezes.active,
    refetchInterval: 60_000,
  });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const freeze = data?.find((entry) => entry.active) ?? data?.[0];
  const key = freeze ? `${freeze.id}:${freeze.active}` : null;

  return (
    <AlertBanner
      show={Boolean(freeze) && dismissed !== key}
      tone={freeze?.reason === "MAINTENANCE" ? "maintenance" : "rain"}
      title={
        freeze
          ? t("title", {
              reason: labels(freeze.reason),
              courts: freeze.courtNames.join(", "),
              active: String(freeze.active),
            })
          : ""
      }
      onDismiss={() => setDismissed(key)}
    >
      {freeze
        ? freeze.active
          ? freeze.endsAt
            ? t("until", { time: format.time(freeze.endsAt) })
            : t("noEnd")
          : t("from", { dateTime: format.dateTime(freeze.startsAt) })
        : null}
    </AlertBanner>
  );
}
