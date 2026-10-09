import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers/providers";
import { clubName, getClub } from "@/lib/club-server";

import "./globals.css";

/** Numbers (Elo, times, scores). Not preloaded: the system monospace fallback is close enough. */
const geistMono = localFont({
  src: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Roboto Mono", "monospace"],
});

/** Display face for headlines, player names and the giant Elo number. */
const bricolage = localFont({
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

/** Pages re-read the club's name (titles) at most every 5 minutes. */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  const club = await clubName();
  const title = club ? t("title", { club }) : t("brandFallback");
  return {
    title: { default: title, template: `%s · ${title}` },
    description: t("description"),
    applicationName: title,
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title },
    formatDetection: { telephone: false },
    icons: { apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0F0D" },
    { media: "(prefers-color-scheme: light)", color: "#F7F6F2" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const [locale, messages, club] = await Promise.all([getLocale(), getMessages(), getClub()]);
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${geistMono.variable} ${bricolage.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers club={club}>
            {/* vaul scales this wrapper behind open sheets. */}
            <div {...{ "vaul-drawer-wrapper": "" }} className="min-h-dvh bg-background">
              {children}
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
