// E2E för v29 i Supabase-läge mot e2e/mock-supabase.mjs: bildfiltret laddar
// upp granskade bilder med service role (WebP, i användarens mapp), stoppade
// bilder loggas i moderation_events, chattbilder kräver behörighet till
// tråden, och klientens passmall sparas med client_id (inte trainer_id).
//   (start som e2e/v16-supabase.test.mjs, med MODERATION_TEST_BLOCK_COLOR=ff00ff)
//   BASE_URL=http://localhost:3000 node e2e/v29-supabase.test.mjs
import { chromium } from "playwright"
import sharp from "sharp"

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

const C1 = "22222222-0000-4000-8000-000000000001"
const noise = Buffer.alloc(96 * 96 * 3)
for (let i = 0; i < noise.length; i++) noise[i] = (i * 73 + (i >> 5) * 31) % 256
const normalPng = (await sharp(noise, { raw: { width: 96, height: 96, channels: 3 } }).png().toBuffer()).toString("base64")
const blockedPng = (await sharp({ create: { width: 96, height: 96, channels: 3, background: "#ff00ff" } }).png().toBuffer()).toString("base64")

// Utan inloggning: 401.
{
  const form = new FormData()
  form.set("file", new Blob([Buffer.from(normalPng, "base64")], { type: "image/png" }), "bild")
  form.set("bucket", "avatars")
  const res = await fetch(`${base}/api/uploads/image`, { method: "POST", body: form })
  check(res.status === 401, `utan inloggning går det inte att ladda upp (${res.status})`)
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
await p.goto(`${base}/logga-in`)
await p.fill("#email", "sara@test.se")
await p.fill("#password", "hemligt123")
await p.click("button[type=submit]")
await p.waitForURL(/\/klient$/)
await p.waitForLoadState("networkidle")

// Uppladdning från webbläsaren (med inloggningens cookies).
const upload = (b64, bucket, path) =>
  p.evaluate(
    async ([b64, bucket, path]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const form = new FormData()
      form.set("file", new Blob([bytes], { type: "image/png" }), "bild")
      form.set("bucket", bucket)
      if (path) form.set("path", path)
      const res = await fetch("/api/uploads/image", { method: "POST", body: form })
      return { status: res.status, body: await res.json().catch(() => ({})) }
    },
    [b64, bucket, path]
  )

// ------------------------------------------------------ 1. profilbild ---
await fetch(`${mock}/__reset`)
const avatar = await upload(normalPng, "avatars")
check(avatar.status === 200 && avatar.body.ref?.includes(`/storage/v1/object/public/avatars/${C1}/avatar.webp?v=`), `godkänd profilbild sparas (${avatar.status})`)
let log = await getLog()
const put = log.find((e) => e.table === "storage.upload.avatars")
check(put?.body.service === true && put.body.path === `${C1}/avatar.webp`, "servern laddar upp med service role i användarens egen mapp")
check(/image\/webp/.test(put?.body.contentType ?? ""), "bilden är omkodad till WebP (EXIF/GPS följer inte med)")

// ----------------------------------------------- 2. stoppad bild loggas ---
await fetch(`${mock}/__reset`)
const blocked = await upload(blockedPng, "avatars")
check(blocked.status === 422 && /innehållsfilter/.test(blocked.body.error ?? ""), `olämplig bild stoppas (${blocked.status})`)
log = await getLog()
check(!log.some((e) => e.table?.startsWith("storage.upload")), "den stoppade bilden sparas aldrig")
const ev = log.find((e) => e.table === "moderation_events" && e.method === "POST")
check(ev?.body.user_id === C1 && ev.body.action === "blocked" && ev.body.bucket === "avatars" && typeof ev.body.scores?.Porn === "number", "stoppet loggas i moderation_events med klassernas poäng")

// ------------------------------------------------------ 3. chattbilder ---
await fetch(`${mock}/__reset`)
const msg = "33333333-0000-4000-8000-000000000123"
const own = await upload(normalPng, "chat-attachments", `${C1}/${msg}/semester.png`)
check(own.status === 200 && own.body.ref === `storage:chat-attachments/${C1}/${msg}/semester.webp`, `chattbild i egen tråd sparas som WebP (${own.status})`)
const other = await upload(normalPng, "chat-attachments", `22222222-0000-4000-8000-000000000999/${msg}/x.png`)
check(other.status === 403, `chattbild i någon annans tråd nekas (${other.status})`)
const noPath = await upload(normalPng, "chat-attachments")
check(noPath.status === 400, "chattbild utan sökväg nekas")
const traversal = await upload(normalPng, "chat-attachments", `${C1}/../../avatars/x.png`)
check(traversal.status === 400, "sökväg med ../ nekas")

// ---------------------------------------------- 4. klientens passmall ---
await fetch(`${mock}/__reset`)
await p.click('button:has-text("Logga eget pass")')
await p.fill("#own-name", "Ben")
await p.fill("#own-search", "knäböj")
await p.locator('ul[aria-label="Övningar att välja"] button').first().click()
await p.click("[role=dialog] [data-testid=save-as-template]")
await p.fill("#template-name", "Ben A")
await p.click("[data-testid=save-template-confirm]")
await p.waitForSelector("text=Sparad som mall")
await p.waitForTimeout(800)
log = await getLog()
const tpl = log.find((e) => e.table === "workout_templates" && e.method === "POST")
check(tpl?.body.client_id === C1 && tpl.body.trainer_id === null && tpl.body.name === "Ben A" && tpl.body.exercises.length === 1, "mallen sparas i workout_templates med client_id")

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
