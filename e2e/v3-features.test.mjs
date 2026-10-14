// E2E för v3 i demoläge: livsmedelssök (bas, märkesvaror), streckkodsskanning med
// kamera (falsk videoström med riktig EAN-13), saknad produkt → egen produkt,
// profilbild i sidomenyn, övningsnamn per klient och mjukare mörkt läge.
//
//   node e2e/mock-openfoodfacts.mjs &
//   node e2e/make-barcode-video.mjs 7310865004703 /tmp/barcode.y4m
//   OPENFOODFACTS_BASE_URL=http://localhost:54400 npm start
//   BASE_URL=http://localhost:3000 BARCODE_VIDEO=/tmp/barcode.y4m node e2e/v3-features.test.mjs
import { chromium } from "playwright"
import fs from "node:fs"
import path from "node:path"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const exe = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))
const errors = []

const browser = await chromium.launch({ ...exe, args: ["--use-fake-ui-for-media-stream"] })
async function page(viewport, scheme = "light", b = browser) {
  const ctx = await b.newContext({ viewport, colorScheme: scheme, permissions: ["camera"] })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
  return p
}

// --------------------------------------------------------- livsmedelssök ---
const m = await page({ width: 390, height: 844 })
await m.goto(`${base}/klient`)
await m.waitForSelector("text=Övrigt / extra")
const search = m.locator('input[aria-label="Sök livsmedel eller märkesvara"]')

await search.fill("kvarg")
await m.click('role=option >> text="Kvarg naturell"')
await m.waitForSelector('input[aria-label="Mängd i gram"]')
check((await m.inputValue('input[aria-label="Mängd i gram"]')) === "250", "bas: portion förifylld (250 g kvarg)")
await m.click('button:has-text("100 g")')
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=Kvarg naturell >> xpath=.. >> text=· 100 g")
ok("bas: kvarg 100 g loggad")

await search.fill("agg") // utan prickar ska hitta "Ägg"
check((await m.locator('role=option >> text="Ägg"').count()) === 1, "sök tål å/ä/ö-varianter (agg → Ägg)")

await search.fill("mellanmjölk")
await m.waitForSelector('role=group[name="Märkesvaror"] >> text=Arla', { timeout: 8000 })
await m.click('role=group[name="Märkesvaror"] >> role=option')
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=Mellanmjölk 1,5 % (Arla)")
ok("märkesvara från Open Food Facts (sök) loggad")

// Felaktig streckkod för hand
await m.click('button[aria-label="Skanna streckkod"]')
await m.fill("#manual-barcode", "7310865004704")
await m.click('role=dialog >> button:has-text("Sök")')
await m.waitForSelector("text=streckkoden är inte giltig")
ok("ogiltig kontrollsiffra avvisas")

// Saknad produkt → egen produkt
await m.fill("#manual-barcode", "7310000000010")
await m.click('role=dialog >> button:has-text("Sök")')
await m.waitForSelector("text=Produkten finns inte i databasen")
await m.fill('input[aria-label="Namn"]', "Mormors proteinbollar")
await m.fill("#cp-kcal", "410")
await m.fill("#cp-protein", "18")
await m.click('button:has-text("Spara produkt")')
await m.click('form >> button:has-text("Lägg till")')
await m.waitForSelector("text=Mormors proteinbollar >> xpath=.. >> text=· 100 g")
ok("saknad streckkod → egen produkt sparad och loggad")
await search.fill("mormor")
check((await m.locator('role=group[name="Mina produkter"] >> text=Mormors proteinbollar').count()) === 1, "egen produkt hittas under Mina produkter")
await search.fill("")
await search.focus()
check((await m.locator('role=group[name="Senaste"] >> role=option').count()) >= 3, "Senaste visar tidigare loggad mat")
await m.keyboard.press("Escape")
await m.screenshot({ path: `${out}/v3-klient-kost.png`, fullPage: true })

// ---------------------------------------------------- skanning med kamera ---
if (process.env.BARCODE_VIDEO) {
  const camBrowser = await chromium.launch({
    ...exe,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${process.env.BARCODE_VIDEO}`],
  })
  const c = await page({ width: 390, height: 844 }, "dark", camBrowser)
  await c.goto(`${base}/klient`)
  await c.waitForSelector("text=Övrigt / extra")
  await c.click('button[aria-label="Skanna streckkod"]')
  await c.waitForSelector('video[aria-label="Kamerabild"]')
  await c.waitForTimeout(400)
  await c.screenshot({ path: `${out}/v3-scanner.png` })
  await c.waitForSelector("text=EAN 7310865004703", { timeout: 15000 })
  ok("kamera: streckkod avläst (zxing) och produkt hämtad")
  await c.click('form >> button:has-text("Lägg till")')
  await c.waitForSelector("text=Mellanmjölk 1,5 % (Arla) >> xpath=.. >> text=· 250 g")
  ok("kamera: skannad produkt loggad med portion (250 g)")
  await camBrowser.close()
} else {
  console.log("hoppar över kameratestet (BARCODE_VIDEO saknas)")
}

// ------------------------------------------------- profilbild i sidomenyn ---
const d = await page({ width: 1440, height: 900 }, "dark")
const png = path.join(out, "avatar.png")
fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"))
await d.goto(`${base}/pt`)
await d.waitForSelector("aside >> text=Elin Söderberg")
check((await d.locator("aside >> text=ES").count()) >= 1, "sidomenyn: initialer som reserv utan bild")
await d.goto(`${base}/pt/profil`)
await d.setInputFiles("input[type=file]", png)
await d.waitForFunction(() => document.querySelector("img[src^='data:image']"))
await d.click('button:has-text("Spara")')
await d.waitForSelector('aside >> img[alt="Profilbild för Elin Söderberg"]')
ok("sidomenyn: profilbilden visas på profilkortet efter uppladdning")
await d.screenshot({ path: `${out}/v3-pt-dark.png` })

// ---------------------------------------------- övningsnamn per klient ---
await d.goto(`${base}/pt/klienter/c1`)
await d.click('role=tab[name="Pass"]')
await d.waitForSelector("text=Övningsnamn för klienten")
check((await d.locator("text=Biblioteket: Bulgarisk utfallsböj").count()) === 1, "demo: befintligt alias visas med bibliotekets namn")
await d.click('button[aria-label="Döp om Knäböj (skivstång)"]')
await d.fill('input[aria-label="Nytt namn för Knäböj (skivstång)"]', "Pausknäböj (1 s i botten)")
await d.click('li >> button:has-text("Spara")')
await d.waitForSelector("text=Klienten ser nu")
ok("PT döpte om knäböj för Sara")
await d.screenshot({ path: `${out}/v3-pt-alias.png`, fullPage: true })

// Samma webbläsarprofil = samma demodata: klientens vy ska visa PT:ns namn.
await d.goto(`${base}/klient`)
await d.waitForSelector("text=Dagens träning")
check((await d.locator("text=/Pausknäböj \\(1 s i botten\\)/").count()) >= 1, "klientens dagsvy visar PT:ns namn")
await d.click("text=Starta passet")
await d.waitForSelector("text=Pausknäböj (1 s i botten)")
ok("träningsloggen visar PT:ns namn")
await d.goto(`${base}/klient/framsteg/ovning/e-squat`)
await d.waitForSelector("h1 >> text=Pausknäböj (1 s i botten)")
ok("historiksidan visar PT:ns namn")

// ------------------------------------------------------ övningsbibliotek ---
await d.goto(`${base}/pt/pass`)
await d.waitForSelector("text=Övningsbank >> visible=true")
await d.fill('input[aria-label="Sök övning"] >> visible=true', "marklyft")
const hits = await d.locator("aside, div").locator('button:has-text("marklyft"), button:has-text("Marklyft")').filter({ visible: true }).count()
check(hits >= 4, `övningsbiblioteket: ${hits} marklyftsvarianter`)

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
