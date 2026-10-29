import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { CookieBanner } from "@/components/cookie-banner"
import { GoogleAnalytics } from "@/components/google-analytics"
import { NativeBridge } from "@/components/native/native-bridge"
import { ConfirmHost } from "@/components/ui/confirm"
import { Toaster } from "@/components/ui/sonner"
import { BRAND } from "@/lib/brand"
import { SITE_URL } from "@/lib/site"

import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  // Absoluta adresser (Open Graph, kanonisk adress) pekar på den egna domänen.
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND.name} – ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  appleWebApp: { title: BRAND.name, capable: true, statusBarStyle: "default" },
  openGraph: { siteName: BRAND.name, title: `${BRAND.name} – ${BRAND.tagline}`, description: BRAND.description, locale: "sv_SE", type: "website" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fbf8" },
    { media: "(prefers-color-scheme: dark)", color: "#131916" },
  ],
  // Temat följer enhetens inställning (iOS, Android, webbläsare); ingen manuell växling.
  colorScheme: "light dark",
  // Hela skärmen i Coavira-appen (iOS/Android); sidhuvuden lägger själva till
  // avstånd för statusfältet/notchen via --safe-top (globals.css).
  viewportFit: "cover",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Toaster position="top-center" mobileOffset={{ top: "calc(var(--safe-top) + 16px)" }} />
        <ConfirmHost />
        <NativeBridge />
        {/* Bara på coavira.fit: cookie-rutan, och GA4 först när coavira_cookie_consent = "granted". */}
        <CookieBanner />
        <GoogleAnalytics />
      </body>
    </html>
  )
}
