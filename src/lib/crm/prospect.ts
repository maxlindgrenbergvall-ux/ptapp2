import "server-only"

import { ApifyError, getItems, getRun, startRun } from "@/lib/crm/apify"
import { contactLinks, extractContacts } from "@/lib/crm/extract"
import { FetchError, fetchPublicPage } from "@/lib/crm/fetch-public"
import { hashtagInput, profilesInput, profileToCandidate } from "@/lib/crm/instagram"
import { hasMx } from "@/lib/crm/mx"
import type { PendingCandidate, ProspectConfig, ProspectJob, ProspectState } from "@/lib/crm/prospect-types"
import { emailVerdict } from "@/lib/crm/quality"
import { scoreLead } from "@/lib/crm/score"
import { emailHash, type CrmStore } from "@/lib/crm/store"
import { instagramKey } from "@/lib/crm/types"

/**
 * Automatisk prospektering (v50). Ett jobb letar i många små steg:
 *
 *   hashtaggar ──Apify──▶ kontona bakom inläggen ─┐
 *   kända PT-konton ───────────────────────────────┼─▶ profiler (Apify) ─▶ sållning ─▶ e-postkontroll ─▶ lead
 *   liknande konton till godkända PT:er ◀──────────┘
 *
 * Bara konton som klarar ALLA krav sparas som leads:
 *   1. en riktig personlig tränare/coach (inte kennel, salong, butik, gymkedjans eget konto)
 *   2. i Sverige
 *   3. inte privat och inte redan i CRM:et
 *   4. en DIREKT e-postadress (personens namn, inte info@/kontakt@/hej@) – ur profilen
 *      eller från personens egen webbplats
 *   5. e-postdomänen tar emot post (MX) och adressen är inte avregistrerad
 *   6. Lead Score minst config.minScore (och ort enligt config.cities, om angivet)
 * Allt som sorteras bort räknas per skäl, så att man ser varför.
 *
 * Ett steg tar högst ~20 sekunder (en serverfunktion får inte vänta längre) och
 * sparar sitt läge i databasen. Stegen tas när CRM:et är öppet (var femte sekund)
 * eller av det schemalagda anropet till /api/crm/queue – jobbet fortsätter alltså
 * över tid, även efter att sidan laddats om.
 */

const STEP_BUDGET_MS = 20_000
const PROFILES_PER_RUN = 25
const POSTS_PER_HASHTAG = 50
const MAX_SEEN = 4000
const MAX_RUNS = 60

export function initialState(config: ProspectConfig, existingHandles: string[]): ProspectState {
  const seeds = [...new Set(config.seeds.map((h) => h.toLowerCase()))]
  return {
    hashtagQueue: [...config.hashtags],
    profileQueue: seeds,
    seen: [...new Set([...existingHandles.map((h) => h.toLowerCase()), ...seeds])].slice(-MAX_SEEN),
    run: null,
    pending: [],
    found: [],
    stats: { runs: 0, profilesFetched: 0, checked: 0, rejected: {} },
    log: [{ at: new Date().toISOString(), text: `Startat: letar efter ${config.target} leads med Lead Score minst ${config.minScore}.` }],
  }
}

const reject = (state: ProspectState, reason: string) => {
  state.stats.rejected[reason] = (state.stats.rejected[reason] ?? 0) + 1
}
const log = (state: ProspectState, text: string) => {
  state.log = [...state.log, { at: new Date().toISOString(), text }].slice(-40)
}

/** Lägg till konton i kön som inte redan setts. */
function enqueue(state: ProspectState, handles: string[], front = false) {
  const seen = new Set(state.seen)
  const fresh = handles.map((h) => h.toLowerCase()).filter((h) => !seen.has(h))
  const unique = [...new Set(fresh)]
  if (!unique.length) return 0
  state.profileQueue = front ? [...unique, ...state.profileQueue] : [...state.profileQueue, ...unique]
  state.seen = [...state.seen, ...unique].slice(-MAX_SEEN)
  return unique.length
}

/**
 * Hitta en direkt, verifierad e-postadress: först den i profilen, sedan på personens
 * egen webbplats (startsidan och högst en kontaktsida, robots.txt respekteras).
 */
async function findDirectEmail(c: PendingCandidate, deadline: number): Promise<{ email: string | null; phone: string | null; city: string | null; reason: string | null }> {
  const tried: string[] = []
  const accept = async (email: string) => {
    tried.push(email)
    if (emailVerdict(email, c.name, c.handle) !== "direct") return false
    return (await hasMx(email)) === true
  }
  if (c.email && (await accept(c.email))) return { email: c.email, phone: c.phone, city: c.city, reason: null }
  if (!c.websiteUrl || Date.now() > deadline) return { email: null, phone: c.phone, city: c.city, reason: tried.length ? reasonFor(tried, c) : "Ingen e-postadress" }
  let phone = c.phone
  let city = c.city
  try {
    const pages = [await fetchPublicPage(c.websiteUrl)]
    const first = extractContacts(pages[0].html, pages[0].url)
    const emails = [...first.emails]
    phone ??= first.phones[0] ?? null
    city ??= first.city
    const contact = contactLinks(pages[0].html, pages[0].url)[0]
    if (!emails.some((e) => emailVerdict(e, c.name, c.handle) === "direct") && contact && Date.now() < deadline) {
      const more = extractContacts((await fetchPublicPage(contact)).html, contact)
      emails.push(...more.emails)
      phone ??= more.phones[0] ?? null
      city ??= more.city
    }
    for (const e of [...new Set(emails)]) if (await accept(e)) return { email: e, phone, city, reason: null }
  } catch (e) {
    if (!(e instanceof FetchError)) throw e
  }
  return { email: null, phone, city, reason: tried.length ? reasonFor(tried, c) : "Ingen e-postadress" }
}
function reasonFor(tried: string[], c: PendingCandidate) {
  const verdicts = tried.map((e) => emailVerdict(e, c.name, c.handle))
  if (verdicts.includes("direct")) return "E-postdomänen tar inte emot post"
  if (verdicts.includes("role")) return "Bara en gemensam adress (info@, kontakt@ …)"
  return "E-posten är inte personens egen"
}

/** Kontrollera en kandidat fullt ut och spara den som lead om den klarar kraven. */
async function qualify(store: CrmStore, job: ProspectJob, c: PendingCandidate, deadline: number) {
  const { state, config } = job
  const contact = await findDirectEmail(c, deadline)
  if (!contact.email) return reject(state, contact.reason ?? "Ingen direkt e-postadress")
  if ((await store.suppressedHashes([emailHash(contact.email)])).size) return reject(state, "Har avregistrerat sig tidigare")
  const city = contact.city ?? c.city
  if (config.cities.length && !(city && config.cities.includes(city))) return reject(state, "Annan ort än de valda")
  const lead = {
    name: c.name,
    title: c.title,
    segment: c.segment,
    email: contact.email,
    emailVerified: true,
    phone: contact.phone,
    instagram: c.handle,
    instagramFollowers: c.followers,
    websiteUrl: c.websiteUrl,
    gym: c.gym,
    city,
    specialties: c.specialties,
    source: "instagram" as const,
    sourceUrl: `https://www.instagram.com/${c.handle}/`,
  }
  const { score } = scoreLead({ ...lead, phone: lead.phone ?? null, city: lead.city ?? null })
  if (score < config.minScore) return reject(state, `Lead Score under ${config.minScore}`)
  const saved = await store.createLead(lead)
  if (!saved.lead) return reject(state, "Finns redan i CRM:et")
  state.found.push({ leadId: saved.lead.id, name: saved.lead.name, handle: c.handle, email: contact.email, score: saved.lead.score, city: saved.lead.city })
  log(state, `✓ ${saved.lead.name} (@${c.handle}) – ${contact.email}, Lead Score ${saved.lead.score}`)
}

/** Sålla en hämtad profil: bara riktiga PT:er i Sverige, inte privata, inte redan i CRM:et. */
function screen(state: ProspectState, item: Record<string, unknown>, existing: Set<string>) {
  const c = profileToCandidate(item)
  if (!c) return reject(state, "Profilen kunde inte läsas")
  state.stats.checked++
  // Liknande konton till en riktig PT är ofta också PT:er – sök dem tidigt.
  if (c.isTrainer && c.related.length) enqueue(state, c.related, true)
  if (c.isPrivate) return reject(state, "Privat konto")
  if (existing.has(instagramKey(c.handle)!)) return reject(state, "Finns redan i CRM:et")
  if (!c.isTrainer) return reject(state, "Inte en personlig tränare")
  if (!c.isSwedish) return reject(state, "Inte i Sverige")
  if (!c.lead.email && !c.lead.websiteUrl) return reject(state, "Ingen e-post eller webbplats")
  state.pending.push({
    handle: c.handle,
    name: c.lead.name ?? c.handle,
    email: c.lead.email ?? null,
    phone: c.lead.phone ?? null,
    websiteUrl: c.lead.websiteUrl ?? null,
    city: c.lead.city ?? null,
    gym: c.lead.gym ?? null,
    title: c.lead.title ?? null,
    segment: c.lead.segment ?? "freelance",
    specialties: c.lead.specialties ?? [],
    followers: c.followers,
  })
}

/**
 * Ett steg i jobbet. Låser jobbet, gör så mycket som ryms i tidsbudgeten och
 * sparar läget. Returnerar jobbet som det ser ut efteråt (eller null om ett annat
 * steg redan pågår).
 */
export async function stepJob(store: CrmStore, jobId: string): Promise<ProspectJob | null> {
  const job = await store.claimJob(jobId)
  if (!job) return null
  const { state, config } = job
  const deadline = Date.now() + STEP_BUDGET_MS
  let status: ProspectJob["status"] = "running"
  let error: string | null = null
  try {
    const existing = new Set((await store.listLeads()).map((l) => instagramKey(l.instagram)).filter((h): h is string => Boolean(h)))
    while (Date.now() < deadline) {
      if (state.found.length >= config.target) {
        status = "done"
        log(state, `Klart: ${state.found.length} leads hittade.`)
        break
      }
      // 1. Kandidater som väntar på e-postkontroll – en i taget.
      if (state.pending.length) {
        await qualify(store, job, state.pending.shift()!, deadline)
        continue
      }
      // 2. En Apify-körning pågår: läs av den.
      if (state.run) {
        const run = await getRun(state.run.id)
        if (run.status === "READY" || run.status === "RUNNING") break
        const finished = state.run
        state.run = null
        if (run.status !== "SUCCEEDED" || !run.datasetId) {
          log(state, `Apify-körningen för ${finished.label} misslyckades (${run.status}) – fortsätter med nästa.`)
          continue
        }
        if (finished.kind === "hashtag") {
          const owners = (await getItems(run.datasetId, POSTS_PER_HASHTAG))
            .map((p) => String(p.ownerUsername ?? (p.owner as { username?: string } | undefined)?.username ?? ""))
            .filter(Boolean)
          const added = enqueue(state, owners)
          log(state, `#${finished.label}: ${added} nya konton att granska.`)
        } else {
          const before = state.pending.length
          for (const item of await getItems(run.datasetId, PROFILES_PER_RUN)) screen(state, item, existing)
          log(state, `Granskade ${finished.label}: ${state.pending.length - before} klarade första sållningen.`)
        }
        continue
      }
      if (state.stats.runs >= MAX_RUNS) {
        status = "exhausted"
        log(state, "Slutade: högsta antalet Apify-körningar för ett jobb är nått.")
        break
      }
      // 3. Profiler i kön → en Apify-körning (inom kostnadstaket).
      const room = config.maxProfiles - state.stats.profilesFetched
      if (state.profileQueue.length && room > 0) {
        const batch = state.profileQueue.splice(0, Math.min(PROFILES_PER_RUN, room))
        const run = await startRun(profilesInput(batch), batch.length)
        state.run = { id: run.id, kind: "profiles", label: `${batch.length} profiler` }
        state.stats.runs++
        state.stats.profilesFetched += batch.length
        break
      }
      // 4. Nästa hashtag → konton att granska.
      if (state.hashtagQueue.length && room > 0) {
        const tag = state.hashtagQueue.shift()!
        const run = await startRun(hashtagInput(tag, POSTS_PER_HASHTAG), POSTS_PER_HASHTAG)
        state.run = { id: run.id, kind: "hashtag", label: tag }
        state.stats.runs++
        break
      }
      status = "exhausted"
      log(state, room <= 0 ? `Slutade: kostnadstaket på ${config.maxProfiles} profiler är nått.` : "Slutade: inga fler hashtaggar eller konton att söka.")
      break
    }
  } catch (e) {
    if (e instanceof ApifyError && (e.status === 401 || e.status === 402 || e.status === 403)) {
      status = "failed"
      error = e.message
      log(state, `Stoppat: ${e.message}`)
    } else {
      // Tillfälligt fel (nätverk, Apify svarar inte): försök igen i nästa steg.
      log(state, `Tillfälligt fel – försöker igen: ${e instanceof Error ? e.message.slice(0, 120) : "okänt"}`)
    }
  }
  return store.saveJob(job.id, { status, state, error })
}
