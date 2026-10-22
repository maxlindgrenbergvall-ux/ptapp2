// Kontrollerar att inga hemliga nycklar hamnar i webbläsarkoden.
//   1. Bygg med hemligheterna satta (som i Vercel, där alla variabler finns vid bygget):
//      STRIPE_SECRET_KEY=sk_test_… SUPABASE_SERVICE_ROLE_KEY=… STRIPE_WEBHOOK_SECRET=whsec_… npm run build
//   2. node scripts/check-secrets.mjs
// Söker i .next/static (allt som skickas till webbläsaren) efter hemligheternas
// faktiska värden och efter mönster för Stripe- och Supabase-hemligheter, och i
// koden efter NEXT_PUBLIC_-variabler med hemliga namn.
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const failures = []

// 1. Inga NEXT_PUBLIC_-variabler med hemliga namn (de bakas in i klientkoden).
const SECRET_NAME = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|WEBHOOK|PASSWORD|TOKEN)[A-Z0-9_]*/g
function walk(dir, fn) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, fn)
    else fn(p)
  }
}
for (const dir of ["src"]) {
  walk(path.join(root, dir), (file) => {
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) return
    for (const m of fs.readFileSync(file, "utf8").matchAll(SECRET_NAME)) failures.push(`${path.relative(root, file)}: ${m[0]}`)
  })
}
for (const file of ["next.config.ts", ".env.example"].map((f) => path.join(root, f)).filter((f) => fs.existsSync(f))) {
  for (const m of fs.readFileSync(file, "utf8").matchAll(SECRET_NAME)) failures.push(`${path.relative(root, file)}: ${m[0]}`)
}

// 2. Byggd klientkod: inga hemliga värden.
const staticDir = path.join(root, ".next/static")
if (!fs.existsSync(staticDir)) {
  console.error("Hittar inte .next/static – bygg först (npm run build).")
  process.exit(2)
}
const values = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "FITBIT_CLIENT_SECRET", "STRAVA_CLIENT_SECRET", "GARMIN_CONSUMER_SECRET"]
  .map((name) => ({ name, value: process.env[name]?.trim() }))
  .filter((v) => v.value && v.value.length >= 8)
const patterns = [
  { name: "Stripe secret key", re: /\b[sr]k_(live|test)_[A-Za-z0-9]{10,}/ },
  { name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{10,}/ },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
]
let files = 0
const scan = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return scan(p)
    if (!/\.(js|css|json|html|txt)$/.test(e.name)) return
    files++
    const text = fs.readFileSync(p, "utf8")
    for (const v of values) if (text.includes(v.value)) failures.push(`${path.relative(root, p)}: innehåller värdet av ${v.name}`)
    for (const pat of patterns) if (pat.re.test(text)) failures.push(`${path.relative(root, p)}: ${pat.name}`)
  })
scan(staticDir)

if (failures.length) {
  console.log(`FAIL – ${failures.length} fynd:\n  ${failures.join("\n  ")}`)
  process.exit(1)
}
console.log(`ok   inga hemliga nycklar i webbläsarkoden (${files} filer i .next/static, ${values.length} hemliga värden kontrollerade)`)
console.log("ok   inga NEXT_PUBLIC_-variabler med hemliga namn")
