import "server-only"

import { createHash, randomUUID } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { scoreLead } from "@/lib/crm/score"
import { DEFAULT_TEMPLATES } from "@/lib/crm/templates"
import type { ProspectConfig, ProspectJob, ProspectState, ProspectStatus } from "@/lib/crm/prospect-types"
import { impliedCompanyForm } from "@/lib/crm/compliance"
import { emailKey, instagramKey, websiteKey, type Activity, type ActivityKind, type EmailLog, type EmailStatus, type EmailTemplate, type Lead, type LeadInput, type Note, type ServerLeadPatch, type TemplateInput } from "@/lib/crm/types"

/**
 * CRM:ets datalager (v47). Två utföranden med samma gränssnitt:
 *
 *   SupabaseStore – produktion. Körs med administratörens EGEN session, så att
 *                   RLS (is_admin) gäller för varje fråga. Kön, webhooken och
 *                   avregistreringen kör med service role (ingen inloggad användare).
 *   DemoStore     – minne på servern med påhittade leads. Bara när Supabase inte
 *                   är konfigurerat OCH CRM_DEMO=1 (utveckling och tester).
 */

/** SHA-256 av den normaliserade adressen – det enda som sparas om en avregistrerad. */
export const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex")

export interface NewLog {
  leadId: string
  templateId: string | null
  toEmail: string
  subject: string
  body: string
  scheduledAt: string
  step?: 1 | 2
  parentId?: string | null
}
export type LogPatch = Partial<Pick<EmailLog, "status" | "sentAt" | "deliveredAt" | "resendId" | "error" | "scheduledAt" | "openedAt" | "openCount">>

export type SaveResult = { lead: Lead; duplicate?: undefined } | { lead?: undefined; duplicate: Lead; field: "e-postadressen" | "Instagram-kontot" | "webbadressen" }

export interface CrmStore {
  listLeads(): Promise<Lead[]>
  getLead(id: string): Promise<Lead | null>
  getLeadByToken(token: string): Promise<Lead | null>
  /** Avregistreringsnyckeln – används bara på servern när mejlet byggs. */
  unsubscribeToken(leadId: string): Promise<string | null>
  createLead(input: LeadInput): Promise<SaveResult>
  updateLead(id: string, patch: ServerLeadPatch): Promise<SaveResult | null>
  deleteLead(id: string): Promise<void>
  listNotes(leadId: string): Promise<Note[]>
  addNote(leadId: string, body: string): Promise<Note>
  deleteNote(id: string): Promise<void>
  /** Aktiva mallar. Startmallar som saknas läggs in (per nyckel); arkiverade visas inte. */
  listTemplates(): Promise<EmailTemplate[]>
  saveTemplate(t: TemplateInput): Promise<EmailTemplate>
  /** En startmall arkiveras (så att den inte läggs in igen), en egen mall raderas. */
  deleteTemplate(id: string): Promise<void>
  listLogs(opts?: { leadId?: string; limit?: number }): Promise<EmailLog[]>
  createLogs(rows: NewLog[]): Promise<EmailLog[]>
  updateLog(id: string, patch: LogPatch): Promise<void>
  findLogByResendId(resendId: string): Promise<EmailLog | null>
  /** Hämtar och låser utskick som är dags (status → sending). */
  claimDue(limit: number): Promise<EmailLog[]>
  cancelQueued(filter: { leadId?: string; id?: string }, reason?: string): Promise<number>
  suppressedHashes(hashes: string[]): Promise<Set<string>>
  suppress(email: string, reason: "unsubscribed" | "bounced" | "complained" | "manual"): Promise<void>
  countSuppressed(): Promise<number>
  // v53: aktiviteter och konverteringar
  listActivities(opts?: { leadId?: string; limit?: number }): Promise<Activity[]>
  addActivity(a: { leadId: string; kind: ActivityKind; body: string | null; occurredAt: string }): Promise<Activity>
  /** Leads vars e-post hör till ett registrerat PT-konto blir kunder. Antal nya. */
  syncConversions(): Promise<number>
  // v50: prospekteringsjobb
  listJobs(limit?: number): Promise<ProspectJob[]>
  createJob(config: ProspectConfig, state: ProspectState): Promise<ProspectJob>
  /** Låser jobbet för ett steg (högst en körning åt gången). null = upptaget eller inte igång. */
  claimJob(id: string): Promise<ProspectJob | null>
  /** Sparar och släpper låset. */
  saveJob(id: string, patch: { status?: ProspectStatus; state?: ProspectState; error?: string | null }): Promise<ProspectJob | null>
}

// ------------------------------------------------------------ Supabase ---
type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? null : String(v))

function toLead(r: Row): Lead {
  return {
    id: String(r.id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    name: String(r.name),
    title: s(r.title),
    segment: r.segment as Lead["segment"],
    status: r.status as Lead["status"],
    email: s(r.email),
    emailVerified: (r.email_verified as boolean | null) ?? null,
    phone: s(r.phone),
    instagram: s(r.instagram),
    instagramFollowers: r.instagram_followers == null ? null : Number(r.instagram_followers),
    websiteUrl: s(r.website_url),
    gym: s(r.gym),
    city: s(r.city),
    specialties: (r.specialties as string[] | null) ?? [],
    source: r.source as Lead["source"],
    sourceUrl: s(r.source_url),
    score: Number(r.score),
    scoreBreakdown: (r.score_breakdown as Lead["scoreBreakdown"] | null) ?? [],
    legalBasis: r.legal_basis as Lead["legalBasis"],
    unsubscribedAt: s(r.unsubscribed_at),
    lastEmailedAt: s(r.last_emailed_at),
    statusChangedAt: String(r.status_changed_at),
    companyForm: (r.company_form as Lead["companyForm"] | null) ?? "unknown",
    orgNumber: s(r.org_number),
    preferredChannel: (r.preferred_channel as Lead["preferredChannel"] | null) ?? "email",
    nextActionAt: s(r.next_action_at),
    nextActionNote: s(r.next_action_note),
    lastContactedAt: s(r.last_contacted_at),
    meetingAt: s(r.meeting_at),
    convertedAt: s(r.converted_at),
    companyType: (r.company_type as Lead["companyType"] | null) ?? "unknown",
    companyTypeManual: r.company_type_manual === true,
    enrichmentStatus: (r.enrichment_status as Lead["enrichmentStatus"] | null) ?? "pending",
    enrichment: r.enrichment && typeof r.enrichment === "object" && Object.keys(r.enrichment).length ? (r.enrichment as Lead["enrichment"]) : null,
    enrichedAt: s(r.enriched_at),
    verifiedAt: s(r.verified_at),
  }
}
const toNote = (r: Row): Note => ({ id: String(r.id), leadId: String(r.lead_id), body: String(r.body), createdAt: String(r.created_at) })
const toTemplate = (r: Row): EmailTemplate => ({
  id: String(r.id),
  key: s(r.template_key),
  segment: (r.segment as EmailTemplate["segment"]) ?? null,
  kind: (r.kind as EmailTemplate["kind"] | null) ?? "intro",
  companyForm: (r.company_form as EmailTemplate["companyForm"]) ?? null,
  name: String(r.name),
  subject: String(r.subject),
  body: String(r.body),
  followupDays: r.followup_days == null ? null : Number(r.followup_days),
  followupSubject: s(r.followup_subject),
  followupBody: s(r.followup_body),
  updatedAt: String(r.updated_at),
})
const templateRow = (t: TemplateInput) => ({
  segment: t.segment,
  kind: t.kind,
  company_form: t.companyForm,
  name: t.name,
  subject: t.subject,
  body: t.body,
  followup_days: t.followupBody ? t.followupDays : null,
  followup_subject: t.followupBody ? t.followupSubject || null : null,
  followup_body: t.followupDays ? t.followupBody || null : null,
})
const toActivity = (r: Row): Activity => ({ id: String(r.id), leadId: String(r.lead_id), kind: r.kind as ActivityKind, body: s(r.body), occurredAt: String(r.occurred_at) })
const toLog = (r: Row): EmailLog => ({
  id: String(r.id),
  leadId: String(r.lead_id),
  templateId: s(r.template_id),
  createdAt: String(r.created_at),
  toEmail: String(r.to_email),
  subject: String(r.subject),
  body: String(r.body),
  status: r.status as EmailStatus,
  scheduledAt: String(r.scheduled_at),
  sentAt: s(r.sent_at),
  deliveredAt: s(r.delivered_at),
  resendId: s(r.resend_id),
  error: s(r.error),
  step: Number(r.step ?? 1) === 2 ? 2 : 1,
  parentId: s(r.parent_id),
  openedAt: s(r.opened_at),
  openCount: Number(r.open_count ?? 0),
})

const toJob = (r: Row): ProspectJob => ({ id: String(r.id), createdAt: String(r.created_at), updatedAt: String(r.updated_at), status: r.status as ProspectStatus, config: r.config as ProspectConfig, state: r.state as ProspectState, error: s(r.error) })
/** Ett steg får ta högst så här lång tid innan låset släpps av sig självt (servern kan ha dött). */
const LOCK_MS = 60_000

const COLUMN: Record<string, string> = {
  instagramFollowers: "instagram_followers",
  emailVerified: "email_verified",
  websiteUrl: "website_url",
  sourceUrl: "source_url",
  legalBasis: "legal_basis",
  lastEmailedAt: "last_emailed_at",
  unsubscribedAt: "unsubscribed_at",
  companyForm: "company_form",
  orgNumber: "org_number",
  preferredChannel: "preferred_channel",
  nextActionAt: "next_action_at",
  nextActionNote: "next_action_note",
  lastContactedAt: "last_contacted_at",
  meetingAt: "meeting_at",
  convertedAt: "converted_at",
  companyType: "company_type",
  companyTypeManual: "company_type_manual",
  enrichmentStatus: "enrichment_status",
  enrichedAt: "enriched_at",
  verifiedAt: "verified_at",
}
function toRow(input: Row): Row {
  const row: Row = {}
  for (const [k, v] of Object.entries(input)) if (v !== undefined) row[COLUMN[k] ?? k] = v
  return row
}

/** Fälten som poängen räknas på, med ändringen ovanpå den befintliga leaden. */
function scored(base: Partial<Lead>, patch: LeadInput) {
  const m = { ...base, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Partial<Lead>
  const { score, breakdown } = scoreLead({
    name: m.name ?? "",
    title: m.title ?? null,
    email: m.email ?? null,
    emailVerified: m.emailVerified ?? null,
    phone: m.phone ?? null,
    instagram: m.instagram ?? null,
    instagramFollowers: m.instagramFollowers ?? null,
    websiteUrl: m.websiteUrl ?? null,
    gym: m.gym ?? null,
    city: m.city ?? null,
    specialties: m.specialties ?? [],
    sourceUrl: m.sourceUrl ?? null,
  })
  return { score, score_breakdown: breakdown }
}

const DUPLICATE_FIELD = { crm_leads_email_key: ["email_key", "e-postadressen"], crm_leads_instagram_key: ["instagram_key", "Instagram-kontot"], crm_leads_website_key: ["website_key", "webbadressen"] } as const

export class SupabaseStore implements CrmStore {
  constructor(
    private readonly db: SupabaseClient,
    private readonly userId: string | null
  ) {}

  private fail(error: { message: string } | null): asserts error is null {
    if (error) throw new Error(error.message)
  }

  /** Unik-krock (23505) → slå upp den befintliga leaden så att gränssnittet kan visa den. */
  private async duplicateOf(error: { code?: string; message: string }, input: LeadInput): Promise<SaveResult | null> {
    if (error.code !== "23505") return null
    const hit = Object.entries(DUPLICATE_FIELD).find(([index]) => error.message.includes(index))
    const order = hit ? [hit[1]] : Object.values(DUPLICATE_FIELD)
    const keys: Record<string, string | null> = { email_key: emailKey(input.email), instagram_key: instagramKey(input.instagram), website_key: websiteKey(input.websiteUrl) }
    for (const [column, field] of order) {
      if (!keys[column]) continue
      const { data } = await this.db.from("crm_leads").select("*").eq(column, keys[column]).maybeSingle()
      if (data) return { duplicate: toLead(data), field }
    }
    return null
  }

  async listLeads() {
    const { data, error } = await this.db.from("crm_leads").select("*").order("created_at", { ascending: false }).limit(5000)
    this.fail(error)
    return (data ?? []).map(toLead)
  }
  async getLead(id: string) {
    const { data, error } = await this.db.from("crm_leads").select("*").eq("id", id).maybeSingle()
    this.fail(error)
    return data ? toLead(data) : null
  }
  async getLeadByToken(token: string) {
    const { data, error } = await this.db.from("crm_leads").select("*").eq("unsubscribe_token", token).maybeSingle()
    this.fail(error)
    return data ? toLead(data) : null
  }
  async unsubscribeToken(leadId: string) {
    const { data, error } = await this.db.from("crm_leads").select("unsubscribe_token").eq("id", leadId).maybeSingle()
    this.fail(error)
    return data ? String(data.unsubscribe_token) : null
  }
  async createLead(input: LeadInput): Promise<SaveResult> {
    // PT:er på gymkedjor mejlas på arbetsgivarens (bolagets) adress.
    const form = impliedCompanyForm(input.segment ?? "freelance", input.companyForm ?? "unknown")
    const row = { ...toRow({ ...input, ...(form !== "unknown" ? { companyForm: form } : {}) } as Row), ...scored({}, input), created_by: this.userId }
    const { data, error } = await this.db.from("crm_leads").insert(row).select("*").single()
    if (error) {
      const dup = await this.duplicateOf(error, input)
      if (dup) return dup
      throw new Error(error.message)
    }
    return { lead: toLead(data) }
  }
  async updateLead(id: string, patch: ServerLeadPatch): Promise<SaveResult | null> {
    const current = await this.getLead(id)
    if (!current) return null
    const { data, error } = await this.db.from("crm_leads").update({ ...toRow(patch as Row), ...scored(current, patch) }).eq("id", id).select("*").maybeSingle()
    if (error) {
      const dup = await this.duplicateOf(error, { ...current, ...patch })
      if (dup) return dup
      throw new Error(error.message)
    }
    return data ? { lead: toLead(data) } : null
  }
  async deleteLead(id: string) {
    const { error } = await this.db.from("crm_leads").delete().eq("id", id)
    this.fail(error)
  }
  async listNotes(leadId: string) {
    const { data, error } = await this.db.from("crm_notes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200)
    this.fail(error)
    return (data ?? []).map(toNote)
  }
  async addNote(leadId: string, body: string) {
    const { data, error } = await this.db.from("crm_notes").insert({ lead_id: leadId, body, author_id: this.userId }).select("*").single()
    this.fail(error)
    return toNote(data)
  }
  async deleteNote(id: string) {
    const { error } = await this.db.from("crm_notes").delete().eq("id", id)
    this.fail(error)
  }
  async listTemplates() {
    const read = () => this.db.from("crm_email_templates").select("*").order("name")
    let { data, error } = await read()
    this.fail(error)
    // Startmallar som saknas (per nyckel) läggs in – även i ett CRM som redan har egna mallar.
    const have = new Set((data ?? []).map((r) => r.template_key).filter(Boolean))
    const missing = DEFAULT_TEMPLATES.filter((t) => !have.has(t.key))
    if (missing.length) {
      // Vanlig insert, en mall i taget: nyckelns unika index är partiellt (where template_key is not null),
      // så "on conflict (template_key)" fungerar inte. Hann en annan flik lägga in mallen (23505) går det bra.
      for (const t of missing) {
        const seeded = await this.db.from("crm_email_templates").insert({ template_key: t.key, ...templateRow(t) })
        if (seeded.error && seeded.error.code !== "23505") this.fail(seeded.error)
      }
      ;({ data, error } = await read())
      this.fail(error)
    }
    return (data ?? []).filter((r) => !r.archived).map(toTemplate)
  }
  async saveTemplate(t: TemplateInput) {
    const row = { ...templateRow(t), updated_at: new Date().toISOString() }
    const q = t.id ? this.db.from("crm_email_templates").update(row).eq("id", t.id) : this.db.from("crm_email_templates").insert(row)
    const { data, error } = await q.select("*").single()
    this.fail(error)
    return toTemplate(data)
  }
  async deleteTemplate(id: string) {
    const { data } = await this.db.from("crm_email_templates").select("template_key").eq("id", id).maybeSingle()
    const { error } = data?.template_key
      ? await this.db.from("crm_email_templates").update({ archived: true }).eq("id", id)
      : await this.db.from("crm_email_templates").delete().eq("id", id)
    this.fail(error)
  }
  async listLogs(opts: { leadId?: string; limit?: number } = {}) {
    let q = this.db.from("crm_email_logs").select("*").order("scheduled_at", { ascending: false }).limit(opts.limit ?? 500)
    if (opts.leadId) q = q.eq("lead_id", opts.leadId)
    const { data, error } = await q
    this.fail(error)
    return (data ?? []).map(toLog)
  }
  async createLogs(rows: NewLog[]) {
    const { data, error } = await this.db
      .from("crm_email_logs")
      .insert(rows.map((r) => ({ lead_id: r.leadId, template_id: r.templateId, to_email: r.toEmail, subject: r.subject, body: r.body, scheduled_at: r.scheduledAt, step: r.step ?? 1, parent_id: r.parentId ?? null, created_by: this.userId })))
      .select("*")
    this.fail(error)
    return (data ?? []).map(toLog)
  }
  async updateLog(id: string, patch: LogPatch) {
    const map: Record<string, string> = { sentAt: "sent_at", deliveredAt: "delivered_at", resendId: "resend_id", scheduledAt: "scheduled_at", openedAt: "opened_at", openCount: "open_count" }
    const row = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [map[k] ?? k, v]))
    const { error } = await this.db.from("crm_email_logs").update(row).eq("id", id)
    this.fail(error)
  }
  async findLogByResendId(resendId: string) {
    const { data, error } = await this.db.from("crm_email_logs").select("*").eq("resend_id", resendId).maybeSingle()
    this.fail(error)
    return data ? toLog(data) : null
  }
  async claimDue(limit: number) {
    const { data, error } = await this.db.rpc("crm_claim_due_emails", { p_limit: limit })
    this.fail(error)
    return ((data as Row[] | null) ?? []).map(toLog)
  }
  async cancelQueued(filter: { leadId?: string; id?: string }, reason?: string) {
    let q = this.db.from("crm_email_logs").update({ status: "cancelled", ...(reason ? { error: reason } : {}) }).eq("status", "queued")
    if (filter.leadId) q = q.eq("lead_id", filter.leadId)
    if (filter.id) q = q.eq("id", filter.id)
    const { data, error } = await q.select("id")
    this.fail(error)
    return data?.length ?? 0
  }
  async suppressedHashes(hashes: string[]) {
    if (!hashes.length) return new Set<string>()
    const { data, error } = await this.db.from("crm_suppressions").select("email_hash").in("email_hash", hashes)
    this.fail(error)
    return new Set((data ?? []).map((r) => String(r.email_hash)))
  }
  async suppress(email: string, reason: "unsubscribed" | "bounced" | "complained" | "manual") {
    const { error } = await this.db.from("crm_suppressions").upsert({ email_hash: emailHash(email), reason }, { onConflict: "email_hash", ignoreDuplicates: true })
    this.fail(error)
  }
  async countSuppressed() {
    const { count, error } = await this.db.from("crm_suppressions").select("email_hash", { count: "exact", head: true })
    this.fail(error)
    return count ?? 0
  }
  async listActivities(opts: { leadId?: string; limit?: number } = {}) {
    let q = this.db.from("crm_activities").select("*").order("occurred_at", { ascending: false }).limit(opts.limit ?? 2000)
    if (opts.leadId) q = q.eq("lead_id", opts.leadId)
    const { data, error } = await q
    this.fail(error)
    return (data ?? []).map(toActivity)
  }
  async addActivity(a: { leadId: string; kind: ActivityKind; body: string | null; occurredAt: string }) {
    const { data, error } = await this.db.from("crm_activities").insert({ lead_id: a.leadId, kind: a.kind, body: a.body, occurred_at: a.occurredAt, created_by: this.userId }).select("*").single()
    this.fail(error)
    return toActivity(data)
  }
  async syncConversions() {
    const { data, error } = await this.db.rpc("crm_sync_conversions")
    this.fail(error)
    return Number(data ?? 0)
  }
  async listJobs(limit = 10) {
    const { data, error } = await this.db.from("crm_prospect_jobs").select("*").order("created_at", { ascending: false }).limit(limit)
    this.fail(error)
    return (data ?? []).map(toJob)
  }
  async createJob(config: ProspectConfig, state: ProspectState) {
    const { data, error } = await this.db.from("crm_prospect_jobs").insert({ config, state, created_by: this.userId }).select("*").single()
    this.fail(error)
    return toJob(data)
  }
  async claimJob(id: string) {
    const now = new Date()
    const { data, error } = await this.db
      .from("crm_prospect_jobs")
      .update({ locked_until: new Date(now.getTime() + LOCK_MS).toISOString() })
      .eq("id", id)
      .eq("status", "running")
      .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
      .select("*")
      .maybeSingle()
    this.fail(error)
    return data ? toJob(data) : null
  }
  async saveJob(id: string, patch: { status?: ProspectStatus; state?: ProspectState; error?: string | null }) {
    const row: Row = { updated_at: new Date().toISOString(), locked_until: null }
    if (patch.status) row.status = patch.status
    if (patch.state) row.state = patch.state
    if (patch.error !== undefined) row.error = patch.error
    const { data, error } = await this.db.from("crm_prospect_jobs").update(row).eq("id", id).select("*").maybeSingle()
    this.fail(error)
    return data ? toJob(data) : null
  }
}

// ---------------------------------------------------------------- demo ---
interface DemoLead extends Lead {
  token: string
}
interface DemoState {
  leads: DemoLead[]
  notes: Note[]
  templates: EmailTemplate[]
  logs: EmailLog[]
  activities: Activity[]
  suppressed: Map<string, string>
  jobs: (ProspectJob & { lockedUntil: number })[]
}

/** Påhittade personer och adresser (domäner under .example går aldrig att nå). */
function seed(): DemoState {
  const now = Date.now()
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString()
  const mk = (i: number, p: Partial<Lead> & Pick<Lead, "name" | "segment" | "status">, days: number): DemoLead => {
    const lead = {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      createdAt: ago(days),
      updatedAt: ago(days),
      title: "Personlig tränare",
      email: null,
      emailVerified: null,
      phone: null,
      instagram: null,
      instagramFollowers: null,
      websiteUrl: null,
      gym: null,
      city: null,
      specialties: [],
      source: "manual" as const,
      sourceUrl: null,
      legalBasis: "unknown" as const,
      unsubscribedAt: null,
      lastEmailedAt: null,
      statusChangedAt: ago(days),
      score: 0,
      scoreBreakdown: [],
      companyForm: "unknown" as const,
      orgNumber: null,
      preferredChannel: "email" as const,
      nextActionAt: null,
      nextActionNote: null,
      lastContactedAt: p.lastEmailedAt ?? null,
      meetingAt: null,
      convertedAt: null,
      companyType: "unknown" as const,
      companyTypeManual: false,
      enrichmentStatus: "pending" as const,
      enrichment: null,
      enrichedAt: null,
      verifiedAt: null,
      ...p,
    }
    lead.companyForm = impliedCompanyForm(lead.segment, lead.companyForm)
    const { score, breakdown } = scoreLead(lead)
    return { ...lead, score, scoreBreakdown: breakdown, token: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}` }
  }
  const leads = [
    mk(1, { name: "Elin Söderberg", segment: "freelance", status: "qualified", email: "elin@elinpt.example", emailVerified: true, phone: "+46701234567", instagram: "elin.pt.demo", websiteUrl: "https://elinpt.example", city: "Göteborg", specialties: ["Styrka", "Viktnedgång"], source: "url", sourceUrl: "https://elinpt.example", legalBasis: "consent", companyForm: "enskild" }, 2),
    mk(2, { name: "Amir Rahimi", segment: "gym_chain", status: "new", email: "amir.rahimi@gymkedjan.example", emailVerified: true, gym: "SATS", city: "Stockholm", specialties: ["Rehab", "Styrka"], legalBasis: "company" }, 1),
    mk(3, { name: "Viktor Lund", title: "Onlinecoach", segment: "influencer", status: "emailed", email: "hej@viktorcoaching.example", emailVerified: true, instagram: "viktorcoach.demo", websiteUrl: "https://viktorcoaching.example", city: "Malmö", specialties: ["Hyrox", "Löpning", "Onlinecoaching"], source: "url", sourceUrl: "https://linktr.ee/viktorcoach.demo", legalBasis: "consent", lastEmailedAt: ago(3), companyForm: "ab", orgNumber: "559012-3456" }, 9),
    mk(4, { name: "Maja Berg", segment: "gym_chain", status: "replied", email: "maja.berg@nordicgym.example", emailVerified: true, phone: "+46739876543", gym: "Nordic Wellness", city: "Göteborg", specialties: ["Gravid & mamma"], legalBasis: "company", lastEmailedAt: ago(20) }, 30),
    mk(5, { name: "Oskar Nyström", segment: "freelance", status: "customer", email: "oskar@nystrompt.example", emailVerified: true, websiteUrl: "https://nystrompt.example", city: "Uppsala", specialties: ["Styrka"], legalBasis: "consent", lastEmailedAt: ago(40) }, 55),
    mk(6, { name: "Linnea Holm", title: "Onlinecoach", segment: "influencer", status: "new", instagram: "linneaholm.demo", city: "Stockholm", specialties: ["Bodybuilding"] }, 0),
    mk(7, { name: "Sami Korhonen", segment: "freelance", status: "not_relevant", email: "sami@gammaldoman.example", emailVerified: false, city: "Umeå" }, 14),
    mk(8, { name: "Jonas Ek", segment: "gym_chain", status: "qualified", email: "jonas.ek@gymkedjan.example", emailVerified: true, gym: "SATS", city: "Malmö", specialties: ["Löpning"], legalBasis: "company" }, 4),
    mk(9, { name: "Amira Haddad", segment: "freelance", status: "new", email: "amira@haddadtraning.example", emailVerified: null, phone: "+46761112233", websiteUrl: "https://haddadtraning.example", city: "Västerås", specialties: ["Kost", "Viktnedgång"], source: "csv" }, 1),
  ]
  const templates: EmailTemplate[] = DEFAULT_TEMPLATES.map((t, i) => ({ id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, key: t.key, segment: t.segment, kind: t.kind, companyForm: t.companyForm, name: t.name, subject: t.subject, body: t.body, followupDays: t.followupDays, followupSubject: t.followupSubject, followupBody: t.followupBody, updatedAt: ago(1) }))
  const notes: Note[] = [{ id: randomUUID(), leadId: leads[3].id, body: "Svarade att hon vill se en demo efter jul. Följ upp vecka 2.", createdAt: ago(5) }]
  const logs: EmailLog[] = [
    { id: randomUUID(), leadId: leads[2].id, templateId: templates[3].id, createdAt: ago(3), toEmail: leads[2].email!, subject: "Onlinecoaching utan PDF:er och DM-kaos", body: "Hej Viktor, …", status: "delivered", scheduledAt: ago(3), sentAt: ago(3), deliveredAt: ago(3), resendId: "demo-1", error: null, step: 1, parentId: null, openedAt: null, openCount: 0 },
    { id: randomUUID(), leadId: leads[3].id, templateId: templates[2].id, createdAt: ago(20), toEmail: leads[3].email!, subject: "Dina PT-klienter mellan passen på Nordic Wellness", body: "Hej Maja, …", status: "delivered", scheduledAt: ago(20), sentAt: ago(20), deliveredAt: ago(20), resendId: "demo-2", error: null, step: 1, parentId: null, openedAt: null, openCount: 0 },
  ]
  const activities: Activity[] = [{ id: randomUUID(), leadId: leads[3].id, kind: "email_reply", body: "Vill se en demo efter jul", occurredAt: ago(5) }]
  return { leads, notes, templates, logs, activities, suppressed: new Map(), jobs: [] }
}

const globalDemo = globalThis as typeof globalThis & { __coaviraCrmDemo?: DemoState }
const demo = () => (globalDemo.__coaviraCrmDemo ??= seed())
/** Tester: börja om från startdatan. */
export const resetDemoStore = () => {
  globalDemo.__coaviraCrmDemo = seed()
}

/** Avregistreringsnyckeln lämnar aldrig servern. */
function strip(lead: DemoLead): Lead {
  const copy: Partial<DemoLead> = { ...lead }
  delete copy.token
  return copy as Lead
}
/** Avregistreringsnyckeln för en lead (bara för länken i mejlets sidfot). */
export const demoToken = (leadId: string) => demo().leads.find((l) => l.id === leadId)?.token ?? null

export class DemoStore implements CrmStore {
  private clash(input: LeadInput, exceptId?: string): SaveResult | null {
    const keys = [
      [emailKey(input.email), (l: Lead) => emailKey(l.email), "e-postadressen"],
      [instagramKey(input.instagram), (l: Lead) => instagramKey(l.instagram), "Instagram-kontot"],
      [websiteKey(input.websiteUrl), (l: Lead) => websiteKey(l.websiteUrl), "webbadressen"],
    ] as const
    for (const [key, of, field] of keys) {
      const hit = key && demo().leads.find((l) => l.id !== exceptId && of(l) === key)
      if (hit) return { duplicate: strip(hit), field }
    }
    return null
  }
  async listLeads() {
    return [...demo().leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(strip)
  }
  async getLead(id: string) {
    const l = demo().leads.find((x) => x.id === id)
    return l ? strip(l) : null
  }
  async getLeadByToken(token: string) {
    const l = demo().leads.find((x) => x.token === token)
    return l ? strip(l) : null
  }
  async unsubscribeToken(leadId: string) {
    return demoToken(leadId)
  }
  async createLead(input: LeadInput): Promise<SaveResult> {
    const dup = this.clash(input)
    if (dup) return dup
    const now = new Date().toISOString()
    const base: Lead = { id: randomUUID(), createdAt: now, updatedAt: now, name: "", title: null, segment: "freelance", status: "new", email: null, emailVerified: null, phone: null, instagram: null, instagramFollowers: null, websiteUrl: null, gym: null, city: null, specialties: [], source: "manual", sourceUrl: null, score: 0, scoreBreakdown: [], legalBasis: "unknown", unsubscribedAt: null, lastEmailedAt: null, statusChangedAt: now, companyForm: "unknown", orgNumber: null, preferredChannel: "email", nextActionAt: null, nextActionNote: null, lastContactedAt: null, meetingAt: null, convertedAt: null, companyType: "unknown", companyTypeManual: false, enrichmentStatus: "pending", enrichment: null, enrichedAt: null, verifiedAt: null }
    const merged = { ...base, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) } as Lead
    merged.companyForm = impliedCompanyForm(merged.segment, merged.companyForm)
    const { score, breakdown } = scoreLead(merged)
    const lead: DemoLead = { ...merged, score, scoreBreakdown: breakdown, token: randomUUID() }
    demo().leads.push(lead)
    return { lead: strip(lead) }
  }
  async updateLead(id: string, patch: ServerLeadPatch): Promise<SaveResult | null> {
    const i = demo().leads.findIndex((l) => l.id === id)
    if (i < 0) return null
    const current = demo().leads[i]
    const dup = this.clash({ ...current, ...patch }, id)
    if (dup) return dup
    const now = new Date().toISOString()
    const merged = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedAt: now } as DemoLead
    if (merged.status !== current.status) merged.statusChangedAt = now
    const { score, breakdown } = scoreLead(merged)
    demo().leads[i] = { ...merged, score, scoreBreakdown: breakdown }
    return { lead: strip(demo().leads[i]) }
  }
  async deleteLead(id: string) {
    const d = demo()
    d.leads = d.leads.filter((l) => l.id !== id)
    d.notes = d.notes.filter((n) => n.leadId !== id)
    d.logs = d.logs.filter((l) => l.leadId !== id)
    d.activities = d.activities.filter((a) => a.leadId !== id)
  }
  async listNotes(leadId: string) {
    return demo().notes.filter((n) => n.leadId === leadId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  async addNote(leadId: string, body: string) {
    const note: Note = { id: randomUUID(), leadId, body, createdAt: new Date().toISOString() }
    demo().notes.push(note)
    return note
  }
  async deleteNote(id: string) {
    demo().notes = demo().notes.filter((n) => n.id !== id)
  }
  async listTemplates() {
    return [...demo().templates]
  }
  async saveTemplate(t: TemplateInput) {
    const d = demo()
    const old = t.id ? d.templates.find((x) => x.id === t.id) : undefined
    const row = templateRow(t)
    const saved: EmailTemplate = {
      id: t.id ?? randomUUID(),
      key: old?.key ?? null,
      segment: row.segment,
      kind: row.kind,
      companyForm: row.company_form,
      name: row.name,
      subject: row.subject,
      body: row.body,
      followupDays: row.followup_days,
      followupSubject: row.followup_subject,
      followupBody: row.followup_body,
      updatedAt: new Date().toISOString(),
    }
    d.templates = t.id ? d.templates.map((x) => (x.id === t.id ? saved : x)) : [...d.templates, saved]
    return saved
  }
  async deleteTemplate(id: string) {
    demo().templates = demo().templates.filter((t) => t.id !== id)
  }
  async listLogs(opts: { leadId?: string; limit?: number } = {}) {
    return demo()
      .logs.filter((l) => !opts.leadId || l.leadId === opts.leadId)
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
      .slice(0, opts.limit ?? 500)
  }
  async createLogs(rows: NewLog[]) {
    const created = rows.map((r): EmailLog => ({ id: randomUUID(), createdAt: new Date().toISOString(), status: "queued", sentAt: null, deliveredAt: null, resendId: null, error: null, openedAt: null, openCount: 0, ...r, step: r.step ?? 1, parentId: r.parentId ?? null }))
    demo().logs.push(...created)
    return created
  }
  async updateLog(id: string, patch: LogPatch) {
    demo().logs = demo().logs.map((l) => (l.id === id ? { ...l, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } : l))
  }
  async findLogByResendId(resendId: string) {
    return demo().logs.find((l) => l.resendId === resendId) ?? null
  }
  async claimDue(limit: number) {
    const now = new Date().toISOString()
    const due = demo()
      .logs.filter((l) => l.status === "queued" && l.scheduledAt <= now)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, limit)
    for (const l of due) l.status = "sending"
    return due.map((l) => ({ ...l }))
  }
  async cancelQueued(filter: { leadId?: string; id?: string }, reason?: string) {
    let n = 0
    for (const l of demo().logs) {
      if (l.status !== "queued" || (filter.leadId && l.leadId !== filter.leadId) || (filter.id && l.id !== filter.id)) continue
      l.status = "cancelled"
      if (reason) l.error = reason
      n++
    }
    return n
  }
  async suppressedHashes(hashes: string[]) {
    return new Set(hashes.filter((h) => demo().suppressed.has(h)))
  }
  async suppress(email: string, reason: "unsubscribed" | "bounced" | "complained" | "manual") {
    if (!demo().suppressed.has(emailHash(email))) demo().suppressed.set(emailHash(email), reason)
  }
  async countSuppressed() {
    return demo().suppressed.size
  }
  async listActivities(opts: { leadId?: string; limit?: number } = {}) {
    return demo()
      .activities.filter((a) => !opts.leadId || a.leadId === opts.leadId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, opts.limit ?? 2000)
  }
  async addActivity(a: { leadId: string; kind: ActivityKind; body: string | null; occurredAt: string }) {
    const activity: Activity = { id: randomUUID(), ...a }
    demo().activities.push(activity)
    return activity
  }
  /** Demon har inga riktiga PT-konton att matcha mot. */
  async syncConversions() {
    return 0
  }
  async listJobs(limit = 10) {
    return [...demo().jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(stripJob)
  }
  async createJob(config: ProspectConfig, state: ProspectState) {
    const now = new Date().toISOString()
    const job = { id: randomUUID(), createdAt: now, updatedAt: now, status: "running" as const, config, state, error: null, lockedUntil: 0 }
    demo().jobs.push(job)
    return stripJob(job)
  }
  async claimJob(id: string) {
    const job = demo().jobs.find((j) => j.id === id)
    if (!job || job.status !== "running" || job.lockedUntil > Date.now()) return null
    job.lockedUntil = Date.now() + LOCK_MS
    return stripJob(structuredClone(job))
  }
  async saveJob(id: string, patch: { status?: ProspectStatus; state?: ProspectState; error?: string | null }) {
    const job = demo().jobs.find((j) => j.id === id)
    if (!job) return null
    Object.assign(job, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: new Date().toISOString(), lockedUntil: 0 })
    return stripJob(structuredClone(job))
  }
}

function stripJob(job: ProspectJob & { lockedUntil?: number }): ProspectJob {
  const copy: Partial<typeof job> = { ...job }
  delete copy.lockedUntil
  return copy as ProspectJob
}
