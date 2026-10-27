import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { siteUrl } from "@/lib/site";

/**
 * Self-hosted Geist via next/font (no npm font package). The CSS variables
 * feed `--font-sans` / `--font-mono` in globals.css; the system stacks there
 * remain the fallback for any glyph Geist does not cover.
 */
const geistSans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  alternates: {
    canonical: "/",
  },
  title: {
    default: "MicroNest Trader OS",
    template: "%s · MicroNest Trader OS",
  },
  description:
    "A lightweight toolkit to help traders plan, size, analyse and review trades. Calculations and structure, not signals.",
  applicationName: "MicroNest Trader OS",
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf7f2",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className={`flex min-h-dvh flex-col ${geistSans.variable} ${geistMono.variable}`}>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>

        <SiteHeader />

        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
