// Enhetstest för domänlogiken (src/lib/site.ts): omdirigering *.vercel.app → egen domän.
//   NEXT_PUBLIC_SITE_URL=https://coavira.se NEXT_PUBLIC_CANONICAL_REDIRECT=1 npx tsx --tsconfig tsconfig.json e2e/site-url.unit.ts
import { CANONICAL_HOST, canonicalRedirect, isAppUserAgent, SITE_URL } from "@/lib/site"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}

const base = { host: "ptapp2.vercel.app", pathname: "/klient", search: "?a=1", method: "GET", userAgent: "Mozilla/5.0", vercelEnv: "production" }
check(SITE_URL === "https://coavira.se" && CANONICAL_HOST === "coavira.se", `egen domän: ${SITE_URL}`)
check(canonicalRedirect(base) === "https://coavira.se/klient?a=1", "vercel.app i produktion → egna domänen (med sökväg och query)")
check(canonicalRedirect({ ...base, pathname: "/" , search: "" }) === "https://coavira.se/", "startsidan omdirigeras")
check(canonicalRedirect({ ...base, host: "coavira.se" }) === null, "egna domänen omdirigeras inte")
check(canonicalRedirect({ ...base, host: "www.coavira.se" }) === null, "www hanteras av Vercel (domäninställning), inte av appen")
check(canonicalRedirect({ ...base, vercelEnv: "preview" }) === null, "förhandsversioner ligger kvar på vercel.app")
check(canonicalRedirect({ ...base, pathname: "/api/stripe/webhook", method: "POST" }) === null, "Stripe-webhooken omdirigeras inte")
check(canonicalRedirect({ ...base, pathname: "/api/calendar/feed/abc.ics" }) === null, "kalenderprenumerationer fortsätter fungera")
check(canonicalRedirect({ ...base, pathname: "/auth/callback", search: "?code=x" }) === null, "gamla e-postlänkar (PKCE på gamla domänen) fungerar")
check(canonicalRedirect({ ...base, pathname: "/.well-known/assetlinks.json" }) === null, "App Links-filer omdirigeras inte")
check(canonicalRedirect({ ...base, method: "POST", pathname: "/logga-in" }) === null, "bara GET/HEAD omdirigeras")
check(canonicalRedirect({ ...base, userAgent: "Mozilla/5.0 Mobile CoaviraApp" }) === null, "appen (äldre byggen mot vercel.app) omdirigeras inte")
check(isAppUserAgent("x CoaviraApp CoaviraPush") && !isAppUserAgent("Mozilla/5.0"), "appen känns igen på user agent")

if (failed) process.exit(1)
console.log("DOMÄNLOGIKEN GODKÄND")
