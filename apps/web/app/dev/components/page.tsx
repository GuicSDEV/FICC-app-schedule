import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Showcase } from "./showcase";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dev");
  return { title: t("title") };
}

/** Living catalogue of the design system. Hidden in production unless explicitly enabled. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_DEV_PAGES !== "true")
    notFound();
  return <Showcase />;
}
