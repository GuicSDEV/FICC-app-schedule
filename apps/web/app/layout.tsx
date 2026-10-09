import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers/providers";

import "./globals.css";

/** Display face for headlines, player names and the giant Elo number. */
const bricolage = localFont({
  src: "../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "FICC Tênis", template: "%s · FICC Tênis" },
  description: "Reservas de quadra, aulas e ranking Elo do clube.",
  applicationName: "FICC Tênis",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FICC Tênis" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0F0D" },
    { media: "(prefers-color-scheme: light)", color: "#F7F6F2" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable}`}
    >
      <body>
        <Providers>
          {/* vaul scales this wrapper behind open sheets. */}
          <div {...{ "vaul-drawer-wrapper": "" }} className="min-h-dvh bg-background">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
