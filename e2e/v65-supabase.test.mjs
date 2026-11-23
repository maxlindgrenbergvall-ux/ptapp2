// E2E för v65 i Supabase-läge mot e2e/mock-supabase.mjs: en befintlig användare
// som godkände en äldre version av avtalet godkänner communityreglerna i en
// dialog som inte går att stänga, och dialogen försvinner sedan.
//   (start som e2e/supabase-mode.test.mjs)
//   BASE_URL=http://localhost:3000 node e2e/v65-supabase.test.mjs
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))

await fetch(`${mock}/__reset`)
await fetch(`${mock}/__agreement_outdated?email=sara@test.se`)
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await p.goto(base + "/logga-in")
await p.fill("#email", "sara@test.se")
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForURL(/\/klient/)
const dialog = p.locator("[data-testid=agreement-update]")
await dialog.waitFor({ timeout: 10000 })
check(/Vi har uppdaterat användaravtalet/.test(await dialog.innerText()) && /communityreglerna/.test(await dialog.innerText()), "befintlig användare ser det uppdaterade avtalet (communityreglerna)")
check((await dialog.locator("a[href='/communityregler']").count()) === 1, "länk till communityreglerna i dialogen")
await p.keyboard.press("Escape")
await p.waitForTimeout(300)
check(await dialog.isVisible(), "dialogen går inte att stänga utan att godkänna")
check(await p.locator("[data-testid=accept-updated-agreement]").isDisabled(), "knappen kräver att rutan är ikryssad")
await dialog.locator("label[for=accept-updated-agreement]").click()
await p.locator("[data-testid=accept-updated-agreement]").click()
await p.locator("text=Det uppdaterade avtalet är godkänt").waitFor()
check((await dialog.count()) === 0, "godkänt – dialogen försvinner")
const log = await (await fetch(`${mock}/__log`)).json()
const call = log.filter((l) => l.table === "accept_legal_documents").pop()
check(JSON.stringify(call?.body?.p_documents) === JSON.stringify(["terms", "privacy", "community"]), "accept_legal_documents med alla tre delarna för klienter", call?.body)
await p.reload()
await p.waitForTimeout(1500)
check((await p.locator("[data-testid=agreement-update]").count()) === 0, "dialogen visas inte igen efter godkännandet")
await browser.close()
