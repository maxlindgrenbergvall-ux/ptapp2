/**
 * Engångs-/återkörbar synk (v35): alla som samtyckt till nyhetsbrev i databasen
 * läggs i rätt Resend-segment ("klient" / "PT-Segment"). Behövs för samtycken
 * som gavs innan Resend kopplades in (v34) eller om Resend inte svarade.
 * Samma logik som appen (src/lib/marketing/resend.ts) – idempotent.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… RESEND_API_KEY=re_… \
 *     npx tsx --conditions=react-server --tsconfig tsconfig.json scripts/sync-resend-segments.mts [--dry-run]
 */
import { syncMarketingContact, type MarketingRole } from "../src/lib/marketing/resend"

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryRun = process.argv.includes("--dry-run")
if (!url || !key || (!dryRun && !process.env.RESEND_API_KEY)) {
  console.error("Sätt SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY och RESEND_API_KEY (eller kör med --dry-run).")
  process.exit(1)
}
const headers = { apikey: key, Authorization: `Bearer ${key}` }

type Row = { id: string; role: MarketingRole | null; first_name: string | null; last_name: string | null }
const rows: Row[] = []
for (let from = 0; ; from += 1000) {
  const res = await fetch(`${url}/rest/v1/profiles?select=id,role,first_name,last_name&marketing_consent=eq.true&role=not.is.null`, {
    headers: { ...headers, Range: `${from}-${from + 999}` },
  })
  if (!res.ok) throw new Error(`profiles: ${res.status} ${await res.text()}`)
  const page = (await res.json()) as Row[]
  rows.push(...page)
  if (page.length < 1000) break
}

let ok = 0
let failed = 0
for (const r of rows) {
  const u = await fetch(`${url}/auth/v1/admin/users/${r.id}`, { headers })
  const email = u.ok ? ((await u.json()) as { email?: string }).email : undefined
  if (!email || !r.role) continue
  if (dryRun) {
    console.log(`${email} → ${r.role === "trainer" ? "PT-Segment" : "klient"}`)
    continue
  }
  try {
    await syncMarketingContact({ email, firstName: r.first_name, lastName: r.last_name, role: r.role, consent: true })
    ok++
  } catch (e) {
    failed++
    console.error(`${r.id}: ${e instanceof Error ? e.message : e}`)
  }
}
console.log(`${rows.length} med samtycke · ${ok} synkade · ${failed} fel${dryRun ? " (torrkörning)" : ""}`)
process.exit(failed ? 1 : 0)
