"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { AlertBanner } from "@/components/ui/alert-banner";

const subscribe = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};

/** Shown while the device is offline: screens show the last data the service worker kept. */
export function OfflineBanner() {
  const t = useTranslations("pwa.offline");
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
  return (
    <AlertBanner show={offline} tone="info" title={t("bannerTitle")}>
      {t("bannerBody")}
    </AlertBanner>
  );
}
