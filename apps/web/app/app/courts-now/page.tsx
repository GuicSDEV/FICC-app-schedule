"use client";

import { useTranslations } from "next-intl";

import { CourtsNowView } from "@/components/operations/courts-now";
import { BackButton } from "@/components/shell/back-button";
import { PageHeader } from "@/components/shell/page-header";

export default function CourtsNowPage() {
  const t = useTranslations("courtsNow");
  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        leading={<BackButton fallback="/app/courts" />}
      />
      <div className="mx-auto mt-5 max-w-3xl pb-6">
        <CourtsNowView />
      </div>
    </>
  );
}
