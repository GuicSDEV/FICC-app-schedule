"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { AuditPanel } from "@/components/admin/staff/audit-panel";
import { RolesPanel } from "@/components/admin/staff/roles-panel";
import { StaffPanel } from "@/components/admin/staff/staff-panel";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Tab = "people" | "roles" | "audit";

/** Staff accounts, roles and permissions, and the log of staff actions (STAFF_MANAGE). */
export default function AdminStaffPage() {
  const t = useTranslations("adminStaff");
  const [tab, setTab] = useState<Tab>("people");
  return (
    <>
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      <SegmentedControl
        label={t("title")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "people", label: t("tabs.people") },
          { value: "roles", label: t("tabs.roles") },
          { value: "audit", label: t("tabs.audit") },
        ]}
        className="mt-5 max-w-md"
      />
      <div className="mt-6">
        {tab === "people" ? <StaffPanel /> : tab === "roles" ? <RolesPanel /> : <AuditPanel />}
      </div>
    </>
  );
}
