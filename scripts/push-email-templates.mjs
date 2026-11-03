#!/usr/bin/env node
/**
 * Skickar Coaviras e-postmallar (supabase/templates/) till Supabase via Management API –
 * samma sak som att klistra in dem under Authentication → Emails → Templates.
 * Ändrar BARA ämnesrader och mallar (mailer_subjects_* / mailer_templates_*_content),
 * inga andra Auth-inställningar.
 *
 *   node scripts/push-email-templates.mjs --dry-run           # visar vad som skickas
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/push-email-templates.mjs
 *
 * SUPABASE_ACCESS_TOKEN är en personlig åtkomsttoken (supabase.com/dashboard/account/tokens).
 * Den ger full åtkomst till kontots projekt: sätt den bara i det egna skalet, aldrig i
 * appen, Vercel eller repot. SUPABASE_PROJECT_REF är id:t i projektets URL
 * (https://<ref>.supabase.co).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { TEMPLATES } from "./build-email-templates.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dryRun = process.argv.includes("--dry-run")

const body = {}
for (const t of TEMPLATES) {
  body[`mailer_subjects_${t.key}`] = t.subject
  body[`mailer_templates_${t.key}_content`] = fs.readFileSync(path.join(root, "supabase/templates", t.file), "utf8")
}

if (dryRun) {
  for (const [k, v] of Object.entries(body)) console.log(k.padEnd(48), k.includes("subjects") ? v : `${v.length} tecken`)
  process.exit(0)
}

const token = process.env.SUPABASE_ACCESS_TOKEN
const ref = process.env.SUPABASE_PROJECT_REF
if (!token || !ref) {
  console.error("Sätt SUPABASE_ACCESS_TOKEN och SUPABASE_PROJECT_REF (eller kör med --dry-run).")
  process.exit(1)
}
if (!/^[a-z0-9]{20}$/.test(ref)) {
  console.error(`SUPABASE_PROJECT_REF ser inte ut som ett projekt-id: ${ref}`)
  process.exit(1)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
})
if (!res.ok) {
  console.error(`Supabase svarade ${res.status}: ${(await res.text()).slice(0, 500)}`)
  process.exit(1)
}
const saved = await res.json()
const mismatch = Object.keys(body).filter((k) => saved[k] !== body[k])
if (mismatch.length) {
  console.error(`Sparat, men skiljer sig för: ${mismatch.join(", ")}`)
  process.exit(1)
}
console.log(`ok   ${TEMPLATES.length} e-postmallar och ämnesrader uppdaterade i projektet ${ref}`)
