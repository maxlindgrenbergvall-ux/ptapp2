// E-postmallarna för Supabase Auth (v33).
//
// 1. Renderas med Go:s html/template – samma motor och fältnamn som Supabase
//    (e2e/email-render/main.go). Stavfel i {{ .Fält }} eller trasig syntax felar.
// 2. Kontrollerar länkar (rätt type och next till /auth/confirm), kod, ämnesrader,
//    storlek (Gmail klipper mejl över 102 kB), inga skript/externa stilmallar utöver
//    typsnittet, alt-text på logotypen och att mallarna är uppdaterade mot generatorn.
// 3. Öppnar varje mejl i Chromium på mobil (360 px) och dator: ingen horisontell
//    overflow, knappen syns, ljust och mörkt läge (skärmdumpar).
// 4. Med BASE_URL (Supabase-läge mot e2e/mock-supabase.mjs): klickar på knappen i
//    varje mejl och följer länken genom appen – verifyOtp med rätt typ och rätt sida.
//
//   node e2e/email-templates.test.mjs [skärmdumpsmapp]
//   BASE_URL=http://localhost:3000 node e2e/email-templates.test.mjs   # även klick-genom
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { chromium } from "playwright"

import { EMAIL_COLORS, TEMPLATES } from "../scripts/build-email-templates.mjs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coavira-mail-"))
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))

const render = (file, env = {}) =>
  execFileSync("go", ["run", "e2e/email-render/main.go", `supabase/templates/${file}`], {
    env: { ...process.env, GOFLAGS: "-mod=mod", ...env },
    encoding: "utf8",
  })

// ------------------------------------------------------------ statiskt ---
execFileSync("node", ["scripts/build-email-templates.mjs", "--check"], { stdio: "inherit" })
ok("supabase/templates/ är uppdaterade mot generatorn")
const subjects = JSON.parse(fs.readFileSync("supabase/templates/subjects.json", "utf8"))
check(fs.existsSync("public/email/coavira-mark.png"), "logotypen finns som PNG (public/email/coavira-mark.png)")

const EXPECT = {
  confirmation: { type: "email", next: "/dashboard" },
  invite: { type: "invite", next: "/nytt-losenord" },
  magic_link: { type: "magiclink", next: "/dashboard" },
  email_change: { type: "email_change", next: "/dashboard" },
  recovery: { type: "recovery", next: "/nytt-losenord" },
  reauthentication: null,
}
check(TEMPLATES.length === 6 && TEMPLATES.every((t) => t.key in EXPECT), "alla sex mallarna i Supabase finns")
// /auth/confirm måste känna igen varje typ.
const confirmRoute = fs.readFileSync("src/app/auth/confirm/route.ts", "utf8")
for (const e of Object.values(EXPECT).filter(Boolean)) check(confirmRoute.includes(`"${e.type}"`), `/auth/confirm godtar type=${e.type}`)

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
for (const t of TEMPLATES) {
  const raw = fs.readFileSync(`supabase/templates/${t.file}`, "utf8")
  check(subjects[t.key]?.subject === t.subject && t.subject.length <= 60, `${t.dashboard}: ämnesrad "${t.subject}"`)
  check(Buffer.byteLength(raw) < 102_000, `${t.dashboard}: ${(Buffer.byteLength(raw) / 1024).toFixed(1)} kB (< 102 kB, Gmail klipper inte)`)
  check(!/<script|<form|<iframe|javascript:/i.test(raw), `${t.dashboard}: inga skript eller formulär`)
  check(!/<!--\[if/i.test(raw), `${t.dashboard}: inga villkorskommentarer (Supabase tar bort kommentarer)`)
  check([...raw.matchAll(/<link [^>]*href="([^"]+)"/g)].every((m) => m[1].startsWith("https://fonts.googleapis.com/")), `${t.dashboard}: bara typsnittet länkas externt`)
  check(raw.includes(EMAIL_COLORS.brand) && raw.includes(EMAIL_COLORS.primary) && raw.includes("'Geist'"), `${t.dashboard}: Coaviras färger och typsnitt`)

  let html
  try {
    html = render(t.file, { SITE_URL: "https://ptapp2.vercel.app" })
  } catch (e) {
    fail(`${t.dashboard}: renderas inte med html/template: ${e.stderr ?? e.message}`)
    continue
  }
  ok(`${t.dashboard}: renderas med Go html/template (som Supabase)`)
  check(!html.includes("{{") && !html.includes("ZgotmplZ"), `${t.dashboard}: alla variabler ersatta, inga osäkra URL:er`)
  const expect = EXPECT[t.key]
  if (expect) {
    const href = `https://ptapp2.vercel.app/auth/confirm?token_hash=pkce_9f2c0d1e8a7b6c5d4e3f2a1b0c9d8e7f&amp;type=${expect.type}&amp;next=${expect.next}`
    const plain = href.replaceAll("&amp;", "&")
    check(html.includes(`href="${plain}"`) || html.includes(`href="${href}"`), `${t.dashboard}: knappen → /auth/confirm (type=${expect.type}, next=${expect.next})`)
  } else {
    check(html.includes(">482913<"), `${t.dashboard}: engångskoden visas`)
    check(!html.includes("/auth/confirm"), `${t.dashboard}: ingen länk – bara kod`)
  }
  if (t.key === "email_change") check(html.includes("sara@example.com") && html.includes("sara.ny@example.com"), "Change email: både nuvarande och ny adress")
  check(/<img [^>]*alt="Coavira"/.test(html) && />Coavira<\/td>/.test(html), `${t.dashboard}: logotyp med alt-text och namnet som text`)

  // Layout i Chromium (bilden pekar på appen – ersätts med den lokala filen).
  const file = path.join(tmp, t.file)
  fs.writeFileSync(file, html.replaceAll("https://ptapp2.vercel.app/email/coavira-mark.png", `file://${path.resolve("public/email/coavira-mark.png")}`))
  for (const [w, scheme] of [
    [360, "light"],
    [800, "light"],
    [360, "dark"],
  ]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme })
    await page.goto(`file://${file}`)
    const m = await page.evaluate(() => {
      const btn = document.querySelector("a.btn")
      const card = document.querySelector("td.card")
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        cardWidth: card.getBoundingClientRect().width,
        btnVisible: btn ? btn.getBoundingClientRect().height >= 44 : null,
        bodyBg: getComputedStyle(document.body).backgroundColor,
      }
    })
    check(!m.overflow, `${t.dashboard} @${w}px ${scheme}: ingen horisontell overflow`)
    if (w === 800) check(m.cardWidth <= 600, `${t.dashboard} @800px: kortet är högst 600 px (${Math.round(m.cardWidth)})`)
    if (m.btnVisible !== null) check(m.btnVisible, `${t.dashboard} @${w}px: knappen är minst 44 px hög`)
    if (scheme === "dark") check(m.bodyBg === "rgb(19, 25, 22)", `${t.dashboard}: mörkt läge (${m.bodyBg})`)
    await page.screenshot({ path: `${out}/mail-${t.file.replace(".html", "")}-${w}-${scheme}.png`, fullPage: true })
    await page.close()
  }
}

// ----------------------------------------- klick-genom i Supabase-läge ---
if (base) {
  const mock = "http://localhost:54321"
  for (const t of TEMPLATES.filter((x) => EXPECT[x.key])) {
    await fetch(`${mock}/__reset`)
    const html = render(t.file, { SITE_URL: base, TOKEN_HASH: "th_sara" })
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    await page.setContent(html)
    // Knappen öppnar en ny flik (target=_blank) – följ länken i samma flik.
    await page.goto(await page.getAttribute("a.btn", "href"))
    await page.waitForURL((u) => u.origin === base && !u.pathname.startsWith("/auth/"), { timeout: 15000 })
    const log = await (await fetch(`${mock}/__log`)).json()
    const verify = log.find((e) => e.table === "auth.verify")
    const want = EXPECT[t.key]
    check(verify?.body.type === want.type && verify.body.token_hash === "th_sara", `${t.dashboard}: verifyOtp med type=${want.type}`)
    const landed = new URL(page.url()).pathname
    const expected = want.next === "/nytt-losenord" ? "/nytt-losenord" : "/klient"
    check(landed === expected, `${t.dashboard}: inloggad och hamnar på ${landed} (väntat ${expected})`)
    await ctx.close()
  }
  // En gammal/använd länk → tydligt fel på inloggningssidan.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.setContent(render("reset-password.html", { SITE_URL: base, TOKEN_HASH: "utgangen" }))
  await page.goto(await page.getAttribute("a.btn", "href"))
  await page.waitForURL(/\/logga-in\?fel=lank/)
  ok("utgången länk → inloggningssidan med felmeddelande")
  await ctx.close()
} else {
  console.log("     (sätt BASE_URL mot Supabase-läget för att även klicka igenom länkarna)")
}

await browser.close()
fs.rmSync(tmp, { recursive: true, force: true })
