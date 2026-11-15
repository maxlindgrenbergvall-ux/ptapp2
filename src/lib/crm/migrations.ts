/**
 * Känner igen fel som betyder att en migration inte är körd (Postgres 42P01/42703
 * eller PostgRESTs "Could not find … in the schema cache") och pekar ut vilken.
 */
export function missingMigration(message: string): { what: string; file: string } | null {
  if (!/does not exist|could not find the .* (?:table|column|function)|schema cache/i.test(message)) return null
  const v53 = /crm_activities|company_form|org_number|preferred_channel|next_action|last_contacted|meeting_at|converted_|template_key|followup_|archived|parent_id|open_count|opened_at|crm_sync_conversions|\bstep\b|"kind"|\bkind\b/i
  if (v53.test(message)) return { what: "CRM-uppdateringen från v53", file: "20261124000000_v53_crm_conversion.sql" }
  if (/crm_prospect_jobs/i.test(message)) return { what: "prospekteringsjobben (v50)", file: "20261121000000_v50_crm_prospecting.sql" }
  if (/instagram_followers/i.test(message)) return { what: "Instagram-fälten (v49)", file: "20261120000000_v49_crm_instagram.sql" }
  if (/crm_|is_admin/i.test(message)) return { what: "CRM-tabellerna (v47)", file: "20261119000000_v47_crm_leads.sql" }
  return null
}
