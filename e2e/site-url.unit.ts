// Enhetstest för domänlogiken (src/lib/site.ts): coavira.fit = landningssidan, ptapp2.vercel.app = appen.
//   npx tsx --tsconfig tsconfig.json e2e/site-url.unit.ts
import { APP_URL, hostRoute, isAppUserAgent, LANDING_HOSTS, SITE_URL } from "@/lib/site"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const land = { host: "coavira.fit", pathname: "/", search: "", method: "GET", userAgent: "Mozilla/5.0" }
const app = { ...land, host: "ptapp2.vercel.app" }

check(SITE_URL === "https://coavira.fit" && APP_URL === "https://ptapp2.vercel.app", `adresser: ${SITE_URL} / ${APP_URL}`)
check(same(LANDING_HOSTS, ["coavira.fit", "www.coavira.fit"]), "landningsdomänen med och utan www")

// coavira.fit: bara landningssidan
for (const p of ["/", "/support", "/integritet", "/villkor"]) check(hostRoute({ ...land, pathname: p }) === null, `coavira.fit${p} visas`)
check(hostRoute({ ...land, host: "www.coavira.fit" }) === null, "www.coavira.fit visar landningssidan")
check(hostRoute({ ...land, host: "Coavira.FIT" }) === null, "värdnamnet jämförs utan skiftläge")
check(same(hostRoute({ ...land, pathname: "/kom-igang" }), { redirect: "https://ptapp2.vercel.app/kom-igang" }), "inloggningen → appen")
check(same(hostRoute({ ...land, pathname: "/klient/kalender", search: "?d=1" }), { redirect: "https://ptapp2.vercel.app/klient/kalender?d=1" }), "app-sidor → appen (sökväg och query behålls)")
check(same(hostRoute({ ...land, pathname: "/auth/callback", search: "?code=x&next=%2Fklient" }), { redirect: "https://ptapp2.vercel.app/auth/callback?code=x&next=%2Fklient" }), "auth-callback → appen")
check(same(hostRoute({ ...land, search: "?code=x" }), { redirect: "https://ptapp2.vercel.app/?code=x" }), "e-postlänk till startsidan (?code) → appen")
check(same(hostRoute({ ...land, search: "?token_hash=t&type=signup" }), { redirect: "https://ptapp2.vercel.app/?token_hash=t&type=signup" }), "e-postlänk (?token_hash) → appen")
check(hostRoute({ ...land, search: "?utm_source=x" }) === null, "vanliga query-parametrar stannar på landningssidan")
check(hostRoute({ ...land, pathname: "/api/stripe/webhook", method: "POST" }) === null, "Stripe-webhooken fungerar på båda domänerna")
check(hostRoute({ ...land, pathname: "/api/calendar/feed/abc.ics" }) === null, "kalenderprenumerationer fungerar på båda domänerna")
check(hostRoute({ ...land, pathname: "/.well-known/assetlinks.json" }) === null, "App Links-filer omdirigeras inte")
for (const p of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/opengraph-image", "/apple-icon", "/icon.svg"]) check(hostRoute({ ...land, pathname: p }) === null, `${p} serveras på landningsdomänen`)
check(hostRoute({ ...land, pathname: "/logga-in", method: "POST" }) === null, "bara GET/HEAD omdirigeras")
check(hostRoute({ ...land, pathname: "/klient", userAgent: "Mozilla/5.0 CoaviraApp" }) === null, "mobilappen (äldre byggen mot coavira.fit) fungerar som förut")

// ptapp2.vercel.app: appen
check(same(hostRoute(app), { start: true }), "appens domän: / → inloggningen")
for (const p of ["/kom-igang", "/klient", "/pt/kalender", "/auth/callback", "/integritet", "/support"]) check(hostRoute({ ...app, pathname: p }) === null, `ptapp2.vercel.app${p} visas`)

// Mobilappen och övriga värdar
check(same(hostRoute({ ...land, host: "localhost:3000", userAgent: "x CoaviraApp" }), { start: true }), "mobilappen börjar på inloggningen")
check(hostRoute({ ...land, host: "localhost:3000" }) === null, "localhost visar landningssidan (båda delarna fungerar)")
check(hostRoute({ ...land, host: "ptapp2-git-feature-x.vercel.app" }) === null, "förhandsversioner visar landningssidan")
check(hostRoute({ ...land, host: "ptapp2-git-feature-x.vercel.app", pathname: "/klient" }) === null, "förhandsversioner visar appen")
check(isAppUserAgent("x CoaviraApp CoaviraPush") && !isAppUserAgent("Mozilla/5.0"), "appen känns igen på user agent")

if (failed) process.exit(1)
console.log("DOMÄNLOGIKEN GODKÄND")
