/**
 * Varukorgen: tjänster från en eller flera PT:er. Kassan (Stripe) tar en PT
 * åt gången och högst MAX_CHECKOUT_LINES tjänster, så varukorgen grupperas per PT.
 */
import { checkoutTotals, type CheckoutTotals } from "@/lib/payments/fees"
import type { AppData, ID, Trainer, TrainerService } from "@/types/domain"

export const MAX_CART_ITEMS = 20
/** Samma gräns som create_checkout() i databasen. */
export const MAX_CHECKOUT_LINES = 5

export interface CartLine {
  service: TrainerService
  quantity: number
  /** Styckpris × antal. */
  lineSek: number
}

export interface CartGroup extends CheckoutTotals {
  trainer: Trainer
  lines: CartLine[]
}

/**
 * Klientens varukorg per PT, i den ordning PT:erna lades till. Tjänster som
 * inte längre finns eller är aktiva hoppas över (de syns inte och kan inte köpas).
 */
export function cartGroups(data: AppData, clientId: ID): CartGroup[] {
  const groups = new Map<ID, { trainer: Trainer; lines: CartLine[] }>()
  for (const item of data.cart.filter((c) => c.clientId === clientId)) {
    const service = data.services.find((s) => s.id === item.serviceId && s.active)
    const trainer = data.trainers.find((t) => t.id === item.trainerId)
    if (!service || !trainer) continue
    const quantity = service.kind === "single" ? (item.quantity ?? 1) : 1
    const group = groups.get(trainer.id) ?? { trainer, lines: [] }
    group.lines.push({ service, quantity, lineSek: service.priceSek * quantity })
    groups.set(trainer.id, group)
  }
  // Deltotal, serviceavgift (7 %) och totalt per PT – en kassa per PT.
  return [...groups.values()].map((g) => ({ ...g, ...checkoutTotals(g.lines.reduce((sum, l) => sum + l.lineSek, 0)) }))
}

/** Antal (giltiga) tjänster i varukorgen. */
export const cartCount = (data: AppData, clientId: ID) => cartGroups(data, clientId).reduce((n, g) => n + g.lines.length, 0)

export const isInCart = (data: AppData, clientId: ID, serviceId: ID) => data.cart.some((c) => c.clientId === clientId && c.serviceId === serviceId)
