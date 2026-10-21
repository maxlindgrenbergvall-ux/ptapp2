import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

/** Sökmotorer: landningssidan och de publika sidorna, aldrig appens inloggade delar. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/kom-igang", "/integritet", "/villkor"], disallow: ["/klient", "/pt", "/api", "/auth", "/valkommen", "/dashboard"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
