import { LAST_UPDATED } from "@/lib/seo"
import { SITE_URL } from "@/lib/site"

type ChangeFrequency = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never"

/** Publika sidor på coavira.fit: landningssidan och det App Store/Google Play kräver. */
const PAGES: { path: string; changefreq: ChangeFrequency; priority: number }[] = [
  { path: "/", changefreq: "weekly", priority: 1 },
  { path: "/support", changefreq: "monthly", priority: 0.6 },
  { path: "/integritet", changefreq: "yearly", priority: 0.4 },
  { path: "/villkor", changefreq: "yearly", priority: 0.4 },
]

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")

/** Sitemapen som XML enligt sitemaps.org (absoluta adresser på SITE_URL, lastmod som datum). */
function sitemapXml(): string {
  const lastmod = new Date(LAST_UPDATED).toISOString().slice(0, 10)
  const urls = PAGES.map(
    (p) =>
      `  <url>\n    <loc>${escapeXml(p.path === "/" ? SITE_URL : `${SITE_URL}${p.path}`)}</loc>\n` +
      `    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority.toFixed(1)}</priority>\n  </url>`
  ).join("\n")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

/**
 * /sitemap.xml för Google Search Console. Egen route (i stället för sitemap.ts)
 * för att styra svaret exakt: alltid 200, application/xml; charset=utf-8, ingen
 * omdirigering. proxy.ts hoppar över adressen helt (se matcher), så inloggning,
 * domänstyrning och cookies påverkar den aldrig. Byggs statiskt.
 */
export function GET(): Response {
  return new Response(sitemapXml(), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
