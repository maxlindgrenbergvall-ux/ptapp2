// E2E (demoläget) för v22/v31: PT-onboardingen (profil → Stripe → villkor) fungerar
// utan Supabase och Stripe (simulerad koppling) och visas utan portalens meny.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/connect-onboarding-demo.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))

const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await p.goto(base + "/pt")
await p.waitForSelector("text=Klienter")
ok("demo: PT-portalen är öppen (demo-PT:n är redan klar)")
await p.goto(base + "/pt/onboarding")
await p.waitForSelector("[data-testid=onboarding-profile]")
check((await p.locator('nav[aria-label="Huvudmeny"]').count()) === 0, "demo: onboardingen visas utan portalens meny")
// Demo-PT:n saknar profilbild: ladda upp en (granskas av bildfiltret).
const save = p.getByTestId("onboarding-save-profile")
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64")
await save.click()
check(await p.locator("[data-testid=onboarding-missing]").isVisible(), "demo: visar vad som saknas i profilen")
await p.setInputFiles("[data-testid=avatar-picker] input[type=file]", { name: "elin.png", mimeType: "image/png", buffer: png })
await p.waitForFunction(() => document.querySelector("[data-testid=avatar-picker] img[src^='data:image']"))
await save.click()
await p.waitForSelector("[data-testid=onboarding-payouts]")
await p.getByTestId("connect-payouts").click()
await p.waitForSelector("[data-testid=onboarding-done]")
ok("demo: kopplingen simuleras")
await p.getByTestId("onboarding-to-terms").click()
await p.waitForSelector("[data-testid=onboarding-terms]")
check(await p.getByTestId("activate-account").isDisabled(), "demo: kontot aktiveras inte utan godkända avtal")
await p.getByTestId("accept-all").click()
await p.getByTestId("activate-account").click()
await p.waitForSelector("text=Välkommen till Coavira")
check(new URL(p.url()).pathname === "/pt", "demo: välkommen in i portalen")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
