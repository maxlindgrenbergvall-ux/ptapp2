// E2E för v36 i Supabase-läge: befintliga användare som aldrig valt om nyhetsbrev
// får en pop-up vid inloggning. Ja → Resend-segmentet för rollen, Nej → inget,
// "Fråga mig senare" → frågan kommer igen vid nästa inloggning.
// Mot e2e/mock-supabase.mjs och e2e/mock-resend.mjs (RESEND_API_KEY=re_test RESEND_API_BASE=http://localhost:54800).
//   BASE_URL=http://localhost:3000 node e2e/v36-supabase.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const resend = "http://localhost:54800"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))
const onboarding = async (id) => (await (await fetch(`${mock}/__onboarding`)).json())[id]
const contact = async (email) => (await (await fetch(`${resend}/__state`)).json()).contacts.find((c) => c.email === email)
const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}
const C1 = "22222222-0000-4000-8000-000000000001"
const T1 = "11111111-0000-4000-8000-000000000001"
await fetch(`${mock}/__reset`)
await fetch(`${resend}/__reset`)

async function login(email, path = "/logga-in", home = /\/klient$/) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}${path}`)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(home)
  return { ctx, p }
}
const promptShown = async (p) => {
  try {
    await p.waitForSelector("[data-testid=marketing-prompt]", { timeout: 4000 })
    return true
  } catch {
    return false
  }
}

// Ett konto som redan valt ser ingen pop-up.
{
  const { ctx, p } = await login("sara@test.se")
  check(!(await promptShown(p)), "har redan valt: ingen pop-up")
  await ctx.close()
}

// ------------------------------------------------ klient: senare → ja ---
await fetch(`${mock}/__marketing_unasked?email=sara@test.se`)
{
  const { ctx, p } = await login("sara@test.se")
  check(await promptShown(p), "befintlig klient som aldrig valt: pop-upen visas vid inloggning")
  const yes = p.getByTestId("marketing-prompt-yes")
  const no = p.getByTestId("marketing-prompt-no")
  check((await yes.isVisible()) && (await no.isVisible()), "två tydliga val: Ja tack / Nej tack")
  await p.screenshot({ path: `${out}/v36-popup.png` })
  await p.getByTestId("marketing-prompt-later").click()
  await p.waitForSelector("[data-testid=marketing-prompt]", { state: "detached" })
  check((await onboarding(C1)).choiceAt === null, "Fråga mig senare: inget val sparas")
  await p.reload()
  check(!(await promptShown(p)), "Fråga mig senare: inte igen under samma inloggning")
  await ctx.close()
}
{
  const { ctx, p } = await login("sara@test.se")
  check(await promptShown(p), "nästa inloggning: frågan kommer igen")
  await p.getByTestId("marketing-prompt-yes").click()
  await p.waitForSelector("[data-testid=marketing-prompt]", { state: "detached" })
  const o = await onboarding(C1)
  check(o.marketing === true && o.consentLog.at(-1)?.source === "prompt", "ja sparas med källan pop-up")
  const c = await waitFor(() => contact("sara@test.se"))
  check(c?.segments.join(",") === "Klient - Nyhetsbrev" && !c.unsubscribed, `ja → Resend "Klient - Nyhetsbrev" (${c?.segments})`)
  await ctx.close()
}
{
  const { ctx, p } = await login("sara@test.se")
  check(!(await promptShown(p)), "efter ett val: ingen pop-up längre")
  await ctx.close()
}

// --------------------------------------------------------- PT: nej ---
await fetch(`${mock}/__marketing_unasked?email=elin@test.se`)
{
  const { ctx, p } = await login("elin@test.se", "/logga-in/pt", /\/pt(\?.*)?$/)
  check(await promptShown(p), "befintlig PT som aldrig valt: pop-upen visas")
  await p.getByTestId("marketing-prompt-no").click()
  await p.waitForSelector("[data-testid=marketing-prompt]", { state: "detached" })
  const o = await onboarding(T1)
  check(o.marketing === false && o.choiceAt && o.consentLog.at(-1)?.granted === false && o.consentLog.at(-1)?.source === "prompt", "nej sparas och loggas (källa pop-up)")
  await new Promise((r) => setTimeout(r, 800))
  check(!(await contact("elin@test.se")), "nej → ingen kontakt hos Resend")
  await ctx.close()
}
{
  const { ctx, p } = await login("elin@test.se", "/logga-in/pt", /\/pt(\?.*)?$/)
  check(!(await promptShown(p)), "PT: efter nej frågar vi inte igen")
  await ctx.close()
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
