// Enhetstest för CRM v53: bolagsform och compliance, mallval, uppföljning,
// "nästa steg" och statistik.
//   npx tsx --tsconfig tsconfig.json e2e/crm-conversion.unit.ts
import { bestTemplate, detectCompanyForm, legalBasisFor, recommendedChannel, salesIssues, templateBlock } from "@/lib/crm/compliance"
import { nextAction, todoList } from "@/lib/crm/next-action"
import { blockersFor, DEFAULT_QUEUE, followupStop, followupTime } from "@/lib/crm/outreach"
import { activityEffect, crmStats } from "@/lib/crm/stats"
import { DEFAULT_TEMPLATES, dmText, renderTemplate, RESEARCH_TEMPLATE_KEY, senderName, variablesFor } from "@/lib/crm/templates"
import type { Activity, EmailLog, EmailTemplate, Lead } from "@/lib/crm/types"

let failed = 0
const check = (c: boolean, m: string, extra?: unknown) => {
  console.log(c ? "ok  " : "FAIL", m)
  if (!c) {
    failed++
    if (extra !== undefined) console.log("     ", JSON.stringify(extra))
  }
}

const lead = (p: Partial<Lead> = {}): Lead => ({
  id: "L1", createdAt: "2026-11-01T08:00:00Z", updatedAt: "", name: "Ella Enskild", title: null, segment: "freelance", status: "new",
  email: "ella@ellapt.se", emailVerified: true, phone: null, instagram: null, instagramFollowers: null, websiteUrl: null, gym: null, city: "Malmö",
  specialties: ["Styrka"], source: "manual", sourceUrl: null, score: 60, scoreBreakdown: [], legalBasis: "unknown", unsubscribedAt: null,
  lastEmailedAt: null, statusChangedAt: "", companyForm: "unknown", orgNumber: null, preferredChannel: "email", nextActionAt: null,
  nextActionNote: null, lastContactedAt: null, meetingAt: null, convertedAt: null, ...p,
})
const templates: EmailTemplate[] = DEFAULT_TEMPLATES.map((t, i) => ({ id: `T${i}`, updatedAt: "", ...t }))
const tpl = (key: string) => templates.find((t) => t.key === key)!

// ------------------------------------------------ referensgruppsmallen ---
const research = tpl(RESEARCH_TEMPLATE_KEY)
check(research.subject === "Referensgrupp för nytt svenskt PT-verktyg", "referensgruppsmallen: exakt ämnesrad")
const expected = `Hej {{förnamn}},

Vi bygger ett nytt svenskt coachingverktyg med fokus på ren design och noll krångel för klienten. Innan vi släpper in fler sätter vi ihop en liten referensgrupp med 5–6 duktiga tränare som får tycka till om vad som faktiskt funkar i praktiken – och vad som mest tar onödig tid idag.

Har du 10 minuter över för ett kort samtal i veckan så vi får höra dina tankar?

Säg bara till om torsdag eller fredag passar bäst så skickar jag en kalenderinbjudan.

Allt gott,
{{avsändare}}
Coavira`
check(research.body === expected, "referensgruppsmallen: exakt text")
check(research.kind === "research" && research.companyForm === "enskild" && research.followupDays === null, "icke-säljande, för enskild firma, ingen automatisk uppföljning")
check(salesIssues(`${research.subject}\n${research.body}`).length === 0, "referensgruppsmallen klarar kontrollen för icke-säljande text")
const rendered = renderTemplate(research.body, variablesFor(lead(), "Max"))
check(rendered.unknown.length === 0 && rendered.text.startsWith("Hej Ella,") && rendered.text.includes("Allt gott,\nMax\nCoavira"), "variablerna fylls i (förnamn, avsändare)")
for (const t of templates) check(renderTemplate(`${t.subject}\n${t.body}\n${t.followupBody ?? ""}`, variablesFor(lead(), "Max")).unknown.length === 0, `startmallen "${t.name}" har bara kända variabler`)
check(templates.every((t) => !/\[[^\]]{2,40}\]/.test(t.body) && !/!/.test(t.subject)), "startmallarna har inga platshållare och inga utropstecken i ämnet")

// ------------------------------------------------- icke-säljande text ---
check(salesIssues("Prova appen gratis i 30 dagar").length > 0, "\"prova gratis\" är säljande")
check(salesIssues("Det kostar 299 kr i månaden").includes("pris"), "ett pris är säljande")
check(salesIssues("Läs mer på coavira.fit").includes("länk"), "en länk är säljande")
check(salesIssues("Registrera dig här").length > 0, "uppmaning att registrera sig är säljande")
check(salesIssues("Har du 10 minuter för ett samtal?").length === 0, "en fråga om ett samtal är inte säljande")

// --------------------------------------------------------- bolagsform ---
check(detectCompanyForm("Elin PT AB · Org.nr 559123-4567").orgNumber === "559123-4567", "org.nr 5xxxxx-xxxx → aktiebolag med nummer")
check(detectCompanyForm("Organisationsnummer: 5591234567").form === "ab", "org.nr utan bindestreck känns igen")
check(detectCompanyForm("Söderberg Träning AB, Göteborg").form === "ab", "\"… AB\" i namnet → aktiebolag")
check(detectCompanyForm("Jag driver min verksamhet som enskild firma med F-skatt").form === "enskild", "\"enskild firma\" → enskild")
check(detectCompanyForm("Personnummer 19900101-1234").form === "unknown" && detectCompanyForm("19900101-1234").orgNumber === null, "ett personnummer känns aldrig igen som org.nr")
check(detectCompanyForm("Personlig tränare i Malmö").form === "unknown", "ingen uppgift → inte bedömd")
check(legalBasisFor("enskild", "unknown") === "research" && legalBasisFor("ab", "unknown") === "company", "bolagsform → rättslig grund")
check(legalBasisFor("enskild", "consent") === "consent" && legalBasisFor("ab", "consent") === "consent", "samtycke ändras aldrig")
check(legalBasisFor("unknown", "research") === "unknown", "okänd bolagsform: icke-säljande grund nollas")

// ------------------------------------------------------------ mallval ---
const ef = lead({ companyForm: "enskild", legalBasis: "research" })
const ab = lead({ companyForm: "ab", legalBasis: "company", name: "Anna AB" })
const gym = lead({ companyForm: "ab", legalBasis: "company", segment: "gym_chain", gym: "SATS" })
const infl = lead({ companyForm: "ab", legalBasis: "company", segment: "influencer" })
check(bestTemplate(templates, ef)?.key === RESEARCH_TEMPLATE_KEY, "enskild firma → referensgruppsmallen förvald")
check(bestTemplate(templates, ab)?.key === "ab_intro", "aktiebolag → AB-mallen")
check(bestTemplate(templates, gym)?.key === "gym_chain_intro", "gymkedja → gymkedjemallen")
check(bestTemplate(templates, infl)?.key === "influencer_intro", "onlinecoach med AB → influencermallen")
check(templateBlock(ef, tpl("ab_intro"))?.code === "needs_research", "enskild firma: säljande mall spärras")
check(templateBlock({ ...ef, legalBasis: "consent" }, tpl("ab_intro")) === null, "enskild firma med samtycke: säljande mall går bra")
check(templateBlock(ef, { ...research, body: `${research.body}\nPris: 199 kr/mån` })?.code === "research_is_sales", "icke-säljande mall med pris spärras")
check(templateBlock(ab, research)?.code === "company_form_mismatch", "referensgruppsmallen är till för enskilda firmor")
check(bestTemplate(templates, lead({ legalBasis: "consent" }))?.key === "ab_intro", "samtycke men okänd bolagsform → en säljande mall går att välja")
check(recommendedChannel({ ...ef, instagram: "ella.pt" }) === "instagram" && recommendedChannel(ab) === "email", "enskild firma med Instagram → DM rekommenderas")

// ------------------------------------------------------------ spärrar ---
const now = new Date("2026-11-16T09:00:00Z") // måndag 10:00 svensk tid
const ctx = { suppressed: false, queued: false, now }
check(blockersFor(lead({ companyForm: "enskild", legalBasis: "company" }), ctx).includes("company_form"), "enskild firma kan inte ha grunden Företagsadress")
check(blockersFor(ef, ctx).length === 0, "enskild firma med icke-säljande grund får mejlas (med rätt mall)")
check(blockersFor(lead({ ...ab, status: "replied" }), ctx).includes("engaged") && blockersFor(lead({ ...ab, status: "meeting" }), ctx).includes("engaged"), "svarat/bokat: inga massutskick")

// --------------------------------------------------------- uppföljning ---
const sent: Pick<EmailLog, "status" | "sentAt"> = { status: "delivered", sentAt: "2026-11-16T09:00:00Z" }
check(followupStop({ status: "emailed", unsubscribedAt: null }, sent, []) === null, "inget svar → uppföljningen går")
check(followupStop({ status: "replied", unsubscribedAt: null }, sent, []) !== null, "svarat → uppföljningen pausas")
check(followupStop({ status: "meeting", unsubscribedAt: null }, sent, []) !== null, "bokat samtal → pausas")
check(followupStop({ status: "emailed", unsubscribedAt: null }, sent, [{ kind: "dm_reply", occurredAt: "2026-11-17T10:00:00Z" }]) !== null, "svar på DM efter mejlet → pausas")
check(followupStop({ status: "emailed", unsubscribedAt: null }, sent, [{ kind: "dm_reply", occurredAt: "2026-11-10T10:00:00Z" }]) === null, "gammalt DM-svar (före mejlet) pausar inte")
check(followupStop({ status: "emailed", unsubscribedAt: null }, { status: "bounced", sentAt: sent.sentAt }, []) !== null, "studsat mejl → ingen uppföljning")
check(followupStop({ status: "emailed", unsubscribedAt: "2026-11-17T00:00:00Z" }, sent, []) !== null, "avregistrerad → ingen uppföljning")
const fu = followupTime(new Date("2026-11-19T15:30:00Z"), 4, DEFAULT_QUEUE) // torsdag 16:30 + 4 d = måndag 16:30
check(fu.toISOString() === "2026-11-23T15:30:00.000Z", "uppföljning: fyra dagar senare, inom utskicksfönstret", fu.toISOString())
const fuWeekend = followupTime(new Date("2026-11-17T09:00:00Z"), 4, DEFAULT_QUEUE) // tisdag + 4 = lördag → måndag 08
check(fuWeekend.toISOString() === "2026-11-23T07:00:00.000Z", "uppföljning som hamnar på en helg flyttas till måndag kl. 08", fuWeekend.toISOString())

// ---------------------------------------------------------- nästa steg ---
const none = { logs: [] as EmailLog[], activities: [] as Activity[], now }
check(nextAction(lead({ status: "replied" }), none).kind === "book_call", "svarat → boka samtalet")
check(nextAction(lead({ status: "replied" }), none).priority >= 90, "svarat ligger högst upp")
check(nextAction(lead({ status: "meeting", meetingAt: "2026-11-16T15:00:00Z" }), none).kind === "prep_call", "samtal idag → förbered")
check(nextAction(lead({ status: "meeting", meetingAt: "2026-11-14T09:00:00Z" }), none).kind === "log_call", "samtal som har varit → logga det")
const held: Activity = { id: "a", leadId: "L1", kind: "call_held", body: null, occurredAt: "2026-11-14T09:30:00Z" }
check(nextAction(lead({ status: "meeting", meetingAt: "2026-11-14T09:00:00Z" }), { ...none, activities: [held] }).kind === "convert", "samtal genomfört → skicka registreringslänken")
check(nextAction(lead({ nextActionAt: "2026-11-15T08:00:00Z", nextActionNote: "Ring Ella" }), none).label === "Ring Ella", "förfallen påminnelse visas först")
check(nextAction(lead(), none).kind === "assess", "okänd bolagsform → bedöm den först")
check(nextAction({ ...ef, instagram: "ella.pt" }, none).kind === "dm", "enskild firma med Instagram → DM")
check(nextAction(ab, none).kind === "email", "aktiebolag med verifierad adress → första mejlet")
check(nextAction(lead({ ...ab, status: "emailed", lastContactedAt: "2026-11-05T09:00:00Z", instagram: "anna.pt" }), none).kind === "dm", "tyst i 11 dagar → följ upp med DM")
check(nextAction(lead({ ...ab, status: "customer" }), none).kind === "none", "kund → inget att göra")
const todo = todoList([lead({ status: "replied", id: "A" }), lead({ ...ab, id: "B" }), lead({ status: "customer", id: "C" })], none)
check(todo.length === 2 && todo[0].lead.id === "A", "Att göra: svarat först, kunder syns inte")

// --------------------------------------------------------- aktiviteter ---
check(activityEffect("dm_sent", { status: "new" }, "t").patch.status === "emailed", "DM skickat → Kontaktad")
check(activityEffect("dm_reply", { status: "emailed" }, "t").cancelQueued, "svar → automatiska mejl pausas")
const booked = activityEffect("call_booked", { status: "replied" }, "t", "2026-11-20T09:00:00Z")
check(booked.patch.status === "meeting" && booked.patch.meetingAt === "2026-11-20T09:00:00Z", "samtal bokat → Samtal bokat med tid")
check(activityEffect("dm_sent", { status: "replied" }, "t").patch.status === undefined, "statusen går aldrig bakåt")
check(activityEffect("converted", { status: "meeting" }, "t").patch.status === "customer", "blev PT → kund")

// ---------------------------------------------------------- statistik ---
const log = (p: Partial<EmailLog>): EmailLog => ({ id: Math.random().toString(36).slice(2), leadId: "", templateId: "T1", createdAt: "", toEmail: "x@y.se", subject: "", body: "", status: "delivered", scheduledAt: "", sentAt: "2026-11-10T09:00:00Z", deliveredAt: "2026-11-10T09:00:00Z", resendId: null, error: null, step: 1, parentId: null, openedAt: null, openCount: 0, ...p })
const leads = [lead({ id: "1", status: "replied" }), lead({ id: "2", status: "emailed" }), lead({ id: "3", status: "customer" }), lead({ id: "4", status: "meeting" }), lead({ id: "5" })]
const logs = [log({ leadId: "1" }), log({ leadId: "2" }), log({ leadId: "3", templateId: "T0" }), log({ leadId: "2", step: 2, parentId: "x" }), log({ leadId: "4", status: "bounced" })]
const acts: Activity[] = [{ id: "d1", leadId: "5", kind: "dm_sent", body: null, occurredAt: "2026-11-10T09:00:00Z" }]
const st = crmStats(leads, logs, acts, templates)
check(st.funnel.contacted === 5 && st.funnel.replied === 3 && st.funnel.meetings === 2 && st.funnel.converted === 1, "tratten: kontaktade, svar, samtal, PT:er", st.funnel)
check(st.rates.reply === 60, "svarsfrekvens 3 av 5 = 60 %", st.rates)
const t1 = st.templates.find((t) => t.templateId === "T1")!
check(t1.sent === 3 && t1.replied === 2 && t1.replyRate === 67 && t1.bounced === 1, "per mall: skickat, svar och studsar (uppföljningen räknas inte som eget mejl)", t1)
check(st.followups.sent === 1, "uppföljningar räknas för sig")
check(st.opensTracked === false && t1.openRate === null, "utan öppningsspårning visas ingen öppningsgrad")
check(crmStats(leads, [log({ leadId: "1", openCount: 2 })], [], templates).templates[0].openRate === 100, "med öppningsspårning: öppningsgrad per mall")
check(st.dm.sent === 1 && st.dm.replyRate === 0, "DM räknas för sig")

// -------------------------------------------------- avsändare och DM ---
check(senderName({ CRM_SENDER_NAME: "Max" }) === "Max", "avsändare: CRM_SENDER_NAME")
check(senderName({ CRM_FROM_EMAIL: "Max på Coavira <max@mail.coavira.fit>" }) === "Max", "avsändare: namnet i CRM_FROM_EMAIL")
check(senderName({ CRM_FROM_EMAIL: "Coavira <hej@mail.coavira.fit>" }) === null && senderName({}) === null, "inget personnamn → saknas (utskicket stoppas)")
const dm = dmText({ name: "Ella Enskild" }, "Max")
check(dm.startsWith("Hej Ella!") && dm.endsWith("/Max, Coavira") && salesIssues(dm).length === 0, "DM-texten är personlig och icke-säljande")

console.log(failed ? `\n${failed} fel` : "\nCRM v53 GODKÄND")
process.exit(failed ? 1 : 0)
