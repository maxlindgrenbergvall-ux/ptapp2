import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { systemStore } from "@/lib/crm/auth"
import { apifyConfigured } from "@/lib/crm/apify"
import { stepJob } from "@/lib/crm/prospect"
import { runQueue } from "@/lib/crm/queue"
import { enrichPending } from "@/lib/crm/enrichment/engine"

/**
 * GET/POST /api/crm/queue  (v47) – kör utskickskön ett steg (högst ett mejl).
 *
 * För ett schemalagt jobb (t.ex. Vercel Cron var femte minut, eller en extern
 * cron-tjänst), så att kön går även när ingen har adminpanelen öppen:
 *     Authorization: Bearer <CRON_SECRET>
 * Utan CRON_SECRET på servern är rutten avstängd (404). Kön är säker att anropa
 * ofta: takten (paus mellan mejl, dygnstak, kontorstid) styrs i runQueue.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!secret || secret.length < 16) return NextResponse.json({ error: "Hittades inte" }, { status: 404 })
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Hittades inte" }, { status: 404 })
  const store = systemStore()
  if (!store) return NextResponse.json({ error: "CRM:et är inte konfigurerat" }, { status: 503 })
  const result = await runQueue(store)
  // v50: ta också ett steg i pågående prospekteringsjobb, så att de går vidare även när ingen har CRM:et öppet.
  const jobs = apifyConfigured() ? (await store.listJobs(5)).filter((j) => j.status === "running") : []
  for (const job of jobs) await stepJob(store, job.id).catch(() => null)
  // v54: berika några väntande leads (t.ex. från CSV-import eller prospektering).
  const enriched = await enrichPending(store, 3, 15_000).catch(() => ({ done: [], remaining: 0 }))
  return NextResponse.json({ ...result, prospectSteps: jobs.length, enriched: enriched.done.length })
}
export const GET = handle
export const POST = handle
