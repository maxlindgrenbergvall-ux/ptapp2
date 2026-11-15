// Enhetstest: CRM:et känner igen en migration som inte är körd och säger vilken.
//   npx tsx --tsconfig tsconfig.json e2e/crm-migrations.unit.ts
import { missingMigration } from "@/lib/crm/migrations"

let failed = 0
const check = (c: boolean, m: string) => (console.log(c ? "ok  " : "FAIL", m), c || failed++)
const file = (msg: string) => missingMigration(msg)?.file ?? null
// Felmeddelanden som Postgres och PostgREST (Supabase) faktiskt ger.
check(file(`relation "public.crm_activities" does not exist`) === "20261124000000_v53_crm_conversion.sql", "saknad tabell crm_activities → v53")
check(file(`Could not find the table 'public.crm_activities' in the schema cache`) === "20261124000000_v53_crm_conversion.sql", "PostgREST: saknad tabell → v53")
check(file(`Could not find the 'template_key' column of 'crm_email_templates' in the schema cache`) === "20261124000000_v53_crm_conversion.sql", "PostgREST: saknad kolumn template_key → v53")
check(file(`column crm_leads.company_form does not exist`) === "20261124000000_v53_crm_conversion.sql", "saknad kolumn company_form → v53")
check(file(`Could not find the function public.crm_sync_conversions without parameters in the schema cache`) === "20261124000000_v53_crm_conversion.sql", "saknad funktion → v53")
check(file(`relation "public.crm_prospect_jobs" does not exist`) === "20261121000000_v50_crm_prospecting.sql", "saknad tabell crm_prospect_jobs → v50")
check(file(`column crm_leads.instagram_followers does not exist`) === "20261120000000_v49_crm_instagram.sql", "saknad kolumn instagram_followers → v49")
check(file(`relation "public.crm_leads" does not exist`) === "20261119000000_v47_crm_leads.sql", "saknad tabell crm_leads → v47")
check(file("duplicate key value violates unique constraint") === null, "andra fel pekar inte ut någon migration")
check(file("new row violates row-level security policy") === null, "behörighetsfel pekar inte ut någon migration")
console.log(failed ? `\n${failed} fel` : "\nMIGRATIONSKONTROLLEN GODKÄND")
process.exit(failed ? 1 : 0)
