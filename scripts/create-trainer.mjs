#!/usr/bin/env node
// Skapar ett PT-konto (endast för Coavira-administratörer).
//
// PT:er kan inte registrera sig själva i appen. Kör det här skriptet lokalt med
// projektets service role-nyckel. Den får ALDRIG läggas i appen eller i Vercel
// som NEXT_PUBLIC_-variabel.
//
//   SUPABASE_URL=https://<projekt>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role> \
//   node scripts/create-trainer.mjs pt@exempel.se "Förnamn Efternamn" [070-123 45 67]
//
// Skriptet skapar ett bekräftat konto med app_metadata.role = "trainer" (kan
// bara sättas med service role) och ett slumpat lösenord som skrivs ut en gång.
// Dela det med PT:n på ett säkert sätt och be hen byta lösenord via
// "Glömt lösenordet?" vid första inloggningen på /logga-in/pt.
//
// Alternativ utan skript: Supabase Dashboard → Authentication → Add user
// (Auto Confirm), följt av  select admin_make_trainer('pt@exempel.se', 'Namn');
// i SQL Editor.
import { createClient } from "@supabase/supabase-js"
import { randomInt } from "node:crypto"

const [email, fullName, phone] = process.argv.slice(2)
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !fullName) {
  console.error('Användning: node scripts/create-trainer.mjs <e-post> "<namn>" [telefon]')
  process.exit(1)
}
if (!url || !serviceKey) {
  console.error("Sätt SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

/** 16 tecken från ett alfabet utan förväxlingsbara tecken (0/O, 1/l/I). */
function generatePassword(length = 16) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_!?"
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("")
}

const password = generatePassword()
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  // Läses av databastriggern handle_new_user(): PT-roll godtas bara härifrån.
  app_metadata: { role: "trainer" },
  user_metadata: { full_name: fullName, ...(phone ? { phone } : {}) },
})

if (error) {
  console.error(`Kunde inte skapa kontot: ${error.message}`)
  process.exit(1)
}

console.log("PT-konto skapat")
console.log(`  Id:        ${data.user.id}`)
console.log(`  E-post:    ${email}`)
console.log(`  Lösenord:  ${password}`)
console.log("  Inloggning: /logga-in/pt")
console.log("Dela uppgifterna säkert och be PT:n byta lösenord efter första inloggningen.")
