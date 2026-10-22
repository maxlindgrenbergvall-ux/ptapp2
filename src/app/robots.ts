import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

/** Sökmotorer: landningssidan och de publika sidorna – aldrig appens sidor eller inloggningen. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/support", "/integritet", "/villkor"],
        disallow: ["/klient", "/pt", "/api", "/auth", "/valkommen", "/dashboard", "/kom-igang", "/logga-in", "/registrera"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
