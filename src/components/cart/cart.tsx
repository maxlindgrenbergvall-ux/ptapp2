"use client"

/**
 * Varukorgen: knapp i klientens sidhuvud (med antal) och en låda från höger.
 * Klienten samlar tjänster från en eller flera PT:er och betalar en PT i taget
 * (kassan i Stripe gäller en PT och högst fem tjänster).
 */
import { BadgePercent, CreditCard, Loader2, Minus, Plus, Salad, ShoppingBag, Trash2, X } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { CLOSE_BUTTON } from "@/components/ui/close-button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cartCount, cartGroups, MAX_CHECKOUT_LINES, type CartGroup } from "@/lib/cart"
import { useAppData } from "@/lib/data/store"
import { formatSek } from "@/lib/money"
import { cn } from "@/lib/utils"
import { canChooseQuantity, EXISTING_CLIENT_FEE_PERCENT, MAX_QUANTITY, PLATFORM_FEE_PERCENT } from "@/lib/payments/fees"
import { firstName } from "@/lib/names"
import { activeServices, hasNutritionAccess, serviceSummary } from "@/lib/services/balance"
import { isNativeApp } from "@/lib/native/app"

const OPEN_CART = "coavira:open-cart"
/** Öppnar varukorgen (t.ex. från "Visa varukorg" i en notis). */
export const openCart = () => window.dispatchEvent(new Event(OPEN_CART))

export function CartButton() {
  const { data, me } = useAppData()
  const [open, setOpen] = React.useState(false)
  const count = cartCount(data, me.id)

  React.useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_CART, onOpen)
    return () => window.removeEventListener(OPEN_CART, onOpen)
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon" className="relative" aria-label={count ? `Varukorg, ${count} tjänster` : "Varukorg"} onClick={() => setOpen(true)}>
        <ShoppingBag />
        {count > 0 && (
          <span
            aria-hidden
            data-testid="cart-count"
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular ring-2 ring-background"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-md" data-testid="cart">
        <CartContents onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function CartContents({ onNavigate }: { onNavigate: () => void }) {
  const { data, me } = useAppData()
  const groups = cartGroups(data, me.id)
  const count = groups.reduce((n, g) => n + g.lines.length, 0)

  return (
    <>
      <SheetHeader className="flex-row items-start justify-between gap-3 border-b p-4">
        <div className="space-y-1">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="size-5 text-primary" /> Varukorg
          </SheetTitle>
          <SheetDescription>
            {count === 0
              ? "Samla pass, program och kostcoaching här innan du betalar."
              : groups.length > 1
                ? `${count} tjänster hos ${groups.length} PT:er – du betalar en PT i taget.`
                : `${count} ${count === 1 ? "tjänst" : "tjänster"} hos ${groups[0].trainer.name}.`}
          </SheetDescription>
        </div>
        <SheetClose asChild>
          <button type="button" className={cn("-mt-1.5 -mr-1.5", CLOSE_BUTTON)} aria-label="Stäng varukorgen">
            <X />
          </button>
        </SheetClose>
      </SheetHeader>

      {count === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="size-6 text-muted-foreground" />
          </span>
          <p className="font-medium">Varukorgen är tom</p>
          <p className="text-sm text-muted-foreground">Lägg till tjänster från en PT:s profil.</p>
          <Button asChild variant="outline" onClick={onNavigate}>
            <Link href="/klient/hitta">Hitta PT</Link>
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {groups.map((g) => (
            <CartGroupCard key={g.trainer.id} group={g} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {count > 0 && (
        <SheetFooter className="border-t p-4 text-xs text-muted-foreground">
          Varukorgen sparas på ditt konto. Du betalar säkert med kort, och passen låses upp direkt efter betalningen.
        </SheetFooter>
      )}
    </>
  )
}

function CartGroupCard({ group, onNavigate }: { group: CartGroup; onNavigate: () => void }) {
  const { data, me, mode, actions } = useAppData()
  const [pending, setPending] = React.useState(false)
  const { trainer, lines, subtotalSek, feePercent, serviceFeeSek, totalSek } = group
  const name = firstName(trainer.name)
  const tooMany = lines.length > MAX_CHECKOUT_LINES

  // Mersälj: PT:ns kostcoaching om ingen tjänst i varukorgen redan ger kost.
  const nutrition = activeServices(data, trainer.id).find((s) => s.kind === "nutrition")
  const suggestNutrition =
    nutrition && !lines.some((l) => l.service.includesNutrition) && !hasNutritionAccess(data, trainer.id, me.id) && !tooMany

  const pay = async () => {
    setPending(true)
    const error = await actions.checkout(lines.map((l) => ({ serviceId: l.service.id, quantity: l.quantity })))
    if (error) {
      setPending(false)
      toast.error(error)
      return
    }
    if (mode === "demo") {
      setPending(false)
      toast.success("Betalningen är klar", { description: `${name} har fått dig som klient.` })
    }
    // Appen: betalningen sker i webbläsarvyn – när den stängs (Klar eller efter betalningen) slutar knappen snurra.
    if (mode !== "demo" && isNativeApp()) setPending(false)
    // Med Supabase skickas klienten vidare till Stripe (varukorgen töms när betalningen är klar).
  }

  return (
    <section className="rounded-2xl border bg-card" aria-label={`Varukorg hos ${trainer.name}`}>
      <div className="flex items-center gap-3 border-b p-3">
        <PersonAvatar name={trainer.name} src={trainer.avatarUrl} className="size-9" />
        <div className="min-w-0 flex-1">
          <Link href={`/klient/hitta/${trainer.id}`} onClick={onNavigate} className="block truncate font-medium hover:underline">
            {trainer.name}
          </Link>
          <p className="text-xs text-muted-foreground">{trainer.city}</p>
        </div>
      </div>
      <ul className="divide-y">
        {lines.map(({ service: s, quantity, lineSek }) => (
          <li key={s.id} className="space-y-2 p-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {canChooseQuantity(s) ? `${formatSek(s.priceSek)} / pass` : serviceSummary(s)}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular" data-testid="cart-line-total">
                {formatSek(lineSek)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="-my-1.5 size-8 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Ta bort ${s.title} ur varukorgen`}
                onClick={() => actions.removeFromCart([s.id])}
                disabled={pending}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {canChooseQuantity(s) && <QuantityStepper title={s.title} value={quantity} onChange={(n) => actions.setCartQuantity(s.id, n)} disabled={pending} />}
          </li>
        ))}
        {suggestNutrition && nutrition && (
          <li className="flex items-center gap-3 bg-primary/5 p-3 text-sm">
            <Salad className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              Lägg till {nutrition.title.toLowerCase()} av {name}
              <span className="block text-xs text-muted-foreground">{formatSek(nutrition.priceSek)}</span>
            </span>
            <Button size="sm" variant="outline" onClick={() => actions.addToCart(nutrition.id)} aria-label={`Lägg ${nutrition.title} i varukorgen`}>
              Lägg till
            </Button>
          </li>
        )}
      </ul>
      <div className="space-y-2 border-t p-3">
        <CheckoutSummary subtotalSek={subtotalSek} feePercent={feePercent} serviceFeeSek={serviceFeeSek} totalSek={totalSek} testId="cart-total" />
        {tooMany && <p className="text-xs text-destructive">Högst {MAX_CHECKOUT_LINES} tjänster per köp – ta bort några.</p>}
        <Button className="w-full" onClick={() => void pay()} disabled={pending || tooMany}>
          {pending ? <Loader2 className="animate-spin" /> : <CreditCard />} Till kassan · {formatSek(totalSek)}
        </Button>
        {mode === "demo" && <p className="text-center text-[11px] text-muted-foreground">Demoläge: betalningen simuleras.</p>}
      </div>
    </section>
  )
}

/** − antal + för enstaka pass (1–20). */
function QuantityStepper({ title, value, onChange, disabled }: { title: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">Antal pass</span>
      <div className="flex items-center rounded-full border" role="group" aria-label={`Antal ${title}`}>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full"
          aria-label={`Minska antal ${title}`}
          onClick={() => onChange(value - 1)}
          disabled={disabled || value <= 1}
        >
          <Minus className="size-4" />
        </Button>
        <span className="min-w-8 text-center font-semibold tabular" aria-live="polite" data-testid="cart-quantity">
          {value}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full"
          aria-label={`Öka antal ${title}`}
          onClick={() => onChange(value + 1)}
          disabled={disabled || value >= MAX_QUANTITY}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Deltotal, serviceavgift och totalt att betala – samma uppställning i
 * varukorgen och i köpdialogen. Avgiften är 5 % för PT:ns befintliga klienter
 * (inlöst kod från PT:n) och 10 % för klienter som hittat PT:n i appen.
 */
export function CheckoutSummary({
  subtotalSek,
  feePercent,
  serviceFeeSek,
  totalSek,
  testId,
}: {
  subtotalSek: number
  feePercent: number
  serviceFeeSek: number
  totalSek: number
  testId?: string
}) {
  const existing = feePercent === EXISTING_CLIENT_FEE_PERCENT
  return (
    <dl className="space-y-1 text-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <dt>Deltotal</dt>
        <dd className="tabular" data-testid={testId ? `${testId}-subtotal` : undefined}>
          {formatSek(subtotalSek)}
        </dd>
      </div>
      <div className="flex items-center justify-between text-muted-foreground">
        <dt data-testid={testId ? `${testId}-fee-label` : undefined}>Serviceavgift ({feePercent} %)</dt>
        <dd className="tabular" data-testid={testId ? `${testId}-fee` : undefined}>
          {formatSek(serviceFeeSek)}
        </dd>
      </div>
      {existing && (
        <p className="flex items-center gap-1.5 rounded-md bg-emerald-600/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400" data-testid={testId ? `${testId}-existing` : undefined}>
          <BadgePercent className="size-3.5 shrink-0" aria-hidden />
          Befintlig klient: {EXISTING_CLIENT_FEE_PERCENT} % i stället för {PLATFORM_FEE_PERCENT} %
        </p>
      )}
      <div className="flex items-center justify-between border-t pt-1.5 font-semibold">
        <dt>Totalt att betala</dt>
        <dd className="tabular" data-testid={testId}>
          {formatSek(totalSek)}
        </dd>
      </div>
    </dl>
  )
}
