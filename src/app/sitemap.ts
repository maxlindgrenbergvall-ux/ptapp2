import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

/** Publika sidor på coavira.fit: landningssidan och det App Store/Google Play kräver. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/support`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/integritet`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/villkor`, changeFrequency: "yearly", priority: 0.4 },
  ]
}
