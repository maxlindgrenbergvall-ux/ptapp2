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
// Skriptet registrerar bara e-postadressen: ett bekräftat konto UTAN lösenord
// med app_metadata.role = "trainer" (kan bara sättas med service role). Ingen
// behöver se eller skicka något lösenord. Säg till PT:n att gå till
// /logga-in/pt → "Välj lösenord" (Glömt lösenordet?) och välja sitt eget
// innan första inloggningen. PT-konton kan bara logga in med e-post och
// lösenord – Apple/Google är spärrat.
//
// Alternativ utan skript: Supabase Dashboard → Authentication → Add user
// (Auto Confirm, valfritt engångslösenord som aldrig delas), följt av
//   select admin_make_trainer('pt@exempel.se', 'Namn');
// i SQL Editor.
import { createClient } from "@supabase/supabase-js"

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

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { data, error } = await admin.auth.admin.createUser({
  email,
  // Inget lösenord: PT:n väljer sitt eget via "Glömt lösenordet?".
  email_confirm: true,
  // Läses av databastriggern handle_new_user(): PT-roll godtas bara härifrån.
  app_metadata: { role: "trainer" },
  user_metadata: { full_name: fullName, ...(phone ? { phone } : {}) },
})

if (error) {
  console.error(`Kunde inte skapa kontot: ${error.message}`)
  process.exit(1)
}

console.log("PT-konto registrerat")
console.log(`  Id:      ${data.user.id}`)
console.log(`  E-post:  ${email}`)
console.log("Nästa steg för PT:n:")
console.log("  1. Gå till /logga-in/pt och tryck på \"Välj lösenord\" (Glömt lösenordet?).")
console.log("  2. Ange e-postadressen ovan och öppna länken i mejlet.")
console.log("  3. Välj ett eget lösenord – därefter loggar PT:n in med e-post och lösenord.")
