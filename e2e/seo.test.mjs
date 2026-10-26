// SEO och Google Analytics 4 på coavira.fit: metadata, Open Graph/Twitter,
// JSON-LD (MobileApplication), robots.txt, sitemap.xml och GA4 med samtycke.
//   BASE_URL=http://localhost:3000 node e2e/seo.test.mjs
// Webbläsaren når coavira.fit och ptapp2.vercel.app via den lokala servern
// (--host-resolver-rules), så att värdstyrningen testas på riktigt.
import { chromium } from "playwright"

const base = new URL(process.env.BASE_URL ?? "http://localhost:3000")
let failed = 0
const check = (cond, msg) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const meta = (html, attr, key) => html.match(new RegExp(`<meta ${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" content="([^"]*)"`))?.[1]?.replaceAll("&amp;", "&")

// ------------------------------------------------------------ metadata ---
const html = await (await fetch(new URL("/", base))).text()
const TITLE = "Coavira – Framtidens tränings- och kostapp för PTs & klienter"
const DESC = "Koppla samman med din personliga tränare, följ skräddarsydda kostscheman och logga dina träningspass. Hämta Coavira-appen på App Store och Google Play."
check(html.match(/<title>([^<]*)<\/title>/)?.[1].replaceAll("&amp;", "&") === TITLE, "title")
check(meta(html, "name", "description") === DESC, "description")
check(meta(html, "name", "keywords") === "personlig tränare,pt app,kostschema,träningsapp,träning och kost,coavira,träningsdagbok,hyrox,styrketräning", "keywords")
check(/<link rel="canonical" href="https:\/\/coavira\.fit"\/?>/.test(html), "kanonisk adress https://coavira.fit")
check(meta(html, "name", "robots") === "index, follow", `robots: ${meta(html, "name", "robots")}`)
check(/index, follow, max-image-preview:large/.test(meta(html, "name", "googlebot") ?? ""), "googlebot: stor bildförhandsvisning")

// ---------------------------------------------------- Open Graph/Twitter ---
check(meta(html, "property", "og:title") === TITLE && meta(html, "property", "og:description") === DESC, "og:title och og:description")
check(meta(html, "property", "og:url") === "https://coavira.fit", "og:url")
check(meta(html, "property", "og:site_name") === "Coavira" && meta(html, "property", "og:type") === "website" && meta(html, "property", "og:locale") === "sv_SE", "og:site_name, og:type, og:locale")
check(meta(html, "property", "og:image") === "https://coavira.fit/og-image.png", `og:image: ${meta(html, "property", "og:image")}`)
check(meta(html, "property", "og:image:width") === "1200" && meta(html, "property", "og:image:height") === "630" && Boolean(meta(html, "property", "og:image:alt")), "og:image 1200×630 med alt-text")
check(meta(html, "name", "twitter:card") === "summary_large_image", "twitter:card summary_large_image")
check(meta(html, "name", "twitter:title") === TITLE && meta(html, "name", "twitter:image") === "https://coavira.fit/og-image.png", "twitter:title och twitter:image")
check((html.match(/property="og:image"/g) ?? []).length === 1, "bara en delningsbild")
{
  const r = await fetch(new URL("/og-image.png", base))
  const buf = Buffer.from(await r.arrayBuffer())
  check(r.status === 200 && r.headers.get("content-type") === "image/png", "/og-image.png serveras som PNG")
  check(buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630, `delningsbilden är 1200×630 (${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)})`)
  check(buf.length < 600_000, `delningsbilden är under 600 kB (${Math.round(buf.length / 1024)} kB)`)
}

// ------------------------------------------------------------- JSON-LD ---
{
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  let ld = null
  try {
    ld = JSON.parse(raw ?? "")
  } catch {}
  check(ld?.["@context"] === "https://schema.org", "JSON-LD finns och är giltig JSON")
  const byType = (t) => ld?.["@graph"]?.find((n) => n["@type"] === t)
  const app = byType("MobileApplication")
  check(Boolean(app), "MobileApplication")
  check(app?.operatingSystem === "iOS, Android", `operativsystem: ${app?.operatingSystem}`)
  check(app?.applicationCategory === "HealthApplication", "kategori HealthApplication")
  check(app?.offers?.price === "0" && app?.offers?.priceCurrency === "SEK", "gratis att ladda ned (0 SEK)")
  check(app?.url === "https://coavira.fit" && app?.image === "https://coavira.fit/og-image.png", "url och bild på coavira.fit")
  check(!JSON.stringify(ld).includes("aggregateRating") && !JSON.stringify(ld).includes('"review'), "inga påhittade betyg eller recensioner")
  check(Boolean(byType("Organization")) && Boolean(byType("WebSite")), "Organization och WebSite")
  check(app?.publisher?.["@id"] === byType("Organization")?.["@id"], "appen publiceras av organisationen")
  check(!(raw ?? "").includes("</"), "JSON-LD är skyddad mot </script>-injektion")
}

// ------------------------------------------------------ robots/sitemap ---
{
  const robots = await (await fetch(new URL("/robots.txt", base))).text()
  check(/User-Agent: \*/i.test(robots) && /^Allow: \/$/m.test(robots), "robots.txt: Allow: /")
  check(/^Disallow: \/klient$/m.test(robots) && /^Disallow: \/api\/$/m.test(robots) && /^Disallow: \/kom-igang$/m.test(robots), "robots.txt stänger appen, API och inloggningen")
  check(/^Sitemap: https:\/\/coavira\.fit\/sitemap\.xml$/m.test(robots), "robots.txt pekar på sitemap")
  const sm = await fetch(new URL("/sitemap.xml", base), { redirect: "manual", headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" } })
  check(sm.status === 200 && sm.headers.get("content-type") === "application/xml; charset=utf-8", `sitemap.xml: 200 och application/xml; charset=utf-8 för Googlebot (${sm.status}, ${sm.headers.get("content-type")})`)
  const rb = await fetch(new URL("/robots.txt", base), { redirect: "manual" })
  check(rb.status === 200 && /^text\/plain/.test(rb.headers.get("content-type") ?? ""), "robots.txt: 200 text/plain utan omdirigering")
  const sitemap = await sm.text()
  check(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), "sitemap enligt sitemaps.org")
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  check(JSON.stringify(locs) === JSON.stringify(["https://coavira.fit", "https://coavira.fit/support", "https://coavira.fit/integritet", "https://coavira.fit/villkor"]), `sitemap: ${locs.join(", ")}`)
  check((sitemap.match(/<lastmod>/g) ?? []).length === 4, "sitemap har lastmod")
}

// ---------------------------------------------------------------- GA4 ---
const target = `${base.hostname === "localhost" ? "127.0.0.1" : base.hostname}:${base.port}`
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [`--host-resolver-rules=MAP coavira.fit ${target}, MAP ptapp2.vercel.app ${target}`],
})
/** Ny flik som räknar anrop till Google (och svarar själv, utan nät). */
async function open(url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts })
  const ga = []
  await ctx.route(/googletagmanager\.com|google-analytics\.com/, (route) => {
    ga.push(route.request().url())
    return route.fulfill({ status: 200, contentType: "text/javascript", body: "" })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(url, { waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  return { ctx, page, ga, errors }
}
const banner = (page) => page.getByTestId("cookie-banner")

{
  const { ctx, page, ga, errors } = await open("http://coavira.fit/")
  const consent = () => page.evaluate(() => localStorage.getItem("coavira_cookie_consent"))
  check(await banner(page).isVisible(), "coavira.fit: cookie-rutan visas")
  check(
    (await banner(page).innerText()).includes(
      "Vi använder nödvändiga cookies för att sidan ska fungera, samt statistik-cookies för att analysera trafik och förbättra upplevelsen på coavira.fit."
    ),
    "rutans text"
  )
  check(ga.length === 0 && (await consent()) === null, "ingen GA-kod och inget sparat val före samtycke")
  check((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, "rutan ger ingen sidledsscroll")
  await page.getByRole("button", { name: "Endast nödvändiga" }).click()
  await page.waitForTimeout(500)
  check(!(await banner(page).isVisible()) && (await consent()) === "denied", 'Endast nödvändiga: rutan stängs, coavira_cookie_consent = "denied"')
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  check(!(await banner(page).isVisible()) && ga.length === 0, "valet sparas – ingen ruta och ingen GA efter omladdning")
  // Ändra valet via sidfoten; GA4 ska starta direkt, utan omladdning.
  await page.getByRole("button", { name: "Cookie-inställningar" }).click()
  check(await banner(page).isVisible(), "Cookie-inställningar i sidfoten visar rutan igen")
  await page.evaluate(() => (window.__sammaSida = true))
  await page.getByRole("button", { name: "Godkänn alla" }).click()
  await page.waitForFunction(() => Array.isArray(window.dataLayer) && window.dataLayer.length > 0, null, { timeout: 5000 }).catch(() => {})
  check(ga.some((u) => u.includes("gtag/js?id=G-23NXJ2VS0B")), `Godkänn alla: GA4 (G-23NXJ2VS0B) laddas (${ga.length} anrop)`)
  check(await page.evaluate(() => window.__sammaSida === true), "GA4 startar utan omladdning av sidan")
  check((await consent()) === "granted", 'coavira_cookie_consent = "granted"')
  const dl = await page.evaluate(() => JSON.stringify(window.dataLayer?.map((a) => Array.from(a)) ?? []))
  check(dl.includes('"config","G-23NXJ2VS0B"') && dl.includes('"ad_storage":"denied"') && dl.includes('"allow_google_signals":false'), "gtag: config med ID, inga annonsfunktioner")
  check(!(await banner(page).isVisible()), "rutan stängs efter godkännande")
  await page.reload({ waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  check(!(await banner(page).isVisible()) && ga.filter((u) => u.includes("gtag/js")).length === 2, "efter omladdning: ingen ruta, GA4 laddas direkt")
  check(errors.length === 0, `inga sidfel (${errors.join("; ")})`)
  await ctx.close()
}
{
  // Val sparat med den första versionens nyckel gäller fortfarande.
  const ctx = await browser.newContext()
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem("klar")) localStorage.setItem("coavira:analytics", "denied")
    sessionStorage.setItem("klar", "1")
  })
  const page = await ctx.newPage()
  await page.goto("http://coavira.fit/", { waitUntil: "networkidle" })
  await page.waitForTimeout(600)
  check(!(await banner(page).isVisible()), "tidigare sparat val (gammal nyckel) respekteras")
  await ctx.close()
}
{
  const { ctx, page, ga } = await open("http://coavira.fit/integritet")
  check((await page.locator("#cookies").count()) === 1 && /Google Analytics/.test(await page.locator("#cookies").innerText()), "integritetssidan beskriver Google Analytics (#cookies)")
  check(await banner(page).isVisible() && ga.length === 0, "rutan visas även på de publika undersidorna, utan GA före samtycke")
  await ctx.close()
}
for (const [url, label, opts] of [
  ["http://ptapp2.vercel.app/kom-igang", "appens domän", {}],
  ["http://coavira.fit/kom-igang", "mobilappen", { userAgent: "Mozilla/5.0 (iPhone) CoaviraApp" }],
  [`${base.origin}/`, "localhost/förhandsversioner", {}],
]) {
  const { ctx, page, ga } = await open(url, opts)
  check(!(await banner(page).isVisible()) && ga.length === 0, `${label}: ingen samtyckesruta och ingen GA`)
  await ctx.close()
}
await browser.close()

if (failed) {
  console.log(`${failed} FEL`)
  process.exit(1)
}
console.log("SEO OCH GA4 GODKÄNDA")
