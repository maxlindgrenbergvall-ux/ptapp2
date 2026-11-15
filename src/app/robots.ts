import type { MetadataRoute } from "next"

import { isCrmDeployment } from "@/lib/deployment"
import { SITE_URL } from "@/lib/site"

/**
 * robots.txt: landningssidan och de publika sidorna får indexeras – aldrig
 * appens sidor eller inloggningen. (Appens egen domän, APP_URL, skickar dessutom
 * X-Robots-Tag: noindex, se next.config.ts.)
 */
export default function robots(): MetadataRoute.Robots {
  // v48: CRM-driftsättningen ska aldrig indexeras.
  if (isCrmDeployment()) return { rules: [{ userAgent: "*", disallow: "/" }] }
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
          "/app-retur/",
          "/admin",
          "/avregistrera/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
