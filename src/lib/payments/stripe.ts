import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Stripe via REST (inget SDK behövs). Hemliga nycklar finns bara på servern:
 *   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET  whsec_… (Stripe → Developers → Webhooks)
 * STRIPE_API_BASE kan pekas om till en mock i tester.
 */
export const isStripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY)

const apiBase = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "")

/** Platta ut { line_items: [{ price_data: { … } }] } till Stripes form-format line_items[0][price_data][…]. */
export function toForm(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) value.forEach((v, i) => (typeof v === "object" ? toForm(v as Record<string, unknown>, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(v))))
    else if (typeof value === "object") toForm(value as Record<string, unknown>, name, out)
    else out.append(name, String(value))
  }
  return out
}

export async function stripe<T>(method: "GET" | "POST", path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY saknas")
  const body = params ? toForm(params) : undefined
  const url = method === "GET" && body ? `${apiBase()}${path}?${body}` : `${apiBase()}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: method === "POST" ? body : undefined,
    cache: "no-store",
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe svarade ${res.status}`)
  return json
}

export interface CheckoutSession {
  id: string
  url: string | null
  status: "open" | "complete" | "expired"
  payment_status: "paid" | "unpaid" | "no_payment_required"
  amount_total: number | null
  currency: string
  client_reference_id: string | null
  payment_intent: string | null
  metadata?: Record<string, string>
}

/**
 * Verifierar Stripe-Signature-headern (t=…,v1=…): HMAC-SHA256 av "t.payload"
 * med webhook-hemligheten, och att tidsstämpeln är högst 5 minuter gammal.
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  if (!header || !secret) return false
  const parts = header.split(",").map((p) => p.split("=") as [string, string])
  const t = Number(parts.find(([k]) => k === "t")?.[1])
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v)
  if (!Number.isFinite(t) || !signatures.length) return false
  if (Math.abs(now / 1000 - t) > toleranceSec) return false
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"))
  return signatures.some((s) => {
    const given = Buffer.from(s)
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}
