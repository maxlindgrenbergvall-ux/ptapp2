// E2E (demoläget) för v22: PT-onboardingen fungerar utan Supabase och Stripe
// (simulerad koppling) och visas utan portalens meny.
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
// Demo-PT:n saknar profilbild: fyll i det som saknas.
const save = p.getByRole("button", { name: "Spara och fortsätt" })
if (await save.isDisabled()) {
  check(await p.locator("[data-testid=onboarding-missing]").isVisible(), "demo: visar vad som saknas i profilen")
  await p.getByRole("button", { name: "Länk" }).click()
  await p.locator('input[placeholder^="https"]').fill("https://images.example/elin.jpg")
  await p.locator('input[placeholder^="https"]').press("Enter")
}
await save.click()
await p.waitForSelector("[data-testid=onboarding-payouts]")
await p.getByTestId("connect-payouts").click()
await p.waitForSelector("[data-testid=onboarding-done]")
ok("demo: kopplingen simuleras och \"Allt klart\" visas")
await p.getByRole("button", { name: "Gå till PT-portalen" }).click()
await p.waitForSelector("text=Välkommen till Coavira")
check(new URL(p.url()).pathname === "/pt", "demo: välkommen in i portalen")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
