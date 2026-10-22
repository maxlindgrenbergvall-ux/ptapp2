import type { MetadataRoute } from "next"

import { LAST_UPDATED } from "@/lib/seo"
import { SITE_URL } from "@/lib/site"

/** Publika sidor på coavira.fit: landningssidan och det App Store/Google Play kräver. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(LAST_UPDATED)
  return [
    { url: SITE_URL, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/support`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/integritet`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/villkor`, lastModified, changeFrequency: "yearly", priority: 0.4 },
  ]
}
