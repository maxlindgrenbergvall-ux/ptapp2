// E2E för v73 i demoläge: passtimern och en högre vilosignal. v81: timern är tyst –
// ingen klocka under passet, längden visas i summeringen och sparas i historiken.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v73-passtimer-ljud.test.mjs [skärmbildsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))
const KEY = "coavira:demo:v5"

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2 })
// Spion på ljudmotorn: hur många ljudmotorer som skapas, toner som spelas och deras högsta volym.
await ctx.addInitScript(() => {
  const Real = window.AudioContext
  window.__audio = { contexts: 0, tones: 0, peak: 0, resumed: 0 }
  window.AudioContext = class extends Real {
    constructor(...a) {
      super(...a)
      window.__audio.contexts++
    }
    createOscillator() {
      const o = super.createOscillator()
      const start = o.start.bind(o)
      o.start = (...a) => {
        window.__audio.tones++
        return start(...a)
      }
      return o
    }
    createGain() {
      const g = super.createGain()
      const ramp = g.gain.exponentialRampToValueAtTime.bind(g.gain)
      g.gain.exponentialRampToValueAtTime = (v, t) => {
        window.__audio.peak = Math.max(window.__audio.peak, v)
        return ramp(v, t)
      }
      return g
    }
    resume() {
      window.__audio.resumed++
      return super.resume()
    }
  }
})
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text()) && errors.push(`console: ${m.text()}`))
const audio = () => p.evaluate(() => ({ ...window.__audio }))

await p.goto(base + "/klient")
await p.waitForSelector("nav a:has-text('Kost')")
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  s.data.workouts.push({
    id: "w-v73", clientId: "c1", trainerId: null, byClient: true, date: new Date().toLocaleDateString("sv-SE"), name: "Timer-pass", status: "planned", logs: [],
    // Kort vila (2 s) så att vilosignalen hinner spelas i testet.
    exercises: [{ id: "a", exerciseId: "e-squat", sets: 2, reps: "5", restSec: 2 }],
  })
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/klient/pass/w-v73")
const ex = p.locator("#exercise-a")
await ex.locator("input[aria-label='Vikt set 1 (kg)']").waitFor()
await p.waitForTimeout(500)

// ------------------------------------------------ passtimern (v81: tyst) ---
const timerKey = "coavira:workout-timer:v1:w-v73"
const stored = () => p.evaluate((k) => JSON.parse(localStorage[k] ?? "null"), timerKey)
// v81: ingen klocka under passet – skärmen hålls lugn. Tiden mäts tyst i bakgrunden.
check((await p.locator("[data-testid=workout-timer]").count()) === 0, "v81: ingen tickande klocka under passet")
const started = await stored()
check(Number.isFinite(started?.startedAt) && !started.endedAt, "passets starttid sparas tyst när passet öppnas (localStorage)")
const fill = async (i) => {
  if (!(await ex.locator(`input[aria-label='Vikt set ${i} (kg)']`).inputValue())) await ex.locator(`input[aria-label='Vikt set ${i} (kg)']`).fill("60")
  if (!(await ex.locator(`input[aria-label='Reps set ${i} (reps)']`).inputValue())) await ex.locator(`input[aria-label='Reps set ${i} (reps)']`).fill("5")
}
await fill(1)
await ex.locator("button[aria-label='Bocka av set 1']").click()
await p.waitForTimeout(150)
check((await stored()).startedAt === started.startedAt, "seten påverkar inte passets starttid")
check((await audio()).contexts === 1, "ljudet låses upp i samma tryck (en delad ljudmotor)")

// Vilosignalen (2 s vila): tre toner med övertoner, nära full volym.
await p.waitForSelector("text=Vilan är slut", { timeout: 5000 })
await p.waitForTimeout(300)
const a1 = await audio()
check(a1.tones === 6, `vilosignalen: tre toner med övertoner (${a1.tones} oscillatorer)`)
check(a1.peak >= 0.9, `signalen är högre än förut (topp ${a1.peak}, förut 0,25)`)
check(a1.contexts === 1, "samma ljudmotor återanvänds (ingen ny utan tryck)")
await p.locator("button:has-text('Kör!')").click().catch(() => {})
await p.screenshot({ path: `${out}/v73-passtimer.png` })

// Tiden överlever att appen laddas om (eller läggs i bakgrunden) mitt i passet.
await p.reload()
await ex.locator("input[aria-label='Vikt set 1 (kg)']").waitFor()
check((await stored()).startedAt === started.startedAt, "starttiden finns kvar efter omladdning")
check((await p.locator("[data-testid=workout-timer]").count()) === 0, "fortfarande ingen klocka efter omladdning")

// --------------------------------------------- avsluta: tiden i sammanfattningen ---
await p.waitForTimeout(1200)
await fill(2)
await ex.locator("button[aria-label='Bocka av set 2']").click()
await p.locator("button:has-text('Hoppa över')").click().catch(() => {})
await p.locator("header button:has-text('Avsluta')").click()
await p.locator("button:has-text('Spara pass')").click()
await p.locator("[data-testid=workout-saved]").waitFor()
const duration = p.locator("[data-testid=summary-duration]")
check((await duration.count()) === 1 && /Passets tid\s*1 min/.test((await duration.innerText()).replace(/\s+/g, " ")), "summeringen visar passets tid som egen bricka (\"1 min\")", await duration.innerText().catch(() => ""))
await p.waitForTimeout(1400)
await p.screenshot({ path: `${out}/v73-sammanfattning.png` })
const ended = await stored()
check(Number.isFinite(ended.endedAt), "timern stannar när passet sparas")
const saved = await p.evaluate((k) => JSON.parse(localStorage[k]).data.workouts.find((w) => w.id === "w-v73"), KEY)
check(Number.isInteger(saved?.durationSec) && saved.durationSec >= 2 && saved.durationSec < 600, `passets längd sparas i historiken (duration ${saved?.durationSec} s)`)

// Ett avslutat pass visar ingen klocka heller.
const q = await ctx.newPage()
await q.goto(base + "/klient/pass/w-v73")
await q.waitForSelector("h1:has-text('Timer-pass')")
check((await q.locator("[data-testid=workout-timer]").count()) === 0, "avslutat pass: ingen klocka i passvyn")
await q.close()

await p.goto(base + "/klient")
await p.evaluate((k) => {
  const s = JSON.parse(localStorage[k])
  s.data.workouts.push({ id: "w-v73b", clientId: "c1", trainerId: null, byClient: true, date: new Date().toLocaleDateString("sv-SE"), name: "Ljud-pass", status: "planned", logs: [], exercises: [{ id: "b", exerciseId: "e-squat", sets: 1, reps: "5" }] })
  localStorage[k] = JSON.stringify(s)
}, KEY)
await p.goto(base + "/klient/pass/w-v73b")
await p.locator("button:has-text('Vila')").first().click()
const before = (await audio()).tones
await p.locator("[data-testid=test-rest-sound]").click()
await p.waitForTimeout(900)
check((await audio()).tones - before === 6, "\"Testa ljudet\" spelar signalen i vilo-inställningen")

check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
