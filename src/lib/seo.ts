/**
 * SEO för landningssidan på coavira.fit: texter, delningsbild och strukturerad
 * data (JSON-LD). Används av src/app/page.tsx; sitemap/robots ligger i src/app.
 */
import { STORE_URLS } from "@/components/landing/links"
import { BRAND } from "@/lib/brand"
import { SITE_URL } from "@/lib/site"

export const SEO = {
  title: "Coavira – Framtidens tränings- och kostapp för PTs & klienter",
  description:
    "Koppla samman med din personliga tränare, följ skräddarsydda kostscheman och logga dina träningspass. Hämta Coavira-appen på App Store och Google Play.",
  keywords: [
    "personlig tränare",
    "pt app",
    "kostschema",
    "träningsapp",
    "träning och kost",
    "coavira",
    "träningsdagbok",
    "hyrox",
    "styrketräning",
  ],
  /** Delningsbilden (public/og-image.png, 1200×630 – skapas med scripts/og-image.mjs). */
  image: { url: "/og-image.png", width: 1200, height: 630, alt: "Coavira – appen för träning och kost med din PT, för iPhone och Android" },
} as const

/** Senast ändrat innehåll på de publika sidorna (sitemap). */
export const LAST_UPDATED = "2026-10-22"

/**
 * Strukturerad data: organisationen, webbplatsen och mobilappen (iOS och
 * Android). Inga betyg eller recensioner – bara sådant som är sant.
 */
export function landingJsonLd() {
  const stores = [STORE_URLS.ios, STORE_URLS.android].filter((u): u is string => Boolean(u))
  const org = `${SITE_URL}/#organisation`
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: BRAND.name,
        url: SITE_URL,
        logo: `${SITE_URL}/apple-icon`,
        email: BRAND.contactEmail,
        contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: BRAND.supportEmail, availableLanguage: ["sv"] },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#webbplats`,
        url: SITE_URL,
        name: BRAND.name,
        inLanguage: "sv-SE",
        publisher: { "@id": org },
      },
      {
        "@type": "MobileApplication",
        "@id": `${SITE_URL}/#app`,
        name: BRAND.name,
        description: SEO.description,
        url: SITE_URL,
        image: `${SITE_URL}${SEO.image.url}`,
        operatingSystem: "iOS, Android",
        applicationCategory: "HealthApplication",
        applicationSubCategory: "Träning och kost",
        inLanguage: "sv",
        countriesSupported: "SE",
        featureList: [
          "Träningspass och träningsdagbok från din PT",
          "Kostschema med svensk livsmedelsdatabas och streckkodsscanner",
          "Bokning och kalendersynk",
          "Chatt och videosamtal med din PT",
          "Verifierade personliga tränare",
        ],
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "SEK",
          // Innan apparna finns i butikerna: förbeställning (ändras när butiksadresserna sätts).
          availability: stores.length ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
        },
        ...(stores.length ? { downloadUrl: stores, installUrl: stores[0], sameAs: stores } : {}),
        publisher: { "@id": org },
      },
    ],
  }
}
