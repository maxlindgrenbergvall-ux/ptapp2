/**
 * Indata till API-rutterna, validerad med zod. Databasen kontrollerar allt igen
 * (RLS, constraints, security definer-funktioner) – det här stoppar felformade
 * och överstora anrop innan de når Stripe eller databasen. Supabase-klienten
 * skickar alltid värden som parametrar (ingen SQL byggs av text), och React
 * escapar all text som visas.
 */
import { z } from "zod"

import { DELETE_CONFIRM_WORD } from "@/lib/account"
import { MAX_QUANTITY } from "@/lib/payments/fees"

const uuid = z.uuid()

/** Kassan: { items: [{ serviceId, quantity }] } (äldre appar: { serviceIds }). Högst 5 tjänster. */
export const checkoutBody = z.union([
  z.object({
    items: z
      .array(z.object({ serviceId: uuid, quantity: z.number().int().min(1).max(MAX_QUANTITY).optional() }).strict())
      .min(1)
      .max(5),
  }),
  z.object({ serviceIds: z.array(uuid).min(1).max(5) }),
])

export type CheckoutItem = { serviceId: string; quantity: number }

export function checkoutItems(body: z.infer<typeof checkoutBody>): CheckoutItem[] {
  return "items" in body
    ? body.items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity ?? 1 }))
    : body.serviceIds.map((serviceId) => ({ serviceId, quantity: 1 }))
}

/** Kontoradering: { confirm: "RADERA" }. */
export const deleteAccountBody = z.object({ confirm: z.literal(DELETE_CONFIRM_WORD) })

/** RevenueCats webhook (bara fälten vi använder; resten ignoreras). */
const shortText = z.string().max(200)
export const revenueCatWebhookBody = z.object({
  event: z.object({
    id: shortText.optional(),
    type: z.string().min(1).max(64),
    app_user_id: shortText.nullish(),
    original_app_user_id: shortText.nullish(),
    aliases: z.array(shortText).max(50).nullish(),
    product_id: shortText.nullish(),
    transaction_id: shortText.nullish(),
    environment: z.string().max(32).nullish(),
  }),
})
