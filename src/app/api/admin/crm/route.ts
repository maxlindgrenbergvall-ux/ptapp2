import { NextResponse } from "next/server"
import { z } from "zod"

import { ApifyError, apifyConfigured, getItems, getRun, startRun } from "@/lib/crm/apify"
import { getAdminContext, systemStore } from "@/lib/crm/auth"
import { enrichFromUrl } from "@/lib/crm/enrich"
import { FetchError } from "@/lib/crm/fetch-public"
import { queueConfig, runQueue, senderConfigured } from "@/lib/crm/queue"
import { searchCandidates, searchConfigured } from "@/lib/crm/search"
import { initialState, stepJob } from "@/lib/crm/prospect"
import { DEFAULT_CONFIG } from "@/lib/crm/prospect-types"
import { hashtagInput, MAX_HASHTAG_POSTS, MAX_PROFILES_PER_RUN, ownersFromPosts, profileToCandidate, profilesInput } from "@/lib/crm/instagram"
import { buildOutreach, verifyEmail } from "@/lib/crm/service"
import { emailHash } from "@/lib/crm/store"
import { legalBasisFor } from "@/lib/crm/compliance"
import { activityEffect } from "@/lib/crm/stats"
import { senderName } from "@/lib/crm/templates"
import { ACTIVITY_KINDS, CHANNELS, CITIES, COMPANY_FORMS, emailKey, ENGAGED, instagramKey, LEGAL_BASES, SEGMENTS, STATUSES, type Lead, type LeadInput, type ServerLeadPatch } from "@/lib/crm/types"
import { missingMigration } from "@/lib/crm/migrations"
import { rateLimited, tooManyRequests } from "@/lib/rate-limit"

/**
 * POST /api/admin/crm  { action, … }  (v47)
 *
 * Alla CRM-åtgärder för /admin/leads går genom den här rutten. Varje anrop:
 *   1. kräver en inloggad administratör (getAdminContext → is_admin() i databasen),
 *   2. valideras med zod (okända fält avvisas),
 *   3. körs med administratörens egen session, så att RLS gäller.
 * Den som inte är administratör får 404 – rutten avslöjar inte att den finns.
 * proxy.ts avvisar dessutom skrivande anrop från andra webbplatser (CSRF).
 */
const uuid = z.uuid()
const text = (max: number) => z.string().trim().max(max)
const nullable = <T extends z.ZodType>(t: T) => t.nullable().optional()

const leadFields = z
  .object({
    name: text(160).min(1),
    title: nullable(text(160)),
    segment: z.enum(SEGMENTS),
    status: z.enum(STATUSES),
    email: nullable(z.email().max(254).transform((e) => e.toLowerCase())),
    emailVerified: nullable(z.boolean()),
    phone: nullable(z.string().regex(/^\+[1-9]\d{7,14}$/, "Telefon ska anges som +46…")),
    instagram: nullable(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, "Ange Instagram som kontonamn utan @")),
    instagramFollowers: nullable(z.number().int().min(0).max(2_000_000_000)),
    websiteUrl: nullable(z.url({ protocol: /^https?$/ }).max(500)),
    gym: nullable(text(120)),
    city: nullable(text(80)),
    specialties: z.array(text(40).min(1)).max(12),
    source: z.enum(["manual", "csv", "url", "search", "instagram"]),
    sourceUrl: nullable(z.url({ protocol: /^https?$/ }).max(500)),
    legalBasis: z.enum(LEGAL_BASES),
    // v53
    companyForm: z.enum(COMPANY_FORMS),
    // Bara aktiebolagets nummer (börjar på 5) – ett personnummer avvisas.
    orgNumber: nullable(z.string().trim().regex(/^5\d{5}-?\d{4}$/, "Organisationsnummer för aktiebolag: 5xxxxx-xxxx").transform((v) => (v.includes("-") ? v : `${v.slice(0, 6)}-${v.slice(6)}`))),
    preferredChannel: z.enum(CHANNELS),
    nextActionAt: nullable(z.iso.datetime({ offset: true })),
    nextActionNote: nullable(text(200)),
    meetingAt: nullable(z.iso.datetime({ offset: true })),
  })
  .partial()
  .strict()

/**
 * v53: bolagsformen styr rättslig grund (om den inte anges uttryckligen) och
 * organisationsnumret finns bara kvar för aktiebolag.
 */
function withCompanyRules(patch: LeadInput, current?: Pick<Lead, "legalBasis" | "companyForm">): LeadInput {
  const out = { ...patch }
  if (out.companyForm && out.legalBasis === undefined) out.legalBasis = legalBasisFor(out.companyForm, current?.legalBasis ?? "unknown")
  const form = out.companyForm ?? current?.companyForm ?? "unknown"
  if (form !== "ab" && (out.companyForm !== undefined || out.orgNumber)) out.orgNumber = null
  return out
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bootstrap") }).strict(),
  z.object({ action: z.literal("lead.create"), lead: leadFields.required({ name: true }) }).strict(),
  z.object({ action: z.literal("lead.update"), id: uuid, patch: leadFields }).strict(),
  z.object({ action: z.literal("lead.delete"), id: uuid }).strict(),
  z.object({ action: z.literal("lead.bulk"), ids: z.array(uuid).min(1).max(500), patch: leadFields.pick({ status: true, legalBasis: true, segment: true, companyForm: true }) }).strict(),
  z.object({
    action: z.literal("activity.log"),
    leadId: uuid,
    kind: z.enum(ACTIVITY_KINDS),
    body: nullable(text(2000)),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
    meetingAt: nullable(z.iso.datetime({ offset: true })),
  }).strict(),
  z.object({ action: z.literal("conversions.sync") }).strict(),
  z.object({ action: z.literal("lead.import"), leads: z.array(leadFields.required({ name: true })).min(1).max(2000) }).strict(),
  z.object({ action: z.literal("lead.verify"), ids: z.array(uuid).min(1).max(50) }).strict(),
  z.object({ action: z.literal("lead.detail"), id: uuid }).strict(),
  z.object({ action: z.literal("enrich.preview"), url: z.string().trim().min(4).max(500) }).strict(),
  z.object({ action: z.literal("note.add"), leadId: uuid, body: text(4000).min(1) }).strict(),
  z.object({ action: z.literal("note.delete"), id: uuid }).strict(),
  z.object({
    action: z.literal("template.save"),
    template: z
      .object({
        id: uuid.optional(),
        segment: z.enum(SEGMENTS).nullable(),
        kind: z.enum(["intro", "research"]).default("intro"),
        companyForm: z.enum(COMPANY_FORMS).nullable().default(null),
        name: text(120).min(1),
        subject: text(200).min(1),
        body: z.string().trim().min(1).max(8000),
        followupDays: z.number().int().min(2).max(14).nullable().default(null),
        followupSubject: text(200).nullable().default(null),
        followupBody: z.string().trim().max(4000).nullable().default(null),
        // Följer med när en hel mall skickas tillbaka – ignoreras (startmallens nyckel kan inte ändras).
        key: z.string().max(60).nullable().optional(),
        updatedAt: z.string().max(40).optional(),
      })
      .strict(),
  }).strict(),
  z.object({ action: z.literal("template.delete"), id: uuid }).strict(),
  z.object({ action: z.literal("outreach.preview"), leadIds: z.array(uuid).min(1).max(200), templateId: uuid.nullable() }).strict(),
  z.object({ action: z.literal("outreach.schedule"), leadIds: z.array(uuid).min(1).max(200), templateId: uuid.nullable() }).strict(),
  z.object({ action: z.literal("queue.cancel"), id: uuid }).strict(),
  z.object({ action: z.literal("queue.run") }).strict(),
  z.object({ action: z.literal("lead.findEmail"), id: uuid }).strict(),
  z.object({
    action: z.literal("instagram.start"),
    request: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("profiles"), handles: z.array(z.string().regex(/^[A-Za-z0-9._]{1,30}$/)).min(1).max(MAX_PROFILES_PER_RUN) }).strict(),
      z.object({ mode: z.literal("hashtag"), hashtag: z.string().regex(/^[\p{L}\p{N}_]{2,60}$/u), limit: z.number().int().min(1).max(MAX_HASHTAG_POSTS) }).strict(),
    ]),
  }).strict(),
  z.object({
    action: z.literal("prospect.start"),
    config: z
      .object({
        target: z.number().int().min(1).max(50),
        minScore: z.number().int().min(1).max(100),
        hashtags: z.array(z.string().regex(/^[\p{L}\p{N}_]{2,60}$/u)).min(1).max(30),
        seeds: z.array(z.string().regex(/^[A-Za-z0-9._]{1,30}$/)).max(50),
        cities: z.array(z.enum(CITIES)).max(20),
        maxProfiles: z.number().int().min(25).max(1000),
      })
      .partial()
      .strict(),
  }).strict(),
  z.object({ action: z.literal("prospect.step"), id: uuid }).strict(),
  z.object({ action: z.literal("prospect.stop"), id: uuid }).strict(),
  z.object({ action: z.literal("prospect.list") }).strict(),
  z.object({ action: z.literal("instagram.result"), runId: z.string().regex(/^[A-Za-z0-9]{6,40}$/), mode: z.enum(["profiles", "hashtag"]) }).strict(),
  z.object({ action: z.literal("search"), query: z.object({ segment: z.enum(SEGMENTS), city: text(80).optional(), specialty: text(60).optional(), gym: text(80).optional() }).strict() }).strict(),
])

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const ctx = await getAdminContext()
  if (!ctx) return bad("Hittades inte", 404)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Ogiltig förfrågan")
  const input = parsed.data
  const { store } = ctx
  const limitKey = ctx.userId ?? "demo"

  try {
    switch (input.action) {
      case "bootstrap": {
        // v53: leads som registrerat ett PT-konto blir kunder automatiskt (matchas på e-post).
        const converted = await store.syncConversions().catch(() => 0)
        const [leads, templates, logs, suppressed, activities] = await Promise.all([store.listLeads(), store.listTemplates(), store.listLogs({ limit: 1000 }), store.countSuppressed(), store.listActivities({ limit: 2000 })])
        return NextResponse.json({
          leads,
          templates,
          logs,
          suppressed,
          activities,
          converted,
          config: { demo: ctx.demo, search: searchConfigured(), instagram: apifyConfigured(), sender: senderConfigured(), senderName: senderName(process.env), queue: queueConfig() },
        })
      }
      case "lead.create": {
        const lead = withCompanyRules(input.lead as LeadInput)
        // En avregistrerad adress får inte komma tillbaka in i CRM:et.
        if (lead.email && (await store.suppressedHashes([emailHash(lead.email)])).size) return bad("Adressen har avregistrerat sig och kan inte läggas till igen.", 409)
        if (lead.email && lead.emailVerified == null) lead.emailVerified = await verifyEmail(lead.email)
        const result = await store.createLead(lead)
        return result.lead ? NextResponse.json({ lead: result.lead }) : NextResponse.json({ error: `En lead med ${result.field} finns redan: ${result.duplicate.name}`, duplicate: result.duplicate }, { status: 409 })
      }
      case "lead.update": {
        const current = await store.getLead(input.id)
        if (!current) return bad("Leaden finns inte längre", 404)
        const patch = withCompanyRules(input.patch as LeadInput, current)
        // Ny adress → ny MX-kontroll (den gamla kontrollen gäller inte den nya domänen).
        if (patch.email !== undefined && patch.email !== current.email) {
          if (patch.email && (await store.suppressedHashes([emailHash(patch.email)])).size) return bad("Adressen har avregistrerat sig och kan inte användas.", 409)
          patch.emailVerified = await verifyEmail(patch.email)
        }
        const result = await store.updateLead(input.id, patch)
        if (!result) return bad("Leaden finns inte längre", 404)
        // Svar, bokat samtal, kund eller ej aktuell: inga fler automatiska mejl (även uppföljningar).
        if (result.lead && patch.status && patch.status !== current.status && (ENGAGED.includes(patch.status) || patch.status === "not_relevant")) {
          await store.cancelQueued({ leadId: input.id }, "Pausad – leaden har gått vidare i flödet")
        }
        return result.lead ? NextResponse.json({ lead: result.lead }) : NextResponse.json({ error: `En annan lead har redan ${result.field}: ${result.duplicate.name}`, duplicate: result.duplicate }, { status: 409 })
      }
      case "lead.delete":
        await store.deleteLead(input.id)
        return NextResponse.json({ ok: true })
      case "lead.bulk": {
        const updated = []
        for (const id of input.ids) {
          const current = await store.getLead(id)
          if (!current) continue
          const patch = withCompanyRules(input.patch as LeadInput, current)
          const r = await store.updateLead(id, patch)
          if (r?.lead) updated.push(r.lead)
          if (r?.lead && patch.status && (ENGAGED.includes(patch.status) || patch.status === "not_relevant")) await store.cancelQueued({ leadId: id }, "Pausad – leaden har gått vidare i flödet")
        }
        return NextResponse.json({ leads: updated })
      }
      case "lead.import": {
        const emails = input.leads.map((l) => l.email).filter((e): e is string => Boolean(e))
        const suppressed = await store.suppressedHashes(emails.map(emailHash))
        const created = []
        let duplicates = 0
        let blocked = 0
        for (const lead of (input.leads as LeadInput[]).map((l) => withCompanyRules(l))) {
          if (lead.email && suppressed.has(emailHash(lead.email))) {
            blocked++
            continue
          }
          const r = await store.createLead({ ...lead, source: "csv" })
          if (r.lead) created.push(r.lead)
          else duplicates++
        }
        return NextResponse.json({ leads: created, duplicates, blocked })
      }
      case "lead.verify": {
        const updated = []
        for (const id of input.ids) {
          const lead = await store.getLead(id)
          if (!lead?.email) continue
          const r = await store.updateLead(id, { emailVerified: await verifyEmail(lead.email) })
          if (r?.lead) updated.push(r.lead)
        }
        return NextResponse.json({ leads: updated })
      }
      case "lead.detail": {
        const [notes, logs, activities] = await Promise.all([store.listNotes(input.id), store.listLogs({ leadId: input.id, limit: 50 }), store.listActivities({ leadId: input.id, limit: 100 })])
        return NextResponse.json({ notes, logs, activities })
      }
      case "activity.log": {
        // Snabbloggning (v53): DM, svar, samtal, konvertering. Statusen går bara framåt.
        const lead = await store.getLead(input.leadId)
        if (!lead) return bad("Leaden finns inte längre", 404)
        const at = input.occurredAt ?? new Date().toISOString()
        if (input.kind === "call_booked" && !input.meetingAt) return bad("Ange när samtalet är", 400)
        const activity = await store.addActivity({ leadId: lead.id, kind: input.kind, body: input.body ?? null, occurredAt: at })
        const effect = activityEffect(input.kind, lead, at, input.meetingAt)
        const patch: ServerLeadPatch = { ...effect.patch }
        // En bokad tid ersätter en gammal påminnelse.
        if (input.kind === "call_booked") Object.assign(patch, { nextActionAt: null, nextActionNote: null })
        const saved = Object.keys(patch).length ? await store.updateLead(lead.id, patch) : { lead }
        const cancelled = effect.cancelQueued ? await store.cancelQueued({ leadId: lead.id }, "Pausad – leaden har svarat") : 0
        return NextResponse.json({ activity, lead: saved?.lead ?? lead, cancelled })
      }
      case "conversions.sync": {
        const converted = await store.syncConversions()
        return NextResponse.json({ converted, leads: converted ? await store.listLeads() : undefined })
      }
      case "enrich.preview": {
        if (await rateLimited(`crm-enrich:${limitKey}`, 120, 3600)) return tooManyRequests(600)
        const url = /^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`
        try {
          return NextResponse.json(await enrichFromUrl(url))
        } catch (e) {
          if (e instanceof FetchError) return bad(e.message, 422)
          throw e
        }
      }
      case "note.add":
        return NextResponse.json({ note: await store.addNote(input.leadId, input.body) })
      case "note.delete":
        await store.deleteNote(input.id)
        return NextResponse.json({ ok: true })
      case "template.save": {
        const t = input.template
        if (t.followupDays && !t.followupBody?.trim()) return bad("Skriv texten för uppföljningen, eller stäng av den.")
        const { key: _key, updatedAt: _updated, ...fields } = t
        void _key
        void _updated
        return NextResponse.json({ template: await store.saveTemplate({ ...fields, followupBody: fields.followupBody?.trim() || null, followupDays: fields.followupBody?.trim() ? fields.followupDays : null }) })
      }
      case "template.delete":
        await store.deleteTemplate(input.id)
        return NextResponse.json({ ok: true })
      case "outreach.preview":
        return NextResponse.json({ items: await buildOutreach(store, input.leadIds, input.templateId), queue: queueConfig(), sender: senderConfigured() })
      case "outreach.schedule": {
        // Räknas om på servern – det som köas är aldrig något webbläsaren skickat in.
        const items = (await buildOutreach(store, input.leadIds, input.templateId)).filter((i) => !i.blockers.length && i.email && i.scheduledAt)
        if (!items.length) return bad("Ingen av de valda kan få ett mejl just nu.", 409)
        const logs = await store.createLogs(items.map((i) => ({ leadId: i.leadId, templateId: i.templateId, toEmail: i.email!, subject: i.subject, body: i.body, scheduledAt: i.scheduledAt! })))
        return NextResponse.json({ logs, skipped: input.leadIds.length - items.length })
      }
      case "queue.cancel":
        return NextResponse.json({ cancelled: await store.cancelQueued({ id: input.id }) })
      case "queue.run": {
        // Kön körs med serverns behörighet (låser rader i databasen); administratören har redan verifierats ovan.
        const result = await runQueue(systemStore() ?? store)
        return NextResponse.json({ result, logs: await store.listLogs({ limit: 1000 }), leads: result.sent || result.cancelled ? await store.listLeads() : undefined })
      }
      case "lead.findEmail": {
        // Leta upp e-post (och telefon) på leadens egen webbplats – samma hänsynsfulla hämtning som fliken Webbsida.
        const lead = await store.getLead(input.id)
        if (!lead) return bad("Leaden finns inte längre", 404)
        if (!lead.websiteUrl) return bad("Leaden har ingen webbplats att leta på", 409)
        if (await rateLimited(`crm-enrich:${limitKey}`, 120, 3600)) return tooManyRequests(600)
        try {
          const found = await enrichFromUrl(lead.websiteUrl)
          const email = found.suggestion.email
          const patch: LeadInput = {}
          if (!lead.email && email && !(await store.suppressedHashes([emailHash(email)])).size) {
            patch.email = email
            patch.emailVerified = found.suggestion.emailVerified
          }
          if (!lead.phone && found.suggestion.phone) patch.phone = found.suggestion.phone
          if (!lead.city && found.suggestion.city) patch.city = found.suggestion.city
          if (!Object.keys(patch).length) return NextResponse.json({ lead, found: false })
          const r = await store.updateLead(lead.id, patch)
          // En annan lead har redan adressen: lämna den här orörd.
          return NextResponse.json({ lead: r?.lead ?? lead, found: Boolean(r?.lead && patch.email) })
        } catch (e) {
          if (e instanceof FetchError) return bad(e.message, 422)
          throw e
        }
      }
      case "instagram.start": {
        if (!apifyConfigured()) return bad("Instagram är inte konfigurerat (APIFY_TOKEN saknas på servern).", 503)
        if (await rateLimited(`crm-apify:${limitKey}`, 30, 3600)) return tooManyRequests(600)
        const req = input.request
        try {
          const run =
            req.mode === "profiles" ? await startRun(profilesInput(req.handles), req.handles.length) : await startRun(hashtagInput(req.hashtag, req.limit), req.limit)
          return NextResponse.json({ runId: run.id, status: run.status })
        } catch (e) {
          if (e instanceof ApifyError) return bad(e.message, e.status >= 500 ? 502 : 422)
          throw e
        }
      }
      case "prospect.start": {
        if (!apifyConfigured()) return bad("Instagram är inte konfigurerat (APIFY_TOKEN saknas på servern).", 503)
        if ((await store.listJobs(20)).some((j) => j.status === "running")) return bad("Ett jobb pågår redan – stoppa det eller vänta tills det är klart.", 409)
        const config = { ...DEFAULT_CONFIG, ...input.config }
        const existing = (await store.listLeads()).map((l) => l.instagram).filter((h): h is string => Boolean(h))
        return NextResponse.json({ job: await store.createJob(config, initialState(config, existing)) })
      }
      case "prospect.step": {
        if (!apifyConfigured()) return bad("Instagram är inte konfigurerat (APIFY_TOKEN saknas på servern).", 503)
        const job = await stepJob(store, input.id)
        // null = ett annat steg pågår just nu (t.ex. det schemalagda anropet) – visa läget som det är.
        return NextResponse.json({ job: job ?? (await store.listJobs(20)).find((j) => j.id === input.id) ?? null })
      }
      case "prospect.stop": {
        const job = await store.saveJob(input.id, { status: "stopped" })
        return job ? NextResponse.json({ job }) : bad("Jobbet finns inte", 404)
      }
      case "prospect.list":
        return NextResponse.json({ jobs: await store.listJobs(10) })
      case "instagram.result": {
        if (!apifyConfigured()) return bad("Instagram är inte konfigurerat (APIFY_TOKEN saknas på servern).", 503)
        try {
          const run = await getRun(input.runId)
          if (run.status === "READY" || run.status === "RUNNING") return NextResponse.json({ status: run.status, done: false })
          if (run.status !== "SUCCEEDED" || !run.datasetId) return NextResponse.json({ status: run.status, done: true, error: "Apify-körningen misslyckades eller avbröts. Försök igen om en stund." })
          const items = await getItems(run.datasetId, input.mode === "profiles" ? MAX_PROFILES_PER_RUN : MAX_HASHTAG_POSTS)
          if (input.mode === "hashtag") return NextResponse.json({ status: run.status, done: true, handles: ownersFromPosts(items) })
          // Markera konton som redan finns i CRM:et (samma Instagram-konto eller e-post).
          const existing = await store.listLeads()
          const byIg = new Map(existing.filter((l) => l.instagram).map((l) => [instagramKey(l.instagram), l]))
          const byEmail = new Map(existing.filter((l) => l.email).map((l) => [emailKey(l.email), l]))
          const candidates = items
            .map(profileToCandidate)
            .filter((c): c is NonNullable<typeof c> => Boolean(c))
            .map((c) => {
              const dup = byIg.get(instagramKey(c.handle)) ?? (c.lead.email ? byEmail.get(emailKey(c.lead.email)) : undefined)
              return { ...c, existing: dup ? { id: dup.id, name: dup.name } : null }
            })
          return NextResponse.json({ status: run.status, done: true, candidates })
        } catch (e) {
          if (e instanceof ApifyError) return bad(e.message, e.status >= 500 ? 502 : 422)
          throw e
        }
      }
      case "search": {
        if (!searchConfigured()) return bad("Sökningen är inte konfigurerad (BRAVE_SEARCH_API_KEY saknas på servern).", 503)
        if (await rateLimited(`crm-search:${limitKey}`, 60, 3600)) return tooManyRequests(600)
        return NextResponse.json({ candidates: await searchCandidates(input.query) })
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error("crm", { action: input.action, message })
    // En tabell eller kolumn saknas = en migration är inte körd. Säg vilken, i stället för "något gick fel".
    const missing = missingMigration(message)
    if (missing) return NextResponse.json({ error: `Databasen saknar ${missing.what}. Kör migrationen ${missing.file} i Supabase (SQL Editor) och ladda om sidan.`, migration: missing.file }, { status: 503 })
    // Rutten svarar bara administratörer (andra får 404), så den faktiska orsaken får visas – det sparar felsökning.
    return bad(`Något gick fel: ${message.slice(0, 240)}`, 500)
  }
}

