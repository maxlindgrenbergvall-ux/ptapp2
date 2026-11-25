// E2E för v31 i Supabase-läge: befintliga konton med onboarding_completed = false
// i JWT:n tvingas genom det nya intro-flödet. Klient: steg 1 → mål → klar.
// PT: steg 1 (profilbild krävs) → (Stripe redan klart) → villkor → aktiverat.
//   (start som e2e/v16-supabase.test.mjs)
//   BASE_URL=http://localhost:3000 node e2e/v31-supabase.test.mjs
import { chromium } from "playwright"
import sharp from "sharp"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (cond, m) => (cond ? ok(m) : fail(m))
const getLog = async () => (await fetch(`${mock}/__log`)).json()
await fetch(`${mock}/__reset`)
await fetch(`${mock}/__reset_v31`)
const C_INTRO = "22222222-0000-4000-8000-00000000a001"

const noise = Buffer.alloc(96 * 96 * 3)
for (let i = 0; i < noise.length; i++) noise[i] = (i * 73 + (i >> 5) * 31) % 256
const png = await sharp(noise, { raw: { width: 96, height: 96, channels: 3 } }).png().toBuffer()

async function login(email, path = "/logga-in") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "sv-SE" })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}${path}`)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  return { ctx, p }
}

// ------------------------------------------------------------ klient ---
{
  const { ctx, p } = await login("intro@test.se")
  await p.waitForURL(/\/klient\/intro$/)
  ok("befintlig klient (onboarding_completed = false) skickas till intro-flödet vid inloggning")
  await p.goto(`${base}/klient/recept`)
  await p.waitForURL(/\/klient\/intro$/)
  ok("resten av appen är stängd tills intro-flödet är klart")
  await p.waitForSelector("[data-testid=profile-step]")
  await p.waitForFunction(() => document.querySelector("#profile-lastName")?.value === "Intro")
  check((await p.inputValue("#profile-firstName")) === "Ida", "steg 1 förifylls med för- och efternamn från databasen")
  check((await p.locator('a:has-text("Gör senare")').count()) === 0, "intro-flödet går inte att hoppa över")
  await p.setInputFiles("[data-testid=profile-step] input[type=file]", { name: "ida.png", mimeType: "image/png", buffer: png })
  await p.waitForSelector("[data-testid=profile-step] button:has-text(\"Byt bild\")") // uppladdad och godkänd av bildfiltret
  await p.fill("#profile-lastName", "Introsson")
  await fetch(`${mock}/__reset`)
  await p.click("[data-testid=intro-next]")
  await p.waitForSelector("text=Dina mått")
  let log = await getLog()
  const step1 = log.find((e) => e.table === "save_profile_step")
  check(step1?.body.p_first_name === "Ida" && step1.body.p_last_name === "Introsson" && step1.body.p_avatar_url?.includes(`/avatars/${C_INTRO}/avatar.webp`), "steg 1 sparas med save_profile_step (bild från bildfiltret)")
  await p.fill("#goal-weightKg", "")
  await p.fill("#goal-weightKg", "70")
  await p.fill("#goal-heightCm", "168")
  await p.fill("#goal-age", "33")
  await p.click('[role=radio]:has-text("Kvinna")')
  await p.click("[data-testid=intro-next]")
  await p.click('[data-testid=activity-picker] [role=radio]:has-text("Lätt aktiv")')
  await p.click("[data-testid=intro-next]")
  await p.click('[data-testid=goal-picker] button:has-text("Body recomposition")')
  await p.click("[data-testid=intro-next]")
  await p.waitForSelector("[data-testid=goal-chart]")
  await p.click("[data-testid=intro-next]")
  // v34: sista steget – användaravtalet (obligatoriskt) och nyhetsbrev (valfritt).
  await p.waitForSelector("[data-testid=agreement-step]")
  await p.click("[data-testid=intro-next]")
  check(await p.locator("#accept-agreement-error").isVisible(), "v34: avtalet måste godkännas för att gå vidare")
  check(new URL(p.url()).pathname === "/klient/intro", "v34: stannar kvar utan godkännande")
  await p.click("[data-testid=accept-agreement]")
  await p.click("[data-testid=intro-next]")
  await p.waitForURL(`${base}/klient`)
  await p.waitForLoadState("networkidle")
  log = await getLog()
  const goalsAt = log.findIndex((e) => e.table === "client_goals" && e.method === "POST")
  const finishAt = log.findIndex((e) => e.table === "finish_onboarding")
  check(goalsAt >= 0 && finishAt > goalsAt, "målen sparas innan finish_onboarding")
  const agreeAt = log.findIndex((e) => e.table === "accept_user_agreement")
  check(agreeAt >= 0 && agreeAt < finishAt && log[agreeAt].body.p_marketing === false, "v34: avtalet godkänns (utan nyhetsbrev) innan finish_onboarding")
  check(await p.locator("text=Dagens träning").isVisible(), "klienten kommer in i appen (ny JWT med onboarding_completed)")
  await p.goto(`${base}/klient/intro`)
  await p.waitForSelector("[data-testid=goal-intro]")
  check(await p.locator('a:has-text("Gör senare")').isVisible(), "efteråt kan intro-flödet göras om frivilligt")
  await ctx.close()
}

// ---------------------------------------------------------------- PT ---
{
  const { ctx, p } = await login("intropt@test.se", "/logga-in/pt")
  await p.waitForURL(/\/pt\/onboarding$/)
  ok("befintlig PT skickas till PT:ns intro-flöde vid inloggning")
  // v76: PT-introt i tre steg – steg 1 är namn, företag, portaler och avtalet.
  await p.waitForSelector("[data-testid=pt-onboarding-account]")
  await p.waitForFunction(() => document.querySelector("#pt-first")?.value === "Per")
  ok("namnet är förifyllt")
  // Steg 1 är tre korta sidor: namn → företag → friskvård och avtal.
  for (const n of [1, 2]) {
    await p.getByTestId("pt-flow-next").click()
    await p.waitForSelector(`form[data-part="${n}"]`)
  }
  await p.getByTestId("pt-flow-next").click()
  check(await p.locator("text=Godkänn avtalet för att fortsätta").waitFor({ timeout: 3000 }).then(() => true, () => false), "kontot aktiveras inte utan godkänt avtal")
  check((await p.locator('a[href="/avtal/pt"]').count()) === 1, "hela avtalet går att läsa")
  await fetch(`${mock}/__reset`)
  await p.click("[data-testid=pt-terms]")
  await p.getByTestId("pt-flow-next").click()
  await p.waitForSelector("[data-testid=pt-onboarding-payouts]")
  ok("steg 2: utbetalningar")
  // Stripe klart sedan tidigare eller inte – PT:n kan gå vidare (Stripe kan kopplas senare).
  await (await p.locator("[data-testid=skip-payouts]").count() ? p.getByTestId("skip-payouts") : p.getByTestId("pt-flow-next")).click()
  await p.waitForSelector("[data-testid=pt-onboarding-package]")
  await p.getByTestId("package-later").click()
  await p.waitForURL(/\/pt(\?valkommen=1)?$/)
  await p.waitForLoadState("networkidle")
  const log = await getLog()
  check(log.some((e) => e.table === "save_pt_account_step" && e.body.p_first_name === "Per"), "PT:ns steg 1 sparas (save_pt_account_step)")
  const acc = log.find((e) => e.table === "accept_legal_documents")
  // v65: communityreglerna är en egen del av avtalet.
  check(["terms", "privacy", "community", "pt_agreement", "gdpr_dpa"].every((d) => acc?.body.p_documents?.includes(d)), "ett godkännande av alla fem delarna")
  check(log.some((e) => e.table === "finish_pt_onboarding"), "finish_pt_onboarding avslutar introt")
  check(new URL(p.url()).pathname === "/pt", "PT-portalen öppnas")
  await ctx.close()
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
