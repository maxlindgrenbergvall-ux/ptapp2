// E2E för v2 i demoläge: vatten, sömn, extra mat, övningshistorik, PT-profil
// (profilbild, coaching-typ, certifiering), kostbyggaren, övningsvideo,
// chattbilagor och videosamtal (Chromiums falska kamera/mikrofon).
//   BASE_URL=http://localhost:3000 node e2e/v2-features.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))

// 1x1 PNG för uppladdningar
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
const pngFile = path.join(out, "test.png")
fs.writeFileSync(pngFile, png)
const pdfFile = path.join(out, "kostschema.pdf")
fs.writeFileSync(pdfFile, "%PDF-1.4\n%test\n")

async function page(viewport, scheme = "light") {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, permissions: ["camera", "microphone"] })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
  p.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
  return p
}

// ---------------------------------------------------------------- klient ---
const m = await page({ width: 390, height: 844 })
await m.goto(`${base}/klient`)
await m.waitForSelector("text=Dagens kost")

// Vatten
const liters = async () => (await m.locator("#water-title").locator("xpath=../..").locator(".text-2xl").innerText()).trim()
const before = await liters()
await m.click('button[aria-label="Lägg till ett glas, 250 ml"]')
await m.click('button[aria-label="Lägg till en flaska, 500 ml"]')
check((await liters()) === "0,75 l" && before === "0,0 l", `vatten: +250 +500 ml → ${await liters()}`)
await m.click('button[aria-label="Ta bort ett glas"]')
check((await liters()) === "0,5 l", "vatten: ångra ett glas")

// Sömn (i natt finns redan demo-data från "klockan"; ändra till manuellt)
await m.click('#sleep-title >> xpath=../../.. >> button[aria-label="Ändra"]')
await m.click('button[aria-label="Öka en halvtimme"]')
await m.click('role=radio[name="Bra"]')
await m.click("text=Spara sömn")
await m.waitForSelector("text=Känsla")
ok("sömn: ändrad och sparad med känsla")

// Extra mat via snabbsök
const kcalBefore = await m.locator("text=/^\\d+$/").first().innerText()
await m.fill('input[aria-label="Sök livsmedel eller märkesvara"]', "banan")
await m.click('role=option >> text="Banan"')
await m.fill('input[aria-label="Mängd i gram"]', "120")
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=Banan >> xpath=.. >> text=· 120 g")
ok("extra mat: banan 120 g loggad via snabbsök")
await m.click("text=Egen rad (bara kcal)")
await m.fill('input[aria-label="Namn"]', "Kanelbulle")
await m.fill('input[aria-label="kcal"]', "320")
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=Kanelbulle")
ok("extra mat: egen rad med kcal")
await m.screenshot({ path: `${out}/v2-klient-idag.png`, fullPage: true })
void kcalBefore

// Övningshistorik
await m.goto(`${base}/klient/framsteg`)
await m.click("a:has-text('Knäböj')")
await m.waitForURL(/\/klient\/framsteg\/ovning\/e-squat/)
await m.waitForSelector("text=Alla tillfällen")
const sessions = await m.locator("ol[aria-label=Set]").count()
check(sessions >= 5, `historik: ${sessions} tillfällen med set för knäböj`)
await m.waitForTimeout(1500)
await m.screenshot({ path: `${out}/v2-ovningshistorik.png`, fullPage: true })
await m.locator("ol > li > a").first().click()
await m.waitForURL(/\/klient\/pass\//)
await m.waitForSelector("text=Passet är genomfört")
ok("historik: tryck på tillfälle öppnar passets logg")

// Wearables (demo) – v12: under Anslutningar i logomenyn
await m.goto(`${base}/klient/anslutningar`)
await m.locator("#wearables-title >> xpath=../../.. >> button:has-text('Anslut')").first().click()
await m.waitForSelector("text=Senast synkad")
ok("wearables: Fitbit (demo) ansluten och synkad")
await m.screenshot({ path: `${out}/v2-framsteg.png`, fullPage: true })

// Chattbilagor + videosamtal
await m.goto(`${base}/klient/chatt`)
await m.setInputFiles('input[type=file]', [pngFile, pdfFile])
await m.waitForSelector("text=kostschema.pdf")
await m.fill('textarea[aria-label="Meddelande"]', "Här är bild och schema")
await m.click('button[aria-label="Skicka"]')
await m.waitForSelector("img[alt='test.png']")
await m.waitForSelector("a:has-text('kostschema.pdf')")
ok("chatt: bild och PDF skickade och visas")
await m.screenshot({ path: `${out}/v2-chatt.png` })

await m.click('button[aria-label^="Videosamtal med"]')
await m.waitForSelector("text=Ringer…")
ok("samtal: ringer")
// Demomotparten svarar efter ~2 s; då visas samtalstimern och demo-notisen.
await m.waitForSelector("text=Demoläge: ingen riktig motpart", { timeout: 8000 })
const hasLocalVideo = await m.evaluate(() => [...document.querySelectorAll("video")].some((v) => v.srcObject && v.srcObject.getVideoTracks().length > 0))
check(hasLocalVideo, "samtal: ansluten, egen kamera visas")
await m.screenshot({ path: `${out}/v2-samtal.png` })
await m.click('button[aria-label="Stäng av mikrofonen"]')
check(await m.locator('button[aria-label="Slå på mikrofonen"]').count() === 1, "samtal: mikrofon av/på")
await m.click('button[aria-label="Lägg på"]')
// v12: samtalet visas som en bricka i chatten (med längd och "Ring upp").
await m.waitForSelector('[data-testid=call-card]:has-text("Videosamtal"):has-text("min")')
check((await m.locator('[data-testid=call-card] button[aria-label^="Ring upp"]').count()) >= 1, "samtal: brickan har Ring upp")
ok("samtal: lagt på, samtalet loggas i chatten")

// ------------------------------------------------------------------- PT ---
const d = await page({ width: 1440, height: 900 }, "dark")
await d.goto(`${base}/pt/profil`)
await d.waitForSelector("text=Coaching-typ")
await d.click('role=radio[name=/Distanscoaching/]')
await d.setInputFiles('input[type=file]', pngFile)
await d.waitForFunction(() => document.querySelector("img[src^='data:image']"))
// v11: certifikat läggs inte till av PT:n själv – de verifieras manuellt av Coavira.
check((await d.locator("#cert").count()) === 0, "PT-profil: PT kan inte lägga till certifikat själv")
check(
  (await d.locator("[data-testid=cert-info]").innerText()).includes(
    "Alla certifikat, licenser och intyg måste skickas in till oss för manuell verifiering via certifiering@coavira.com innan de godkänns på din profil."
  ),
  "PT-profil: informationstexten om manuell verifiering visas"
)
await d.click('button:has-text("Spara")')
await d.waitForSelector("text=Profilen är sparad")
ok("PT-profil: profilbild och coaching-typ sparade")
await d.screenshot({ path: `${out}/v2-pt-profil.png`, fullPage: true })

await d.goto(`${base}/pt/kost`)
await d.waitForSelector("text=Dagssumma")
await d.locator('input[placeholder^="Lägg till livsmedel"]').first().fill("ägg")
await d.keyboard.press("Enter")
await d.waitForSelector("text=Osparat")
ok("kostbyggare: livsmedel tillagt via snabbsök")
await d.screenshot({ path: `${out}/v2-pt-kost.png`, fullPage: true })

await d.goto(`${base}/pt/pass`)
await d.waitForSelector("text=Övningsbank >> visible=true")
await d.locator('button:has-text("Video/notis")').first().click()
await d.fill('input[aria-label="Videolänk"]', "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
await d.click('form >> button:has-text("Lägg till")')
await d.waitForSelector("iframe[src*='youtube-nocookie.com/embed/dQw4w9WgXcQ']")
ok("passbyggare: YouTube-video inbäddad på övningen")
await d.screenshot({ path: `${out}/v2-pt-pass.png`, fullPage: true })

const l = await page({ width: 1440, height: 900 })
await l.goto(`${base}/pt/klienter/c1`)
await l.waitForSelector("text=Vatten, snitt/dag")
ok("PT ser klientens vanor (vatten, sömn, extra mat)")
await l.waitForTimeout(1500)
await l.screenshot({ path: `${out}/v2-pt-klient.png`, fullPage: true })

// Regression: data sparad av en äldre version (v1) i webbläsaren får inte krascha appen.
const old = await page({ width: 390, height: 844 })
await old.goto(`${base}/klient`)
await old.waitForSelector("text=Dagens kost")
await old.evaluate(() => {
  const s = JSON.parse(localStorage["coavira:demo:v3"])
  for (const k of ["foodEntries", "waterLogs", "sleepLogs", "wearables"]) delete s.data[k]
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fältet ska bort, som i v1-data
  s.data.trainers = s.data.trainers.map(({ coachingMode, certifications, ...t }) => ({ ...t, offersRemote: coachingMode !== "onsite" }))
  localStorage["coavira:demo:v3"] = JSON.stringify(s)
})
for (const path of ["/klient", "/klient/framsteg", "/klient/chatt", "/pt/klienter/c1", "/pt/profil"]) {
  await old.goto(`${base}${path}`)
  await old.waitForTimeout(800)
  check(!(await old.innerText("body")).includes("couldn’t load"), `gammal sparad data: ${path} laddar`)
}

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
