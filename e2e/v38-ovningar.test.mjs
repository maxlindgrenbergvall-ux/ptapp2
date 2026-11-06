// E2E för v38 i demoläge (mobil 390 px): övningar i splits och pass.
//   1. Övningslistan är grupperad efter muskelgrupp (inte alfabetiskt), med snabbfilter och utfällbara grupper.
//   2. Byt övning i en split med ett tryck på namnet – set och reps ligger kvar.
//   3. Lägg till övning via muskelgrupp; drag-and-drop i splitten och i "Logga eget pass".
//   4. Samma lista i passets "Lägg till övning".
//   BASE_URL=http://localhost:3000 node e2e/v38-ovningar.test.mjs [skärmdumpsmapp]
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
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)
const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

async function drag(handle, target) {
  const a = await handle.boundingBox()
  const b = await target.boundingBox()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await p.mouse.down()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 10, { steps: 3 })
  await p.mouse.move(a.x + a.width / 2, b.y + b.height / 2 + 4, { steps: 12 })
  await p.waitForTimeout(150)
  await p.mouse.up()
  await p.waitForTimeout(250)
}

await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")

// ------------------------------------------------------------- splitten ---
await p.goto(base + "/klient/schema")
// v43: demoklienten har ett aktivt schema – byt för att komma till splitbiblioteket.
await p.waitForSelector("[data-testid=active-split], [data-testid=split-library]")
if (await p.locator("[data-testid=change-split]").isVisible()) await p.click("[data-testid=change-split]")
await p.click("[data-testid=split-ppl]")
await p.waitForSelector("[data-testid=split-editor]")
const push = p.locator("[data-testid=split-day]").first()
const names = () => push.locator("[data-testid=split-exercise] [data-testid=replace-exercise] span.truncate").allInnerTexts()
const before = await names()

// 1+2. Byt den första övningen: dialogen öppnar med dess muskelgrupp utfälld och övningen markerad.
const sets0 = await push.locator(`input[aria-label="Set för ${before[0]}"]`).inputValue()
const reps0 = await push.locator(`input[aria-label="Reps för ${before[0]}"]`).inputValue()
await push.locator("[data-testid=replace-exercise]").first().click()
const dialog = p.locator("[data-testid=exercise-picker-dialog]")
await dialog.waitFor()
check(await dialog.locator('[aria-current="true"]').isVisible(), `nuvarande övning (${before[0]}) är markerad i sin grupp`)
const groupHeaders = await dialog.locator("[data-group] h3").allInnerTexts()
const labels = groupHeaders.map((t) => t.split("\n")[0].trim())
check(labels[0] === "Bröst" && labels.includes("Biceps") && labels.includes("Triceps") && labels.includes("Mage") && labels.includes("Säte"), `grupperat efter muskelgrupp: ${labels.join(", ")}`)
check(labels.join(",") !== [...labels].sort((a, b) => a.localeCompare(b, "sv")).join(","), "inte alfabetiskt")
const chips = await dialog.locator("[data-testid=muscle-filter] button").allInnerTexts()
check(chips[0] === "Alla" && chips.includes("Rygg"), "snabbfilter per muskelgrupp")
await p.waitForTimeout(400) // öppningsanimationen
check(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth + 1), "väljaren ryms i skärmbredden (chipsen scrollar i sidled)")
await p.screenshot({ path: `${out}/v38-byt-ovning.png` })
// Filtrera på Bröst och välj en annan bröstövning.
await dialog.locator('[data-testid=muscle-filter] button:text-is("Bröst")').click()
check((await dialog.locator("[data-group]").count()) === 1, "filtret visar bara Bröst")
const choice = dialog.locator('[data-group=brost] li button:not([aria-current="true"])').first()
const choiceName = (await choice.locator("span.truncate").first().innerText()).trim()
await choice.click()
await dialog.waitFor({ state: "detached" })
const after = await names()
check(after[0] === choiceName && after.length === before.length, `bytt: ${before[0]} → ${choiceName}`)
check(
  (await push.locator(`input[aria-label="Set för ${choiceName}"]`).inputValue()) === sets0 && (await push.locator(`input[aria-label="Reps för ${choiceName}"]`).inputValue()) === reps0,
  `set och reps ligger kvar (${sets0} × ${reps0})`
)

// 3. Lägg till via muskelgrupp: fäll ut Triceps och välj.
await push.locator("[data-testid=split-add-exercise]").click()
await dialog.waitFor()
check((await dialog.locator("[data-group] ul").count()) === 0, "grupperna är infällda från början (överblick)")
await dialog.locator("[data-testid=group-triceps]").click()
check((await dialog.locator("[data-testid=group-triceps]").getAttribute("aria-expanded")) === "true", "Triceps fälls ut med ett tryck")
await dialog.locator('[data-group=triceps] li button:has-text("Skull Crusher")').click()
await dialog.waitFor({ state: "detached" })
check((await names()).at(-1) === "Skull Crusher", "Skull Crusher läggs sist i Push")

// Sökning: träffar i muskelgruppsordning med gruppen utskriven.
await push.locator("[data-testid=split-add-exercise]").click()
await dialog.locator('input[aria-label="Sök övning"]').fill("curl")
const hits = await dialog.locator('ul[aria-label="Övningar att lägga till"] li').allInnerTexts()
check(hits.length > 3 && hits.some((h) => /Biceps/.test(h)) && hits.some((h) => /Baksida lår/.test(h)), `sök "curl": ${hits.length} träffar, med muskelgrupp (Biceps, Baksida lår …)`)
await p.keyboard.press("Escape")
await dialog.waitFor({ state: "detached" })
await p.waitForSelector("[data-slot=dialog-overlay]", { state: "detached" })

// Drag-and-drop: Skull Crusher ett steg upp med fingret/musen …
const cur = await names()
const n = cur.length
await push.locator("[data-sortable-id]").nth(n - 1).scrollIntoViewIfNeeded()
await drag(push.locator("[data-testid=drag-handle]").nth(n - 1), push.locator("[data-sortable-id]").nth(n - 2))
const afterDrag = await names()
check(afterDrag[n - 2] === "Skull Crusher" && afterDrag[n - 1] === cur[n - 2], `drag-and-drop: övningen dras ett steg upp (${afterDrag.slice(-2).join(", ")})`)
// … och resten av vägen med handtagets pil upp (tangentbord/skärmläsare).
await push.locator("[data-testid=drag-handle]").nth(n - 2).focus()
for (let k = 0; k < n - 2; k++) {
  await p.keyboard.press("ArrowUp")
  await p.waitForTimeout(120)
}
check((await names())[0] === "Skull Crusher", "Skull Crusher ligger nu överst")
check(await noOverflow(), "splitten: ingen horisontell overflow")
await p.screenshot({ path: `${out}/v38-split.png`, fullPage: true })
const final = await names()
await p.click("[data-testid=split-create]")
await p.waitForURL(/\/klient$/)
const d = await demo()
const created = d.activeSplits.find((s) => s.clientId === "c1").days[0]
const createdNames = created.exercises.map((e) => d.exercises.find((x) => x.id === e.exerciseId)?.name)
check(createdNames.join("|") === final.join("|"), "schemat får exakt den ordning och de övningar som valts")

// --------------------------------------------------------- eget pass ---
await p.goto(base + "/klient")
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-name", "DnD v38")
await p.locator('[role=dialog] [data-testid=group-ben]').click()
await p.locator('[role=dialog] [data-group=ben] li button').first().click()
await p.locator('[role=dialog] [data-testid=group-rygg]').click()
await p.locator('[role=dialog] [data-group=rygg] li button').first().click()
const own = p.locator('ol[aria-label="Övningar i passet"]')
check((await own.locator("li").count()) === 2, "två övningar valda via muskelgrupper")
check((await p.locator('[role=dialog] [data-group=ben] li button').count()) > 0, "listan ligger kvar för fler val")
const ownNames = () => own.locator("li span.truncate").allInnerTexts()
const o1 = await ownNames()
await own.locator("[data-testid=drag-handle]").nth(1).focus()
await p.keyboard.press("ArrowUp")
await p.waitForTimeout(200)
check((await ownNames())[0] === o1[1], "eget pass: ordningen ändras med handtaget (pil upp)")
await p.click('[role=dialog] button:has-text("Starta passet")')
await p.waitForURL(/\/klient\/pass\//)

// ------------------------------------------- passets Lägg till övning ---
await p.click("[data-testid=add-exercise]")
const addDialog = p.getByRole("dialog", { name: "Lägg till övning" })
await addDialog.locator('[data-testid=muscle-filter] button:text-is("Mage")').click()
await addDialog.locator("[data-group=mage] li button").first().click()
await p.waitForTimeout(300)
const w = (await demo()).workouts.find((x) => x.name === "DnD v38")
check(w.exercises.length === 3, "passet: övning tillagd via muskelgruppen Mage")
check(await noOverflow(), "passet: ingen horisontell overflow")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
