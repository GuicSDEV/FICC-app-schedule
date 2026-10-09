"use client";

import { useTranslations } from "next-intl";

import { useSession } from "@/components/providers/session-provider";

import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function AreaHome() {
  const t = useTranslations("areas");
  const { user } = useSession();
  return (
    <>
      <PageHeader title={t("gate.title")} subtitle={t("gate.subtitle")} />
      <Card className="mt-6">
        <CardContent>
          <p className="font-display text-title font-semibold">
            {t("hello", { name: user?.name.split(" ")[0] ?? "" })}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
