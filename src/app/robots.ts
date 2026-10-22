import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

/**
 * robots.txt: landningssidan och de publika sidorna får indexeras – aldrig
 * appens sidor eller inloggningen. (Appens egen domän, APP_URL, skickar dessutom
 * X-Robots-Tag: noindex, se next.config.ts.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/support", "/integritet", "/villkor"],
        disallow: [
          "/api/",
          "/auth/",
          "/klient",
          "/pt",
          "/dashboard",
          "/valkommen",
          "/kom-igang",
          "/logga-in",
          "/registrera",
          "/glomt-losenord",
          "/nytt-losenord",
          "/konto-raderat",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
