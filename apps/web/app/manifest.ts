import type { MetadataRoute } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { clubName } from "@/lib/club-server";

/** Built per request: the club's name comes from the API (fetch cached for 5 minutes). */
export const dynamic = "force-dynamic";

/** Web app manifest: installable, standalone, opens on the member home. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const club = await clubName();
  const name = club ? t("app.title", { club }) : t("app.brandFallback");
  return {
    id: "/app",
    name,
    short_name: club ?? t("app.brandFallback"),
    description: t("app.description"),
    lang: locale,
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0F0D",
    theme_color: "#0B0F0D",
    categories: ["sports", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: t("pwa.shortcuts.book"),
        url: "/app/courts",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: t("pwa.shortcuts.courtsNow"),
        url: "/app/courts-now",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: t("pwa.shortcuts.ranking"),
        url: "/app/ranking",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
