import "server-only"

/**
 * Apify (v49) – kör actorn apify/instagram-scraper åt CRM:et.
 *
 * Varför Apify och inte vår egen hämtning: vår parser (fetch-public.ts) hämtar
 * aldrig sociala nätverk. Instagram nås här bara via Apifys tjänst, och bara när
 * APIFY_TOKEN är satt på servern – utan den finns ingen Instagram-funktion alls.
 *
 * Körningen startas asynkront och läses av när den är klar (Instagram-hämtningar
 * tar ofta 30 s–2 min, längre än en serverfunktion får vänta).
 *
 *   APIFY_TOKEN       krävs (Apify Console → Settings → API & Integrations)
 *   APIFY_API_BASE    valfritt (tester), standard https://api.apify.com
 *   APIFY_ACTOR       valfritt, standard apify~instagram-scraper
 *
 * Token skickas i Authorization-rubriken, aldrig i adressen (hamnar annars i loggar).
 */
export const apifyConfigured = () => Boolean(process.env.APIFY_TOKEN?.trim())
const base = () => (process.env.APIFY_API_BASE?.trim() || "https://api.apify.com").replace(/\/$/, "")
const actor = () => process.env.APIFY_ACTOR?.trim() || "apify~instagram-scraper"

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN!.trim()}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new ApifyError("Apify svarade inte", 502)
  }
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Inte JSON – felmeddelandet nedan räcker.
  }
  if (!res.ok) {
    const message = String((json as { error?: { message?: string } } | null)?.error?.message ?? `Apify svarade ${res.status}`)
    throw new ApifyError(res.status === 401 ? "Apify-nyckeln (APIFY_TOKEN) godtogs inte" : res.status === 402 ? "Apify-kontot saknar krediter för fler körningar" : message.slice(0, 200), res.status)
  }
  return json as T
}

export type RunStatus = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMING-OUT" | "TIMED-OUT" | "ABORTING" | "ABORTED"
export interface Run {
  id: string
  status: RunStatus
  datasetId: string | null
}
const toRun = (data: Record<string, unknown> | undefined): Run => ({ id: String(data?.id ?? ""), status: String(data?.status ?? "FAILED") as RunStatus, datasetId: data?.defaultDatasetId ? String(data.defaultDatasetId) : null })

/** Startar en körning. maxItems begränsar kostnaden (Apify tar betalt per resultat). */
export async function startRun(input: Record<string, unknown>, maxItems: number): Promise<Run> {
  const params = new URLSearchParams({ timeout: "240", maxItems: String(maxItems) })
  const json = await call<{ data?: Record<string, unknown> }>("POST", `/v2/acts/${encodeURIComponent(actor())}/runs?${params}`, input)
  const run = toRun(json?.data)
  if (!run.id) throw new ApifyError("Apify startade ingen körning", 502)
  return run
}

export async function getRun(runId: string): Promise<Run> {
  return toRun((await call<{ data?: Record<string, unknown> }>("GET", `/v2/actor-runs/${encodeURIComponent(runId)}`))?.data)
}

export async function getItems(datasetId: string, limit: number): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ clean: "true", format: "json", limit: String(limit) })
  const items = await call<unknown>("GET", `/v2/datasets/${encodeURIComponent(datasetId)}/items?${params}`)
  return Array.isArray(items) ? (items.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []
}
