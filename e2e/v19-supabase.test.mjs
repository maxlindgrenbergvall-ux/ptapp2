// E2E för v19 i Supabase-läge mot e2e/mock-supabase.mjs och e2e/mock-stripe.mjs:
// egen övning sparas i custom_exercises, PT:n skapar kod med create_pt_invite,
// klienten löser in koden (Inställningar och välkomststeget via PT:ns länk)
// med redeem_pt_invite, och Stripe får serviceavgiften 5 % eller 10 %.
//   (start som e2e/v16-supabase.test.mjs)
//   BASE_URL=http://localhost:3000 node e2e/v19-supabase.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const stripe = "http://localhost:54500"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))
const getLog = async () => (await fetch(`${mock}/__log`)).json()
const lastStripeForm = async () => (await (await fetch(`${stripe}/__log`)).json()).filter((e) => e.method === "POST").at(-1)?.form ?? {}
await fetch(`${mock}/__reset`)
await fetch(`${mock}/__reset_v18`) // återställer även v19 (Nova ny, Elins koder, kundursprung)

const S_SINGLE = "99999999-0000-4000-8000-000000000001"

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/logga-in${email.startsWith("elin") ? "/pt" : ""}`)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(/\/(klient|pt)$/)
  await p.waitForLoadState("networkidle")
  return { ctx, p }
}

// ---------------------------------------- 1. PT: Bjud in existerande klient ---
{
  const { ctx, p } = await login("elin@test.se")
  const card = p.locator("[data-testid=pt-invites-card]")
  await card.waitFor()
  check((await card.innerText()).includes("EX-KALLE2"), "PT:ns koder laddas från pt_invites")
  await p.locator("button:has-text('Bjud in existerande klient')").first().click()
  await p.fill("#invite-label", "Nova")
  await p.locator("[data-testid=pt-invite-dialog] button:has-text('Skapa kod')").click()
  await p.waitForSelector("[data-testid=pt-invite-code]")
  check((await p.locator("[data-testid=pt-invite-code]").innerText()).trim() === "EX-NYKD23", "koden kommer från create_pt_invite (databasen)")
  const log = await getLog()
  check(log.some((e) => e.table === "create_pt_invite" && e.body.p_label === "Nova"), "create_pt_invite anropas med PT:ns anteckning")
  check(!log.some((e) => e.table === "pt_invites" && e.method === "POST"), "PT:n skriver aldrig koder direkt i tabellen")
  await ctx.close()
}

// ------------------------------------ 2. Sara: egen övning och kod i Inställningar ---
{
  const { ctx, p } = await login("sara@test.se")
  await p.click("button:has-text('Logga eget pass')")
  await p.fill("#own-search", "Zercher")
  await p.click("button:has-text('Lägg till egen övning')")
  await p.fill("#cx-name", "Zercher-utfall")
  await p.fill("#cx-weight", "40")
  await p.fill("#cx-reps", "6")
  await p.click("button:has-text('Spara och lägg i passet')")
  await p.waitForSelector("[aria-label='Övningar i passet'] >> text=Zercher-utfall")
  await p.waitForTimeout(800)
  let log = await getLog()
  const ins = log.find((e) => e.table === "custom_exercises" && e.method === "POST")
  check(
    ins?.body?.name === "Zercher-utfall" && ins.body.default_weight === 40 && ins.body.weight_unit === "kg" && ins.body.default_reps === "6" && /^cx-/.test(ins.body.id),
    "egen övning sparas i custom_exercises (namn, startvikt, reps)"
  )
  check(ins?.body?.user_id === "22222222-0000-4000-8000-000000000001", "kopplad till användaren (user_id)")
  await p.keyboard.press("Escape")

  await p.goto(`${base}/klient/installningar`)
  const card = p.locator("[data-testid=pt-invite-redeem]")
  await card.waitFor()
  await card.locator("input").fill("EX-ZZZZZZ")
  await card.locator("button:has-text('Koppla')").click()
  await card.locator("text=Koden finns inte eller har redan använts").waitFor()
  ok("okänd kod: databasens svar visas")
  await card.locator("input").fill("EX-KALLE2")
  await card.locator("button:has-text('Koppla')").click()
  await card.locator("text=Du har redan köpt hos PT:n via Coavira").waitFor()
  ok("plattformsklient med köp kan inte sänka avgiften med en kod")
  log = await getLog()
  check(log.filter((e) => e.table === "redeem_pt_invite").map((e) => e.body.p_code).join() === "EX-ZZZZZZ,EX-KALLE2", "koderna valideras av redeem_pt_invite")

  // Kassan som plattformsklient: 10 %.
  const r = await p.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: S_SINGLE, quantity: 1 }] } })
  check(r.ok(), "kassan startar")
  const form = await lastStripeForm()
  check(form["line_items[1][price_data][unit_amount]"] === "8000" && form["line_items[1][price_data][product_data][name]"] === "Serviceavgift (10 %)", "plattformsklient: Stripe får 10 % (80 kr av 800 kr)")
  await ctx.close()
}

// --------------------------- 3. Nova: PT:ns länk → välkomststeget → befintlig klient ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/ref/EX-NYKD23`)
  await p.waitForSelector("[data-testid=pt-invite-banner]")
  ok("PT:ns länk visar inbjudan på registreringen")
  await p.goto(`${base}/logga-in`)
  await p.fill("#email", "ny@test.se")
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(`${base}/valkommen`)
  await p.waitForSelector("#pt-code")
  check((await p.locator("label[for=pt-code]").innerText()).trim() === "Har du en inbjudningskod från din PT?", "fältet heter Har du en inbjudningskod från din PT?")
  check((await p.inputValue("#pt-code")) === "EX-NYKD23", "koden från PT:ns länk är förifylld")
  await p.fill("#phone", "0701234567")
  await p.click("#consent")
  await p.click("button[type=submit]")
  await p.waitForURL(`${base}/klient`)
  await p.waitForLoadState("networkidle")
  const log = await getLog()
  const iOnb = log.findIndex((e) => e.table === "complete_onboarding")
  const iPt = log.findIndex((e) => e.table === "redeem_pt_invite" && e.body.p_code === "EX-NYKD23")
  check(iPt > iOnb && iOnb >= 0, "koden löses in med redeem_pt_invite efter att kontot fått sin roll")
  check(!(await p.evaluate(() => localStorage["coavira:ptkod"])), "den sparade koden rensas")

  // Kassan som befintlig klient: 5 %.
  const r = await p.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: S_SINGLE, quantity: 1 }] } })
  check(r.ok(), "kassan startar")
  const form = await lastStripeForm()
  check(form["line_items[1][price_data][unit_amount]"] === "4000" && form["line_items[1][price_data][product_data][name]"] === "Serviceavgift (5 %)", "befintlig klient: Stripe får 5 % (40 kr av 800 kr)")
  check(form["metadata[fee_percent]"] === "5", "procentsatsen finns i Stripe-metadata")
  await ctx.close()
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
