import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/kom-igang`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/registrera`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/integritet`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/villkor`, changeFrequency: "yearly", priority: 0.3 },
  ]
}
