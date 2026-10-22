"use client"

/**
 * Nedladdningsbrickor för App Store och Google Play – landningssidans enda
 * primära CTA. Coavira är en mobilapp, så här finns ingen webbinloggning.
 *
 * Med butiksadress (NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_PLAY_STORE_URL)
 * länkar brickan direkt till butiken. Utan (innan apparna är publicerade)
 * öppnar den en "Släpps snart"-ruta. Rutan delas av alla brickor på sidan
 * via AppDownloadProvider (i LandingShell).
 */
import { motion } from "framer-motion"
import { BellRing, Mail, Smartphone, X } from "lucide-react"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { LINKS, STORE_URLS } from "@/components/landing/links"
import { EASE, useConfetti } from "@/components/landing/primitives"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type Store = "ios" | "android"

const STORE: Record<Store, { name: string; top: string; bottom: string; label: string }> = {
  ios: { name: "App Store", top: "Hämta i", bottom: "App Store", label: "Hämta Coavira i App Store" },
  android: { name: "Google Play", top: "Ladda ned på", bottom: "Google Play", label: "Ladda ned Coavira på Google Play" },
}

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

// ------------------------------------------------------- "Släpps snart" ---

const DownloadContext = React.createContext<(store: Store, from?: Element | null) => void>(() => {})

/** Delad "Släpps snart"-ruta för alla brickor på sidan. */
export function AppDownloadProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = React.useState<Store | null>(null)
  const fire = useConfetti()
  const open = React.useCallback(
    (s: Store, from?: Element | null) => {
      setStore(s)
      void fire(from, { particles: 70, spread: 65 })
    },
    [fire]
  )
  return (
    <DownloadContext.Provider value={open}>
      {children}
      <ComingSoonDialog store={store} onClose={() => setStore(null)} />
    </DownloadContext.Provider>
  )
}

function ComingSoonDialog({ store, onClose }: { store: Store | null; onClose: () => void }) {
  // Behåll senaste butiken medan rutan tonar ut (annars blinkar texten).
  const [shown, setShown] = React.useState<Store>("ios")
  if (store && store !== shown) setShown(store)
  const info = STORE[shown]
  return (
    <Dialog open={store !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        // Dialogen renderas utanför .landing (portal) – klassen ger samma mörka tema.
        // Den är själv .landing, så globals.css regel för telefoner gäller inte: blur bara från md, tät bakgrund under.
        className="landing max-w-[calc(100%-2rem)] overflow-hidden rounded-3xl border-white/10 bg-[#0d1117] p-0 text-center shadow-2xl shadow-black/60 sm:max-w-md md:bg-[#0d1117]/95 md:backdrop-blur-xl"
        data-testid="coming-soon"
      >
        {/* Glöd som radiell gradient (billig) i stället för blur-3xl. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-36 left-1/2 size-96 -translate-x-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_25%,transparent),transparent)]"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className={cn("absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground", FOCUS)}
        >
          <X className="size-5" aria-hidden />
        </button>
        <div className="relative space-y-5 px-6 pt-10 pb-7 sm:px-8">
          <motion.div
            initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="mx-auto w-fit"
          >
            <BrandMark size="lg" className="shadow-[0_0_40px_-4px] shadow-brand/60" />
          </motion.div>
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand uppercase">
              <BellRing className="size-3.5" aria-hidden /> Släpps snart
            </span>
            <DialogTitle className="text-2xl font-bold tracking-tight text-balance">Coavira är på väg till {info.name}</DialogTitle>
            <DialogDescription className="text-pretty text-muted-foreground">
              Vi lägger sista handen vid appen för iPhone och Android. Den kommer att finnas att ladda ned på både App Store och Google Play.
            </DialogDescription>
          </div>
          <ul className="space-y-2 text-left text-sm">
            {[
              "Gratis att ladda ned – konto med Apple, Google eller e-post i appen",
              "Du betalar bara för de tjänster du köper av din PT",
              "Träning, kost, kalender, chatt och samtal på ett ställe",
            ].map((t, i) => (
              <motion.li
                key={t}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.07, duration: 0.4, ease: EASE }}
                className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
              >
                <Smartphone className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden /> {t}
              </motion.li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={LINKS.ptApply}
              className={cn(
                "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-[0_0_24px_-6px] shadow-brand/70 transition-transform hover:-translate-y-0.5",
                FOCUS
              )}
            >
              Är du PT? Ansök redan nu
            </a>
            <a
              href={LINKS.supportEmail}
              className={cn(
                "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold transition-colors hover:bg-white/[0.1]",
                FOCUS
              )}
            >
              <Mail className="size-4" aria-hidden /> Kontakta oss
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------- brickor ---

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("fill-current", className)}>
      <path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.67.95 3.6.95.86 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z" />
    </svg>
  )
}

function PlayLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path fill="#00d7fe" d="M3.6 1.8c-.3.3-.5.8-.5 1.4v17.6c0 .6.2 1.1.5 1.4l.1.1 9.9-9.9v-.2L3.7 1.7z" />
      <path fill="#ffce00" d="m16.9 15.7-3.3-3.3v-.2l3.3-3.3.1.1 3.9 2.2c1.1.6 1.1 1.7 0 2.3l-3.9 2.2z" />
      <path fill="#ff3a44" d="M17 15.6 13.6 12 3.6 22.2c.4.4 1 .4 1.7.1L17 15.6" />
      <path fill="#00f076" d="M17 8.6 5.3 1.9c-.7-.4-1.3-.3-1.7.1L13.6 12z" />
    </svg>
  )
}

/**
 * En butiksbricka i App Store-/Google Play-stil (svart, logga, två rader).
 * `size="lg"` för hero och avslutande CTA, `md` för kort och menyer.
 */
export function StoreBadge({ store, size = "md", className }: { store: Store; size?: "md" | "lg"; className?: string }) {
  const openSoon = React.useContext(DownloadContext)
  const info = STORE[store]
  const url = STORE_URLS[store]
  const inner = (
    <>
      <span
        aria-hidden
        // Ljussvep med translate (ingen layout per bild) i stället för att animera left.
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-[translate,opacity] duration-700 group-hover:translate-x-[430%] group-hover:opacity-100"
      />
      {store === "ios" ? <AppleLogo className={size === "lg" ? "size-8" : "size-6"} /> : <PlayLogo className={size === "lg" ? "size-8" : "size-6"} />}
      <span className="flex flex-col items-start leading-none">
        <span className={cn("font-medium text-white/80", size === "lg" ? "text-[11px]" : "text-[10px]", store === "android" && "tracking-wide uppercase")}>{info.top}</span>
        <span className={cn("font-semibold tracking-tight text-white", size === "lg" ? "mt-1 text-[22px]" : "mt-0.5 text-lg")}>{info.bottom}</span>
      </span>
    </>
  )
  const cls = cn(
    // transform-gpu: brickan lyfts/trycks med transform vid hovring och tryck.
    "group relative inline-flex shrink-0 transform-gpu items-center gap-2.5 overflow-hidden rounded-[14px] border border-white/25 bg-black text-left shadow-lg shadow-black/40 transition-[border-color,box-shadow] duration-300 hover:border-white/45 hover:shadow-[0_10px_40px_-10px] hover:shadow-brand/40",
    size === "lg" ? "h-[60px] px-5" : "h-12 px-4",
    FOCUS,
    className
  )
  const motionProps = { whileHover: { y: -3 }, whileTap: { scale: 0.96 }, transition: { type: "spring" as const, stiffness: 420, damping: 22 } }
  if (url) {
    return (
      <motion.a href={url} target="_blank" rel="noopener noreferrer" aria-label={info.label} className={cls} data-store={store} {...motionProps}>
        {inner}
      </motion.a>
    )
  }
  return (
    <motion.button
      type="button"
      aria-label={`${info.label} (släpps snart)`}
      aria-haspopup="dialog"
      onClick={(e) => openSoon(store, e.currentTarget)}
      className={cls}
      data-store={store}
      {...motionProps}
    >
      {inner}
    </motion.button>
  )
}

/** Båda brickorna bredvid varandra (radbryts på smala skärmar). */
export function StoreBadges({ size = "md", className, align = "start" }: { size?: "md" | "lg"; className?: string; align?: "start" | "center" }) {
  return (
    <div role="group" aria-label="Ladda ned appen" className={cn("flex flex-wrap gap-3", align === "center" && "justify-center", className)}>
      <StoreBadge store="ios" size={size} />
      <StoreBadge store="android" size={size} />
    </div>
  )
}
