"use client";

import { hasPermission } from "@ficc/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { ExceptionsPanel } from "@/components/admin/settings/exceptions-panel";
import { RulesForm } from "@/components/admin/settings/rules-form";
import { useClub } from "@/components/providers/club-provider";
import { useSession } from "@/components/providers/session-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "rules" | "exceptions";

/** Club rules (SETTINGS_MANAGE) and date exceptions (COURTS_MANAGE). */
export default function AdminSettingsPage() {
  const t = useTranslations("adminSettings");
  const club = useClub();
  const { user } = useSession();
  const canRules = hasPermission(user, "SETTINGS_MANAGE");
  const canExceptions = hasPermission(user, "COURTS_MANAGE");
  const [chosen, setChosen] = useState<Tab>("rules");
  const tab: Tab = !canRules ? "exceptions" : !canExceptions ? "rules" : chosen;

  return (
    <>
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      {canRules && canExceptions ? (
        <SegmentedControl
          label={t("title")}
          value={tab}
          onChange={setChosen}
          options={[
            { value: "rules", label: t("tabs.rules") },
            { value: "exceptions", label: t("tabs.exceptions") },
          ]}
          className="mt-5 max-w-md"
        />
      ) : null}
      <div className="mt-6">
        {tab === "exceptions" ? (
          <ExceptionsPanel />
        ) : club ? (
          <RulesForm settings={club.settings} />
        ) : (
          <Skeleton className="h-96 rounded-lg" />
        )}
      </div>
    </>
  );
}
