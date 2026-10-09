import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Componentes" };

/** Living catalogue of the design system. Hidden in production unless explicitly enabled. */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_DEV_PAGES !== "true")
    notFound();
  return <Showcase />;
}
