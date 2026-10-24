// E2E för v20 i Supabase-läge mot e2e/mock-supabase.mjs: kontoradering via
// /api/account/delete (filer i Storage + Supabase Auth admin-API:t med service
// role, bara på servern) och ett tydligt felmeddelande när data inte går att ladda.
//   (start som e2e/v16-supabase.test.mjs)
//   BASE_URL=http://localhost:3000 node e2e/v20-supabase.test.mjs
import { chromium } from "playwright"

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
await fetch(`${mock}/__reset_v20`)
const RADERA = "22222222-0000-4000-8000-00000000dead"

async function login(email, home = /\/klient$/) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/logga-in`)
  await p.fill("#email", email)
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(home)
  return { ctx, p }
}

// API:t utan inloggning och utan bekräftelse.
check((await fetch(`${base}/api/account/delete`, { method: "POST", body: JSON.stringify({ confirm: "RADERA" }) })).status === 401, "radering kräver inloggning")

// ---------------------------------------------------- 1. Radera kontot ---
{
  const { ctx, p } = await login("radera@test.se")
  await p.waitForLoadState("networkidle")
  const bad = await p.request.post(`${base}/api/account/delete`, { data: {} })
  check(bad.status() === 400, "radering kräver bekräftelseordet")
  check(!(await getLog()).some((e) => e.table === "auth.admin.deleteUser"), "inget raderas utan bekräftelse")

  await p.goto(`${base}/klient/installningar`)
  await p.click("[data-testid=delete-account-card] button:has-text('Radera mitt konto')")
  await p.fill("#confirm-delete", "RADERA")
  await p.click("[data-testid=delete-account-dialog] button[type=submit]")
  await p.waitForURL(`${base}/konto-raderat`)
  await p.waitForSelector("text=Ditt konto är raderat")
  const log = await getLog()
  const del = log.find((e) => e.table === "auth.admin.deleteUser")
  check(del?.body.id === RADERA, "kontot raderas med Supabase Auth admin-API:t (service role på servern)")
  check(log.some((e) => e.table === "storage.list.avatars" && e.body.prefix === RADERA), "servern letar upp användarens filer")
  check(log.some((e) => e.table === "storage.remove.avatars" && e.body.prefixes?.includes(`${RADERA}/profil.jpg`)), "profilbilden tas bort")
  check(log.some((e) => e.table === "storage.remove.chat-attachments" && e.body.prefixes?.includes(`${RADERA}/msg-1/bild.png`)), "chattbilagor i undermappar tas bort")
  check(log.findIndex((e) => e.table.startsWith("storage.remove")) < log.findIndex((e) => e.table === "auth.admin.deleteUser"), "filerna tas bort före kontot")
  check(!log.some((e) => e.table === "delete_my_account"), "webbläsaren anropar inte databasen direkt")

  // Kontot finns inte längre: inloggning nekas.
  await p.goto(`${base}/logga-in`)
  await p.fill("#email", "radera@test.se")
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForSelector("text=/Fel e-post eller lösenord|Felaktig|stämmer inte/i")
  ok("det raderade kontot kan inte logga in")
  await ctx.close()
}

// ------------------------------------------- 2. Data som inte går att ladda ---
{
  const { ctx, p } = await login("trasig@test.se", /\/klient$/)
  const fb = p.locator("[data-testid=error-fallback]")
  await fb.waitFor()
  check((await fb.innerText()).includes("Något gick fel"), "ett snyggt felmeddelande i stället för en blank skärm")
  check(await fb.locator("button:has-text('Försök igen')").isVisible(), "med knappen Försök igen")
  await ctx.close()
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
