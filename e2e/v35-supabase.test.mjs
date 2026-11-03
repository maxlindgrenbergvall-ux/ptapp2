// E2E för v35 i Supabase-läge: nyhetsbrevet kopplas till Resend-segment efter roll.
//   klient + kryss i onboarding → segmentet "Klient - Nyhetsbrev"
//   PT     + kryss i onboarding → segmentet "PT - Nyhetsbrev" (hittas trots tankstreck/skiftläge)
//   kryss bort i Inställningar   → avregistrerad och borttagen ur segmentet
// Mot e2e/mock-supabase.mjs och e2e/mock-resend.mjs
//   (RESEND_API_KEY=re_test RESEND_API_BASE=http://localhost:54800 på servern)
//   BASE_URL=http://localhost:3000 node e2e/v35-supabase.test.mjs
import { chromium } from "playwright"
import sharp from "sharp"

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
const state = async () => (await fetch(`${resend}/__state`)).json()
const contact = async (email) => (await state()).contacts.find((c) => c.email === email)
const waitFor = async (fn, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}
await fetch(`${mock}/__reset`)
await fetch(`${mock}/__reset_v31`)
await fetch(`${resend}/__reset`)

const noise = Buffer.alloc(96 * 96 * 3)
for (let i = 0; i < noise.length; i++) noise[i] = (i * 73 + (i >> 5) * 31) % 256
const png = await sharp(noise, { raw: { width: 96, height: 96, channels: 3 } }).png().toBuffer()

async function login(email, path = "/logga-in") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}${path}`)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  return { ctx, p }
}

// Säkerhet: utan inloggning händer ingenting.
const anon = await fetch(`${base}/api/marketing/sync`, { method: "POST" })
check(anon.status === 401, "utan inloggning: 401")
check((await state()).log.length === 0, "inget anrop till Resend utan inloggning")

// ------------------------------------------------------------ klient ---
{
  const { ctx, p } = await login("intro@test.se")
  await p.waitForURL(/\/klient\/intro$/)
  await p.waitForSelector("[data-testid=profile-step]")
  await p.waitForFunction(() => document.querySelector("#profile-lastName")?.value === "Intro")
  await p.setInputFiles("[data-testid=profile-step] input[type=file]", { name: "ida.png", mimeType: "image/png", buffer: png })
  await p.waitForSelector('[data-testid=profile-step] button:has-text("Byt bild")')
  await p.click("[data-testid=intro-next]")
  await p.waitForSelector("text=Dina mått")
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
  await p.waitForSelector("[data-testid=agreement-step]")
  await p.click("[data-testid=accept-agreement]")
  await p.click("[data-testid=marketing-consent]")
  await p.click("[data-testid=intro-next]")
  await p.waitForURL(`${base}/klient`)
  const c = await waitFor(() => contact("intro@test.se"))
  check(Boolean(c), "klienten med kryss läggs som kontakt hos Resend")
  check(c?.segments.join(",") === "Klient - Nyhetsbrev" && c.unsubscribed === false, `klient → "Klient - Nyhetsbrev" (${c?.segments})`)
  check(c?.first_name === "Ida", "förnamnet följer med till Resend")
  check(!(await state()).log.some((e) => e.path.includes("seg_pt") || e.path.includes("seg_gammal")), "PT-segmentet och andra segment rörs inte för en klient")
  // Hemskärmen: tidsbaserad hälsning.
  const hello = await p.locator("[data-testid=home-greeting]").innerText()
  check(/^(God morgon Ida|Hej Ida!|God kväll Ida)$/.test(hello), `hälsningen på hemskärmen: "${hello}"`)

  // Inställningar: kryss bort → avregistrerad och borttagen ur segmentet.
  await p.goto(`${base}/klient/installningar`)
  await p.waitForFunction(() => document.querySelector("[data-testid=marketing-toggle]")?.getAttribute("aria-checked") === "true")
  await p.click("[data-testid=marketing-toggle]")
  const off = await waitFor(async () => {
    const x = await contact("intro@test.se")
    return x?.unsubscribed ? x : null
  })
  check(off?.unsubscribed === true && off.segments.length === 0, "kryss bort: avregistrerad och borttagen ur segmentet")
  // … och på igen.
  await p.click("[data-testid=marketing-toggle]")
  const on = await waitFor(async () => {
    const x = await contact("intro@test.se")
    return x && !x.unsubscribed && x.segments.includes("Klient - Nyhetsbrev") ? x : null
  })
  check(Boolean(on), "kryss på igen: tillbaka i \"Klient - Nyhetsbrev\"")
  await ctx.close()
}

// Klient utan kryss: ingen kontakt skapas.
{
  const { ctx, p } = await login("sara@test.se")
  await p.waitForURL(/\/klient/)
  const r = await p.request.post(`${base}/api/marketing/sync`)
  const body = await r.json()
  check(r.status() === 200 && body.action === "noop", "utan samtycke: ingen kontakt hos Resend")
  check(!(await contact("sara@test.se")), "sara finns inte hos Resend")
  await ctx.close()
}

// ---------------------------------------------------------------- PT ---
{
  const { ctx, p } = await login("intropt@test.se", "/logga-in/pt")
  await p.waitForURL(/\/pt\/onboarding$/)
  await p.waitForSelector("[data-testid=onboarding-profile]")
  await p.setInputFiles("[data-testid=profile-step] input[type=file]", { name: "per.png", mimeType: "image/png", buffer: png })
  await p.waitForSelector('[data-testid=profile-step] button:has-text("Byt bild")')
  await p.fill("#onb-bio", "Licensierad PT med fokus på styrka, rörlighet och hållbara vanor för vardagen.")
  if ((await p.locator('button[aria-pressed=true]:has-text("Styrkelyft")').count()) === 0) await p.locator('button:has-text("Styrkelyft")').click()
  await p.getByTestId("onboarding-save-profile").click()
  await p.waitForSelector("[data-testid=onboarding-terms]")
  await p.getByTestId("accept-agreement").click()
  await p.getByTestId("marketing-consent").click()
  await p.getByTestId("activate-account").click()
  await p.waitForURL(/\/pt(\?valkommen=1)?$/)
  const c = await waitFor(() => contact("intropt@test.se"))
  check(c?.segments.join(",") === "PT – nyhetsbrev" && c.unsubscribed === false, `PT → "PT - Nyhetsbrev" (hittat som "${c?.segments}")`)
  const st = await state()
  check(st.segments.length === 3 && !st.log.some((e) => e.path === "/segments" && e.method === "POST"), "inga nya segment skapas (bara era befintliga används)")
  await ctx.close()
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
