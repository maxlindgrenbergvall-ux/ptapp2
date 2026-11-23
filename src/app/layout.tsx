import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { CookieBanner } from "@/components/cookie-banner"
import { GoogleAnalytics } from "@/components/google-analytics"
import { NativeBridge } from "@/components/native/native-bridge"
import { ConfirmHost } from "@/components/ui/confirm"
import { HtmlLang } from "@/lib/i18n/provider"
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

/**
 * Körs i <head> innan sidan ritas (ingen React):
 *  - native-app: sidan visas i Coavira-appen (iOS/Android) – startskärmen visas bara där.
 *  - app-started: startskärmen har redan visats under den här appstarten.
 *  - --boot-spin-delay: laddningsskärmens snurr följer klockan, så att den fortsätter
 *    i samma vinkel när sidan byts (inloggning → appen).
 */
const BOOT_SCRIPT = `(function(){try{var d=document.documentElement;d.style.setProperty("--boot-spin-delay",-(Date.now()%1100)+"ms");if(/CoaviraApp/.test(navigator.userAgent))d.classList.add("native-app");if(sessionStorage.getItem("coavira:started"))d.classList.add("app-started")}catch(e){}})()`

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: skriptet nedan sätter klasser och en CSS-variabel på <html> före React.
    <html lang="sv" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* v71: laddningsskärmen – mobilappen känns igen och snurrens fas följer klockan redan innan något ritas. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        {children}
        <Toaster position="top-center" mobileOffset={{ top: "calc(var(--safe-top) + 16px)" }} />
        <ConfirmHost />
        <HtmlLang />
        <NativeBridge />
        {/* Bara på coavira.fit: cookie-rutan, och GA4 först när coavira_cookie_consent = "granted". */}
        <CookieBanner />
        <GoogleAnalytics />
      </body>
    </html>
  )
}
