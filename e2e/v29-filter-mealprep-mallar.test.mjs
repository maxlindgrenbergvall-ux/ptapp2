// E2E för v29 i demoläge: bildfiltret (servern granskar bilder innan de sparas),
// kostsökningen stängs vid tryck utanför, Mealprep-kategorin och passmallar
// (spara som mall, läs in mall, ny från mall).
//   npm run build && MODERATION_TEST_BLOCK_COLOR=ff00ff npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v29-filter-mealprep-mallar.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"
import sharp from "sharp"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))

// Testbilder: en vanlig bild (brus i olika färger) och en enfärgad magenta som
// servern behandlar som olämplig när MODERATION_TEST_BLOCK_COLOR=ff00ff.
const noise = Buffer.alloc(96 * 96 * 3)
for (let i = 0; i < noise.length; i++) noise[i] = (i * 73 + (i >> 5) * 31) % 256
const normalPng = await sharp(noise, { raw: { width: 96, height: 96, channels: 3 } }).png().toBuffer()
const blockedPng = await sharp({ create: { width: 96, height: 96, channels: 3, background: "#ff00ff" } }).png().toBuffer()

// ------------------------------------------------- 1. bildfiltret (API) ---
const post = async (buf, bucket = "avatars", type = "image/png") => {
  const form = new FormData()
  form.set("file", new Blob([buf], { type }), "bild")
  form.set("bucket", bucket)
  const res = await fetch(`${base}/api/uploads/image`, { method: "POST", body: form })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
const t0 = Date.now()
const good = await post(normalPng)
check(good.status === 200 && good.body.ok === true, `en vanlig bild godkänns av filtret (${good.status}, ${Date.now() - t0} ms inkl. modellstart)`)
const bad = await post(blockedPng)
check(bad.status === 422 && bad.body.reason === "moderation" && /innehållsfilter/.test(bad.body.error), `en olämplig bild stoppas (${bad.status})`)
const fake = await post(Buffer.from("<svg onload=alert(1)>"), "avatars", "image/png")
check(fake.status === 415, `en fil som bara låtsas vara en bild stoppas (${fake.status})`)
const wrongBucket = await post(normalPng, "recipe-images")
check(wrongBucket.status === 400, "bara profilbilder och chattbilder går via filtret")

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)

// ----------------------------------------- 2. bildfiltret i profilen (UI) ---
await p.goto(base + "/klient/profil")
await p.waitForSelector("text=Personuppgifter")
await p.setInputFiles("input[type=file]", { name: "olamplig.png", mimeType: "image/png", buffer: blockedPng })
await p.waitForSelector("text=innehållsfilter")
check((await p.locator("img[src^='data:image']").count()) === 0, "den stoppade bilden används inte som profilbild")
await p.screenshot({ path: `${out}/v29-bildfilter-stopp.png` })
await p.setInputFiles("input[type=file]", { name: "ok.png", mimeType: "image/png", buffer: normalPng })
await p.waitForFunction(() => document.querySelector("img[src^='data:image']"))
ok("en godkänd bild blir profilbild")

// ----------------------------------- 3. kostsökningen stängs vid klick utanför ---
await p.goto(base + "/klient")
const search = p.locator('[aria-label="Sök livsmedel eller märkesvara"]').first()
await search.scrollIntoViewIfNeeded()
await search.click()
await p.waitForSelector("#food-picker-results")
// Ett tryck inne i panelen (populärt varumärke) håller den öppen.
await p.locator("#food-picker-results button").first().click()
check(await p.locator("#food-picker-results").isVisible(), "tryck i resultatpanelen håller den öppen")
await p.screenshot({ path: `${out}/v29-kost-oppen.png` })
// Tryck utanför (rubriken längst upp) stänger den – ingen "Stäng" behövs.
await p.mouse.click(20, 120)
await p.waitForSelector("#food-picker-results", { state: "detached", timeout: 3000 }).then(
  () => ok("tryck utanför stänger kostsökningen"),
  () => fail("tryck utanför stänger kostsökningen")
)
await search.click()
await p.waitForSelector("#food-picker-results")
await p.keyboard.press("Escape")
check((await p.locator("#food-picker-results").count()) === 0, "Escape stänger också")

// ---------------------------------------------------------- 4. Mealprep ---
await p.goto(base + "/klient/recept")
await p.waitForSelector("[data-testid=recipe-card]")
const tab = p.locator('[role=tablist][aria-label=Träningsmål] [role=tab]:has-text("Mealprep")')
check((await tab.count()) === 1, "Mealprep finns bland kategori-chipsen")
await tab.click()
await p.waitForTimeout(300)
const cards = p.locator("[data-testid=recipe-card]")
const n = await cards.count()
check(n >= 8, `${n} mealprep-recept`)
const names = await cards.allInnerTexts()
check(names.some((t) => t.includes("Falafellådor")) && names.some((t) => t.includes("Kycklingbowl")), "nya matlådor och storkok (kyckling/ris) i kategorin")
const srcs = await p.locator("[data-testid=recipe-card] img").evaluateAll((els) => els.map((e) => e.getAttribute("src")))
check(srcs.filter((s) => s?.startsWith("https://images.pexels.com/photos/")).length >= n - 1, "mealprep-recepten har Pexels-foton (alla utom chilin)")
await p.screenshot({ path: `${out}/v29-mealprep.png` })
await cards.filter({ hasText: "Falafellådor" }).first().click()
await p.waitForSelector("[data-testid=recipe-detail]")
const detail = await p.locator("[data-testid=recipe-detail]").innerText()
check(/Mealprep/.test(detail) && /4 portioner/.test(detail) && /kylen/.test(detail), "receptet visar kategori, portioner och hur länge lådorna håller")
check((await p.locator("[data-testid=recipe-detail] img").getAttribute("src"))?.includes("1640771"), "falafellådorna har sitt foto (Pexels 1640771)")
await p.screenshot({ path: `${out}/v29-mealprep-recept.png` })
await p.keyboard.press("Escape")

// -------------------------------------- 5. klienten: spara och läs in mall ---
await p.goto(base + "/klient")
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-name", "Benpass A")
await p.fill("#own-search", "knäböj")
await p.locator('ul[aria-label="Övningar att välja"] button').first().click()
await p.fill("#own-search", "utfall")
await p.locator('ul[aria-label="Övningar att välja"] button').first().click()
await p.click("[role=dialog] [data-testid=save-as-template]")
await p.waitForSelector("#template-name")
check((await p.inputValue("#template-name")) === "Benpass A", "mallen får passets namn som förslag")
await p.fill("#template-name", "Mina ben")
await p.screenshot({ path: `${out}/v29-spara-mall.png` })
await p.click("[data-testid=save-template-confirm]")
await p.waitForSelector("text=Sparad som mall")
check(await p.locator("#own-name").isVisible(), "eget pass-dialogen är kvar (passet startas inte av misstag)")
let d = await demo()
const mine = d.templates.filter((t) => t.trainerId === "c1")
check(mine.length === 1 && mine[0].name === "Mina ben" && mine[0].exercises.length === 2, "klientens mall sparas med två övningar")
// Stäng och öppna igen: mallen läses in med ett tryck.
await p.waitForSelector("#template-name", { state: "detached" })
await p.click('[role=dialog] button:has-text("Avbryt")')
await p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })
await p.click('button:has-text("Logga eget pass")')
await p.waitForSelector("[data-testid=template-picker]")
await p.click('[data-testid=template-picker] button:has-text("Mina ben")')
check((await p.locator('ol[aria-label="Övningar i passet"] li').count()) === 2 && (await p.inputValue("#own-name")) === "Mina ben", "mallen läses in i ett nytt pass")
await p.screenshot({ path: `${out}/v29-anvand-mall.png` })
await p.click('[role=dialog] button:has-text("Starta passet")')
await p.waitForURL(/\/klient\/pass\//)
// Logga ett set med en ny vikt och spara det genomförda passet som mall.
await p.click('button[aria-label="Bocka av set 1"] >> nth=0')
await p.click("[data-testid=save-as-template]")
await p.fill("#template-name", "Mina ben")
await p.waitForSelector("[data-testid=template-exists]")
check((await p.locator("[data-testid=save-template-confirm]").innerText()).includes("Ersätt"), "samma namn erbjuder att ersätta mallen")
await p.click("[data-testid=save-template-confirm]")
await p.waitForSelector("text=Mallen är uppdaterad")
d = await demo()
check(d.templates.filter((t) => t.trainerId === "c1").length === 1, "mallen ersattes (ingen dubblett)")

// ---------------------------------------- 6. PT: ny från mall, spara som mall ---
await p.goto(base + "/pt/pass")
await p.waitForSelector("h1:has-text('Passbyggare')")
const before = (await demo()).templates.filter((t) => t.trainerId === "t1").length
await p.click("[data-testid=new-workout-menu]")
await p.waitForSelector("[role=menu]")
await p.screenshot({ path: `${out}/v29-pt-ny-fran-mall.png` })
await p.locator("[role=menuitem]").nth(2).click() // 0 = Tomt pass, 1 = Från split (v32)
const draftName = await p.inputValue('[aria-label="Passets namn"]')
check(draftName.endsWith("(ny)"), `nytt pass från mall: "${draftName}"`)
check((await p.locator("text=Ej sparad").count()) >= 1, "utkastet är inte sparat förrän PT:n sparar")
await p.click("[data-testid=save-as-template]")
await p.fill("#template-name", "Helkropp nybörjare")
await p.click("[data-testid=save-template-confirm]")
await p.waitForSelector("text=Sparad som mall")
d = await demo()
const ptTemplates = d.templates.filter((t) => t.trainerId === "t1")
check(ptTemplates.length === before + 1 && ptTemplates.some((t) => t.name === "Helkropp nybörjare" && t.exercises.length > 0), "PT:ns nya mall sparas")
check(await p.locator('nav[aria-label=Passmallar] button:has-text("Helkropp nybörjare")').isVisible(), "den nya mallen syns i listan")
check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "passbyggaren: ingen horisontell overflow på mobilen")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
