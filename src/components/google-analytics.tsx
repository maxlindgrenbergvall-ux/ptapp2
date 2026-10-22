"use client"

/**
 * Google Analytics 4 (G-23NXJ2VS0B) – laddas bara på coavira.fit och bara när
 * coavira_cookie_consent === "granted". Godkänner besökaren i CookieBanner
 * monteras skripten direkt (useConsent uppdateras), utan omladdning.
 *
 * next/script med afterInteractive: påverkar inte första renderingen. Inga
 * annonsfunktioner (ad_* nekas, inga Google signals).
 */
import Script from "next/script"

import { GA_ID, useConsent, useConsentApplies } from "@/lib/consent"

export function GoogleAnalytics() {
  const applies = useConsentApplies()
  const consent = useConsent()
  if (!applies || consent !== "granted") return null
  return (
    <>
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;` +
          `gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});` +
          `gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
      </Script>
      <Script id="ga4" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
    </>
  )
}
