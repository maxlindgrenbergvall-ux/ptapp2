import "server-only"

import Stripe from "stripe"

import { MAX_QUANTITY, SERVICE_FEE_PERCENT, serviceFeeSek } from "@/lib/payments/fees"

/**
 * Stripe via det officiella SDK:t. Hemliga nycklar finns bara på servern:
 *   STRIPE_SECRET_KEY      sk_live_… / sk_test_…
 *   STRIPE_WEBHOOK_SECRET  whsec_… (Stripe → Developers → Webhooks)
 * STRIPE_API_BASE kan pekas om till en mock i tester.
 *
 * SDK:t tar emot parametrarna som vanliga typade objekt (line_items som array,
 * unit_amount och quantity som heltal) och sköter själv kodningen mot Stripes API.
 */
export const isStripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY)

let cached: { key: string; client: Stripe } | null = null

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY saknas")
  if (cached?.key === key) return cached.client
  const base = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null
  const client = new Stripe(key, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Coavira" },
    ...(base
      ? { host: base.hostname, port: base.port || (base.protocol === "https:" ? 443 : 80), protocol: base.protocol === "https:" ? "https" : "http" }
      : {}),
  })
  cached = { key, client }
  return client
}

export interface CheckoutLine {
  title: string
  /** Styckpris i hela kronor (från databasen). */
  unitPriceSek: number
  /** Antal (enstaka pass kan vara fler än 1). */
  quantity: number
}

/**
 * Parametrarna till Checkout Session: tjänsterna (styckpris × antal) och en
 * egen rad för serviceavgiften (7 %). Avgiften räknas ut i databasen
 * (create_checkout) och kontrolleras här mot samma regel, så att Stripe aldrig
 * tar betalt för ett annat belopp än det klienten såg och databasen förväntar sig.
 */
export function checkoutSessionParams(input: {
  checkoutId: string
  clientId: string
  trainerId: string
  email?: string
  lines: CheckoutLine[]
  /** Serviceavgift i hela kronor (från databasen). */
  serviceFeeSek: number
  origin: string
}): Stripe.Checkout.SessionCreateParams {
  if (!input.lines.length) throw new Error("Kassan är tom")
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = input.lines.map((l) => {
    const unitAmount = Math.round(Number(l.unitPriceSek) * 100)
    if (!Number.isSafeInteger(unitAmount) || unitAmount < 300) throw new Error(`Ogiltigt pris för "${l.title}"`)
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_QUANTITY) throw new Error(`Ogiltigt antal för "${l.title}"`)
    return {
      quantity: l.quantity,
      price_data: { currency: "sek", unit_amount: unitAmount, product_data: { name: l.title.slice(0, 250) } },
    }
  })
  const subtotalSek = input.lines.reduce((sum, l) => sum + l.unitPriceSek * l.quantity, 0)
  if (input.serviceFeeSek !== serviceFeeSek(subtotalSek)) {
    throw new Error(`Serviceavgiften stämmer inte (${input.serviceFeeSek} kr, väntade ${serviceFeeSek(subtotalSek)} kr)`)
  }
  if (input.serviceFeeSek > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "sek",
        unit_amount: input.serviceFeeSek * 100,
        product_data: { name: `Serviceavgift (${SERVICE_FEE_PERCENT} %)`, description: "Coaviras avgift för betalning, bokning och support." },
      },
    })
  }
  const metadata = {
    checkout_id: input.checkoutId,
    client_id: input.clientId,
    trainer_id: input.trainerId,
    subtotal_sek: String(subtotalSek),
    service_fee_sek: String(input.serviceFeeSek),
  }
  return {
    mode: "payment",
    locale: "sv",
    // Valutan anges per rad (price_data.currency); ingen separat valuta på sessionen.
    line_items,
    ...(input.email ? { customer_email: input.email } : {}),
    client_reference_id: input.checkoutId,
    metadata,
    payment_intent_data: { metadata: { checkout_id: input.checkoutId } },
    success_url: `${input.origin}/klient/kop?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/klient/hitta/${input.trainerId}?kop=avbrutet`,
  }
}

/** PT Boost i Stripe: 199 kr för 7 dagar (metadata.kind = "boost" skiljer köpet från klienternas kassor). */
export const BOOST_UNIT_AMOUNT = 19_900

/**
 * Checkout Session för ett boostköp. Priset kommer från databasen
 * (create_boost_checkout) och måste vara exakt 199 kr; pengarna går till
 * Coaviras Stripe-konto som en engångsbetalning.
 */
export function boostSessionParams(input: {
  boostId: string
  trainerId: string
  priceSek: number
  durationDays: number
  email?: string
  origin: string
}): Stripe.Checkout.SessionCreateParams {
  const unitAmount = Math.round(Number(input.priceSek) * 100)
  if (unitAmount !== BOOST_UNIT_AMOUNT) throw new Error(`Ogiltigt pris för boost: ${input.priceSek} kr`)
  const metadata = { kind: "boost", boost_id: input.boostId, trainer_id: input.trainerId, boost_duration_days: String(input.durationDays) }
  return {
    mode: "payment",
    locale: "sv",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "sek",
          unit_amount: unitAmount,
          product_data: {
            name: `PT Boost – ${input.durationDays} dagars synlighet`,
            description: "Utvald PT: först i Hitta PT och i rekommendationer till klienter med matchande intressen.",
          },
        },
      },
    ],
    ...(input.email ? { customer_email: input.email } : {}),
    client_reference_id: input.boostId,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${input.origin}/pt/profil?boost=klar&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/pt/profil?boost=avbrutet`,
  }
}

/**
 * Checkout Session för Coavira Plus. Pris och längd kommer från databasen
 * (plus_plans via create_plus_checkout) – inget pris finns i koden.
 */
export function plusSessionParams(input: {
  purchaseId: string
  userId: string
  priceSek: number
  days: number
  email?: string
  origin: string
}): Stripe.Checkout.SessionCreateParams {
  const unitAmount = Math.round(Number(input.priceSek) * 100)
  if (!Number.isSafeInteger(unitAmount) || unitAmount < 300) throw new Error(`Ogiltigt pris för Coavira Plus: ${input.priceSek} kr`)
  const metadata = { kind: "plus", plus_purchase_id: input.purchaseId, user_id: input.userId, plus_days: String(input.days) }
  return {
    mode: "payment",
    locale: "sv",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "sek",
          unit_amount: unitAmount,
          product_data: {
            name: `Coavira Plus – ${input.days} dagar`,
            description: "Full historik, sömntracking, djupgående grafer och export. Förnyas inte automatiskt.",
          },
        },
      },
    ],
    ...(input.email ? { customer_email: input.email } : {}),
    client_reference_id: input.purchaseId,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${input.origin}/klient/plus?plus=klar&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/klient/plus?plus=avbrutet`,
  }
}

/** Stripes felmeddelande i läsbar form (för loggen och klienten). */
export function describeStripeError(e: unknown): { message: string; log: Record<string, unknown> } {
  if (e instanceof Stripe.errors.StripeError) {
    return {
      message: e.message,
      log: { type: e.type, code: e.code, param: e.param, message: e.message, requestId: e.requestId, statusCode: e.statusCode },
    }
  }
  const message = e instanceof Error ? e.message : String(e)
  return { message, log: { message } }
}

/** Verifierar Stripe-Signature (HMAC-SHA256, högst 5 minuter gammal) och returnerar händelsen. */
export function parseWebhookEvent(payload: string, signature: string | null, secret: string): Stripe.Event | null {
  if (!signature || !secret) return null
  try {
    return Stripe.webhooks.constructEvent(payload, signature, secret, 300)
  } catch {
    return null
  }
}
