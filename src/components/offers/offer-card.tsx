import { Sparkles, Tag, X } from "lucide-react"
import Link from "next/link"

import { formatShort } from "@/lib/date"
import { cn } from "@/lib/utils"
import { SPECIALTY_LABEL, type Trainer, type TrainerOffer } from "@/types/domain"

/** Pris eller rabatt i kortform, t.ex. "−20 %" eller "2 100 kr". */
export function offerPriceLabel(o: Pick<TrainerOffer, "priceSek" | "discountPercent">) {
  if (o.discountPercent) return `−${o.discountPercent} %`
  if (o.priceSek !== undefined) return `${o.priceSek.toLocaleString("sv-SE")} kr`
  return null
}

/** Ett PT-erbjudande. `compact` används i aviseringsmenyn. */
export function OfferCard({
  offer,
  trainer,
  compact,
  onOpen,
  onDismiss,
  reason,
}: {
  offer: TrainerOffer
  trainer?: Pick<Trainer, "id" | "name">
  compact?: boolean
  onOpen?: () => void
  onDismiss?: () => void
  /** Varför erbjudandet visas, t.ex. "Du har tittat på Hyrox". */
  reason?: string
}) {
  const price = offerPriceLabel(offer)
  const body = (
    <>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/25 text-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium">{offer.title}</span>
            {price && <span className="rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary tabular">{price}</span>}
          </div>
          {!compact && offer.description && <p className="text-sm text-muted-foreground">{offer.description}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <Tag className="size-3" /> {SPECIALTY_LABEL[offer.category]}
            {trainer && <span>· {trainer.name}</span>}
            {offer.validUntil && <span>· t.o.m. {formatShort(offer.validUntil)}</span>}
          </p>
          {reason && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{reason}</p>}
        </div>
      </div>
    </>
  )
  return (
    <div className={cn("relative rounded-xl border bg-card", compact ? "p-2.5 text-sm" : "p-3")}>
      {trainer && onOpen !== undefined ? (
        <Link href={`/klient/hitta/${trainer.id}`} onClick={onOpen} className="block rounded-lg pr-6 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          {body}
        </Link>
      ) : (
        body
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dölj erbjudandet ${offer.title}`}
          className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
