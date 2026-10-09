import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { OfflineRetry } from "./retry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pwa.offline");
  return { title: t("title") };
}

/** Served by the service worker when a page is opened without connection and was never cached. */
export default async function OfflinePage() {
  const t = await getTranslations("pwa.offline");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
        <WifiOff className="size-7" />
      </span>
      <h1 className="font-display text-headline font-semibold">{t("title")}</h1>
      <p className="max-w-sm text-body text-muted-foreground">{t("body")}</p>
      <OfflineRetry label={t("retry")} />
    </main>
  );
}
