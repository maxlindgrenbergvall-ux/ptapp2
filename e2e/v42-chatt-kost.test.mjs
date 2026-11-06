// E2E för v42 i demoläge (mobil 390 px, touch):
//   1. Inkorgen: olästa överst, ett tryck öppnar konversationen, läs och svara.
//   2. Kost-sidan: egen flik, snabbloggning (måltid, ett-tryck-snabbval, sök i flödet).
//   3. Sidledssvep låst: ingen horisontell scroll, CSS-låset på plats.
//   BASE_URL=http://localhost:3000 node e2e/v42-chatt-kost.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

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

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const patchDemo = (fn) => p.evaluate((src) => {
  const s = JSON.parse(localStorage["coavira:demo:v5"])
  s.data = new Function("d", `return (${src})(d)`)(s.data)
  localStorage["coavira:demo:v5"] = JSON.stringify(s)
}, fn.toString())
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
// Två olästa från PT:n (t1) till klienten (c1).
await patchDemo((d) => {
  const now = Date.now()
  return {
    ...d,
    messages: [
      ...d.messages.map((m) => ({ ...m, readAt: m.readAt ?? new Date(now - 7200000).toISOString() })),
      { id: "v42-a", threadId: "c1", trainerId: "t1", senderId: "t1", body: "Hur kändes benpasset?", sentAt: new Date(now - 120000).toISOString() },
      { id: "v42-b", threadId: "c1", trainerId: "t1", senderId: "t1", body: "Glöm inte att logga vikten 💪", sentAt: new Date(now - 60000).toISOString() },
    ],
  }
})
await p.reload()
await p.waitForSelector("text=Dagens träning")

// ------------------------------------------------------- 1. inkorgen ---
check(/2 olästa/.test(await p.getAttribute("header [data-testid=header-chat]", "aria-label")), "sidhuvudet: 2 olästa")
await p.click("header [data-testid=header-chat]")
await p.waitForURL(/\/klient\/chatt$/)
await p.waitForSelector("[data-testid=chat-inbox]")
const first = p.locator("[data-testid=inbox-row]").first()
check((await first.getAttribute("data-unread")) === "2", "olästa konversationen ligger överst med 2 olästa")
check((await first.locator("[data-testid=inbox-unread]").innerText()) === "2", "brickan visar antalet")
check(/logga vikten/.test(await first.locator("[data-testid=inbox-preview]").innerText()), "förhandsvisning av senaste meddelandet")
await p.click("button[aria-pressed]:has-text('Olästa')")
check((await p.locator("[data-testid=inbox-row]").count()) === 1, "filtret Olästa visar bara olästa konversationer")
check(await noOverflow(), "inkorgen: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v42-inkorg.png` })

await p.locator("[data-testid=inbox-row]").first().click()
await p.waitForURL(/\/klient\/chatt\/t1$/)
await p.waitForSelector("[data-testid=conversation] >> text=Hur kändes benpasset?")
check((await p.locator("nav[aria-label=Huvudmeny]:visible").count()) === 0 && (await p.locator("header [data-testid=header-chat]:visible").count()) === 0, "ren chattvy i helskärm (inget sidhuvud eller bottenmeny)")
await p.waitForFunction(() => {
  const s = JSON.parse(localStorage["coavira:demo:v5"]).data
  return s.messages.filter((m) => m.threadId === "c1" && m.trainerId === "t1" && m.senderId !== "c1" && !m.readAt).length === 0
})
ok("meddelandena markeras som lästa när konversationen öppnas")
const box = await p.locator("textarea[aria-label=Meddelande]").boundingBox()
check(box && box.y + box.height <= 844 && box.y > 600, "skrivfältet ligger längst ned på skärmen")
await p.fill("textarea[aria-label=Meddelande]", "Det gick bra, tack!")
await p.click("button[aria-label=Skicka]")
await p.waitForSelector("[data-testid=conversation] >> text=Det gick bra, tack!")
check((await demo()).messages.some((m) => m.body === "Det gick bra, tack!" && m.trainerId === "t1" && m.senderId === "c1"), "svaret sparas i tråden med PT:n")
check(await noOverflow(), "konversationen: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v42-konversation.png` })
await p.click("[aria-label='Tillbaka till inkorgen']")
await p.waitForURL(/\/klient\/chatt$/)
// Filtret Olästa ligger kvar (inkorgen minns läget) – konversationen är nu läst.
await p.waitForSelector("[data-testid=chat-inbox] >> text=Inga olästa meddelanden.")
ok("filtret Olästa: tomt när allt är läst")
await p.click("button[aria-pressed]:has-text('Alla')")
await p.waitForSelector("[data-testid=chat-inbox] >> text=Du: Det gick bra, tack!")
check((await p.locator("[data-testid=inbox-row][data-unread]:visible").count()) === 0, "inga olästa kvar efter läsningen")
check(!/olästa/.test(await p.getAttribute("header [data-testid=header-chat]", "aria-label")), "brickan i sidhuvudet försvinner")

// PT:n ser klientens svar som oläst och kan svara.
const pt = await browser.newPage({ viewport: { width: 390, height: 844 } })
pt.on("pageerror", (e) => errors.push(`${pt.url()} pageerror: ${e.message}`))
await pt.goto(base + "/pt")
await pt.evaluate((s) => (localStorage["coavira:demo:v5"] = s), await p.evaluate(() => localStorage["coavira:demo:v5"]))
await pt.goto(base + "/pt/meddelanden")
await pt.waitForSelector("[data-testid=chat-inbox]")
const ptRow = pt.locator("[data-testid=inbox-row]").first()
check(/Sara Lindqvist/.test(await ptRow.innerText()) && (await ptRow.getAttribute("data-unread")) === "1", "PT: klientens svar är oläst och överst")
await ptRow.click()
await pt.waitForURL(/\/pt\/meddelanden\/c1$/)
await pt.waitForSelector("[data-testid=conversation] >> text=Det gick bra, tack!")
await pt.fill("textarea[aria-label=Meddelande]", "Toppen!")
await pt.click("button[aria-label=Skicka]")
await pt.waitForSelector("[data-testid=conversation] >> text=Toppen!")
check(await pt.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "PT-konversationen: ingen horisontell overflow")
await pt.screenshot({ path: `${out}/v42-pt-konversation.png` })
await pt.goto(base + "/pt")
await pt.click("[data-testid=pt-unread-tile]")
await pt.waitForURL(/\/pt\/meddelanden$/)
ok("PT: Olästa meddelanden på översikten leder till inkorgen")
await pt.close()

// ------------------------------------------------------ 2. kost-sidan ---
await p.goto(base + "/klient")
await p.waitForSelector("[data-testid=nutrition-shortcut]")
check((await p.locator("[data-testid=daily-nutrition]").count()) === 0, "Idag: ingen stor kostruta, bara genvägen")
await p.click("nav[aria-label=Huvudmeny] a:has-text('Kost')")
await p.waitForURL(/\/klient\/kost$/)
await p.waitForSelector("[data-testid=quick-log]")
check((await p.getAttribute("nav[aria-label=Huvudmeny] a:has-text('Kost')", "aria-current")) === "page", "Kost är en egen flik i bottenmenyn")
check((await p.locator("[data-testid=meal-chips] [aria-checked=true]").count()) === 1, "en måltid är förvald efter klockslaget")
await p.click("[data-testid=meal-chips] [role=radio]:has-text('Lunch')")

// Sök: träffarna visas i sidans flöde (ingen svävande meny).
await p.fill('input[aria-label="Sök livsmedel eller märkesvara"]', "banan")
await p.waitForSelector("#food-picker-results[data-inline] [role=option]")
check(await p.evaluate(() => getComputedStyle(document.querySelector("#food-picker-results")).position) === "static", "sökträffarna ligger i flödet, inte i en dropdown")
await p.locator("#food-picker-results [role=option]").first().click()
await p.click("button:has-text('Lägg till')")
await p.waitForSelector("[data-testid=food-log] >> text=Lunch")
const today = new Date().toLocaleDateString("sv-SE")
const banana = (await demo()).foodEntries.find((e) => e.clientId === "c1" && e.date === today && /banan/i.test(e.name))
check(banana?.meal === "lunch", "posten sparas på vald måltid (lunch)")

// Snabbval: ett tryck loggar samma mängd igen.
await p.waitForSelector("[data-testid=quick-recent] [data-testid=quick-add]")
const before = (await demo()).foodEntries.length
await p.click("[data-testid=meal-chips] [role=radio]:has-text('Mellanmål')")
await p.locator("[data-testid=quick-add]").first().click()
await p.waitForFunction((n) => JSON.parse(localStorage["coavira:demo:v5"]).data.foodEntries.length === n + 1, before)
const added = (await demo()).foodEntries.at(-1)
check(added.meal === "snack" && added.grams > 0, `snabbval: ett tryck, samma mängd (${added.grams} ${added.unit ?? "g"}) till mellanmål`)
// Ångra i toasten.
await p.click("[data-sonner-toast] button:has-text('Ångra')")
await p.waitForFunction((n) => JSON.parse(localStorage["coavira:demo:v5"]).data.foodEntries.length === n, before)
ok("Ångra tar bort posten igen")

// Bara kalorier.
await p.click("[data-testid=quick-kcal]")
await p.fill('input[aria-label="Namn"]', "Kanelbulle")
await p.fill('input[aria-label="kcal"]', "320")
await p.click("form button[type=submit]")
await p.waitForSelector("[data-testid=food-log] >> text=Kanelbulle")
check((await demo()).foodEntries.some((e) => e.name === "Kanelbulle" && e.kcal === 320 && e.meal === "snack"), "bara kalorier: sparas direkt")
check(await noOverflow(), "Kost-sidan: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v42-kost.png`, fullPage: true })

// Recept ligger under samma flik.
await p.click("[data-testid=kost-tabs] a:has-text('Recept')")
await p.waitForURL(/\/klient\/recept$/)
check((await p.getAttribute("nav[aria-label=Huvudmeny] a:has-text('Kost')", "aria-current")) === "page", "Recept: Kost-fliken är fortfarande aktiv")

// --------------------------------------------- 3. sidledssvep låst ---
const css = await p.evaluate(() => {
  const h = getComputedStyle(document.documentElement)
  const b = getComputedStyle(document.body)
  return { hx: h.overflowX, ho: h.overscrollBehaviorX, bx: b.overflowX, bo: b.overscrollBehaviorX, ta: b.touchAction }
})
check(css.hx === "hidden" && css.bx === "clip", `overflow-x låst (html ${css.hx}, body ${css.bx})`)
check(css.ho === "none" && css.bo === "none", "ingen sidledsstuds/bakåtsvep (overscroll-behavior-x: none)")
check(/pan-y/.test(css.ta) && !/pan-x/.test(css.ta), `touch-action: ${css.ta}`)
// Även om något blir för brett kan sidan inte dras i sidled.
for (const path of ["/klient", "/klient/kost", "/klient/chatt", "/klient/chatt/t1", "/klient/framsteg"]) {
  await p.goto(base + path)
  await p.waitForTimeout(500)
  await p.evaluate(() => {
    const wide = document.createElement("div")
    wide.id = "too-wide"
    wide.style.width = "1200px"
    wide.style.height = "10px"
    document.querySelector("main")?.appendChild(wide)
    window.scrollTo(600, window.scrollY)
  })
  const x = await p.evaluate(() => [window.scrollX, document.documentElement.scrollLeft, document.body.scrollLeft])
  check(x.every((v) => v === 0), `${path}: sidan går inte att scrolla i sidled (${x})`)
  await p.evaluate(() => document.getElementById("too-wide")?.remove())
}
// Horisontella chip-rader går fortfarande att svepa (egen scrollbehållare).
await p.goto(base + "/klient/recept")
await p.waitForTimeout(400)
const chips = await p.evaluate(() => {
  const row = [...document.querySelectorAll("main *")].find((e) => e.scrollWidth > e.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(e).overflowX))
  return row ? getComputedStyle(row).touchAction : "ingen"
})
check(chips === "ingen" || !/pan-y/.test(chips) || chips === "auto", `chip-rader behåller egen sidledsscroll (${chips})`)

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
