import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("metaTitle") };
}

/** Server-rendered so the form paints before the scripts load; `next` comes from the URL here. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : null} />;
}
