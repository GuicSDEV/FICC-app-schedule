"use client";

import { useTranslations } from "next-intl";

import { AdminHeader } from "@/components/admin/admin-header";
import { CourtsNowView } from "@/components/operations/courts-now";

export default function AdminFreePlayPage() {
  const t = useTranslations("courtsNow");
  return (
    <>
      <AdminHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="mt-5 max-w-4xl">
        <CourtsNowView staff />
      </div>
    </>
  );
}
