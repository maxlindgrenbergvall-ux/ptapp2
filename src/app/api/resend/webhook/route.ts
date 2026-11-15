import { createHmac, timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { systemStore } from "@/lib/crm/auth"

/**
 * POST /api/resend/webhook  (v47) – leveranskvitton från Resend för CRM-utskick.
 *
 *   email.delivered   → utskicket markeras Levererat med tidsstämpel
 *   email.bounced     → Studsade; adressen spärras och leaden märks "domänen tar inte emot post"
 *   email.complained  → Anmält som skräp; adressen spärras och leaden blir Ej aktuell
 *
 * Signaturen verifieras (Resend använder Svix: svix-id, svix-timestamp,
 * svix-signature och hemligheten RESEND_WEBHOOK_SECRET, "whsec_…"). Utan giltig
 * signatur görs ingenting. Händelser äldre än fem minuter avvisas (återuppspelning).
 * Lägg in adressen i Resend → Webhooks och välj de tre händelserna ovan.
 */
function verify(raw: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  const id = headers.get("svix-id")
  const timestamp = headers.get("svix-timestamp")
  const signatures = headers.get("svix-signature")
  if (!secret || !id || !timestamp || !signatures) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest()
  return signatures.split(" ").some((part) => {
    const [version, value] = part.split(",")
    if (version !== "v1" || !value) return false
    const given = Buffer.from(value, "base64")
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verify(raw, request.headers)) return NextResponse.json({ error: "Ogiltig signatur" }, { status: 401 })
  const store = systemStore()
  if (!store) return NextResponse.json({ ok: true })
  let event: { type?: string; created_at?: string; data?: { email_id?: string } }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON" }, { status: 400 })
  }
  const resendId = event.data?.email_id
  // Bara CRM-utskick finns i loggen; andra mejl (t.ex. från appen) hoppas över.
  const log = resendId ? await store.findLogByResendId(resendId) : null
  if (!log) return NextResponse.json({ ok: true })
  const at = event.created_at && !Number.isNaN(Date.parse(event.created_at)) ? new Date(event.created_at).toISOString() : new Date().toISOString()

  if (event.type === "email.delivered") {
    // En studs eller anmälan som redan registrerats skrivs inte över av ett sent leveranskvitto.
    if (log.status === "sent" || log.status === "sending") await store.updateLog(log.id, { status: "delivered", deliveredAt: at })
  } else if (event.type === "email.bounced") {
    await store.updateLog(log.id, { status: "bounced", error: "Mejlet studsade" })
    await store.suppress(log.toEmail, "bounced")
    await store.updateLead(log.leadId, { emailVerified: false })
  } else if (event.type === "email.complained") {
    await store.updateLog(log.id, { status: "complained", error: "Mottagaren anmälde mejlet som skräppost" })
    await store.suppress(log.toEmail, "complained")
    await store.cancelQueued({ leadId: log.leadId })
    await store.updateLead(log.leadId, { status: "not_relevant", unsubscribedAt: at })
  }
  return NextResponse.json({ ok: true })
}
