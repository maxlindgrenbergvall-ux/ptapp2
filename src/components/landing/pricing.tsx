"use client"

/**
 * Prissektionen (#priser): växla mellan klienter och PT:er. Klientkontot
 * kostar 0 kr, PT:er ansöker och verifieras manuellt. Bredvid en levande
 * exempelmeny med PT-tjänster: välj tjänst, testa mersäljet av kostcoaching
 * (samma flöde som i appen) och – som PT – sätt egna priser. Alla priser är
 * exempel, och "0 kr" gäller bara att skapa kontot (inga gratispass).
 */
import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion"
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CreditCard,
  Dumbbell,
  FileBadge,
  Layers,
  Lock,
  LogIn,
  Mail,
  Minus,
  Plus,
  RotateCcw,
  Salad,
  ShieldCheck,
  Sparkles,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { LINKS } from "@/components/landing/links"
import { EASE, fadeUp, FloatingBadge, GlowOrb, GradientText, GridBackdrop, Reveal, Section, stagger, useConfetti } from "@/components/landing/primitives"
import { formatSek } from "@/lib/money"
import { cn } from "@/lib/utils"

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const
const LIFT = { type: "spring", stiffness: 260, damping: 22 } as const
const PRIMARY_BTN =
  "group/btn inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-brand-foreground shadow-[0_14px_40px_-14px] shadow-brand/80 transition-[background-color,transform] hover:bg-brand/90 active:scale-[0.98] motion-reduce:active:scale-100"
const GHOST_BTN =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-foreground transition-colors hover:border-white/20 hover:bg-white/[0.08]"
/** Appens panelbakgrund (kort i mörkt läge) för mockups inne i glaskorten. */
const PANEL = "rounded-2xl border border-white/10 bg-[#0d1218]/90 shadow-2xl shadow-black/40"
const DIVIDER = "h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"

// ------------------------------------------------------------------ data ---

type Audience = "client" | "pt"
type ServiceId = "single" | "package" | "full" | "nutrition"

interface DemoService {
  id: ServiceId
  title: string
  summary: string
  icon: LucideIcon
  includesNutrition: boolean
  tag?: string
}

/** Exempelmeny hos en påhittad PT – samma fyra tjänstetyper som i appen. */
const SERVICES: readonly DemoService[] = [
  { id: "single", title: "Enstaka pass", summary: "1 pass", icon: Dumbbell, includesNutrition: false },
  { id: "package", title: "Träningsprogram", summary: "Paket med 5 pass", icon: Layers, includesNutrition: false },
  { id: "full", title: "Helhetspaket", summary: "8 pass · kostcoaching · 8 veckor", icon: Sparkles, includesNutrition: true, tag: "Träning + kost" },
  { id: "nutrition", title: "Kostcoaching", summary: "Kostschema, recept och uppföljning", icon: Salad, includesNutrition: true },
]

/** Exempelpriser (kr). PT:n sätter alltid sina egna priser. */
const EXAMPLE_PRICES: Record<ServiceId, number> = { single: 795, package: 3495, full: 6995, nutrition: 995 }
const PRICE_STEP = 50
const PRICE_MIN = 100
const PRICE_MAX = 30000

const PT_NAME = "Elin Söderberg"
const PT_FIRST = "Elin"

const byId = (id: ServiceId) => SERVICES.find((s) => s.id === id) ?? SERVICES[0]

const AUDIENCES: readonly { id: Audience; label: string; icon: LucideIcon }[] = [
  { id: "client", label: "För klienter", icon: UserRound },
  { id: "pt", label: "För PT:er", icon: BadgeCheck },
]
const tabId = (a: Audience) => `priser-flik-${a}`
const radioId = (id: ServiceId) => `priser-tjanst-${id}`
const PANEL_ID = "priser-panel"
const UPSELL_ID = "priser-mersalj"

const CLIENT_FEATURES = [
  "Boka och flytta pass med din PT",
  "Träningslogg med set, kg, reps och vilotimer",
  "Dagens kost – kcal och makron mot dina mål",
  "Framsteg efter det du tränar för",
  "Chatt med din PT, med bilagor",
  "Kalendersynk med Google, Outlook och Apple Kalender",
  "Flera PT:er samtidigt – ett aktivt kostschema i taget",
] as const

const PT_FEATURES = [
  "Sätt dina egna priser",
  "Sälj enstaka pass, träningsprogram, kostcoaching och helhetspaket",
  "Mersälj kostcoaching direkt i köpet",
  "Få betalt med kort via Stripe",
  "Passgränsen skyddar dig mot obetalda pass",
  "Kalender med tillgänglighet och dra-och-släpp",
  "Bygg pass och kostscheman med recept",
  "Verifierad profil efter granskning av dina certifikat",
] as const

const SIGN_IN = ["Apple", "Google", "E-post"] as const

const APPLY_STEPS: readonly { icon: LucideIcon; label: string }[] = [
  { icon: FileBadge, label: "Skicka dina certifikat" },
  { icon: ShieldCheck, label: "Vi granskar manuellt" },
  { icon: BadgeCheck, label: "Coavira skapar ditt konto" },
]

const PROMISES: readonly { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: "Inga gratispass – PT:er får alltid betalt", text: "Passgränsen gör att det aldrig bokas fler pass än det som är betalt." },
  { icon: CreditCard, title: "Betala med kort via Stripe", text: "Priset du ser är priset du betalar." },
  { icon: RotateCcw, title: "Avbokat pass = passet tillbaka", text: "Ett avbokat pass räknas inte av – boka en ny tid när det passar." },
]

// ------------------------------------------------------------- animation ---

const listItem: Variants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
}

const drawCheck: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: { pathLength: 1, opacity: 1, transition: { duration: 0.45, ease: EASE, delay: 0.12 } },
}

/** In- och uttoning när huvudkortet byts (klient ↔ PT). */
const SWAP = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: EASE } },
  exit: { opacity: 0, y: -16, scale: 0.98, transition: { duration: 0.2, ease: EASE } },
} satisfies Pick<HTMLMotionProps<"article">, "initial" | "animate" | "exit">

/** Ett rörelsevärde som snurrar varv på varv medan `active` (syns + ingen "minska rörelse"). */
function useSpin(active: boolean, seconds: number) {
  const value = useMotionValue(0)
  React.useEffect(() => {
    if (!active) return
    const from = value.get()
    const controls = animate(value, [from, from + 360], { duration: seconds, ease: "linear", repeat: Infinity })
    return () => controls.stop()
  }, [active, seconds, value])
  return value
}

// ------------------------------------------------------------ byggstenar ---

/**
 * Kronor som räknar upp när de syns och glider till nya värden. Startar på
 * det riktiga priset (SSR och första render visar aldrig "0 kr"); första
 * uppräkningen går från 60 % av priset. `pulse` ger en liten studs vid varje
 * ändring. Direkt värde med "minska rörelse".
 */
function Kr({ value, start, pulse, className }: { value: number; start: boolean; pulse?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  const amount = useMotionValue(value)
  const scale = useMotionValue(1)
  const counted = React.useRef(false)
  const text = useTransform(amount, (v) => formatSek(v))
  React.useEffect(() => {
    if (reduce || !start) {
      amount.set(value)
      return
    }
    const count = animate(amount, counted.current ? value : [Math.round(value * 0.6), value], { duration: 0.8, ease: EASE })
    counted.current = true
    const pop = pulse ? animate(scale, [1, 1.08, 1], { duration: 0.45, ease: "easeOut" }) : undefined
    return () => {
      count.stop()
      pop?.stop()
    }
  }, [amount, scale, value, start, reduce, pulse])
  return (
    <motion.span style={{ scale }} className={cn("inline-block origin-right whitespace-nowrap tabular-nums", className)}>
      <motion.span aria-hidden>{text}</motion.span>
      <span className="sr-only">{formatSek(value)}</span>
    </motion.span>
  )
}

/** Mask som bara släpper igenom en 1px ram (kantens innehåll syns, mitten inte). */
const RING_MASK: React.CSSProperties = {
  WebkitMaskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
  WebkitMaskClip: "content-box, border-box",
  WebkitMaskComposite: "xor",
  maskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
  maskClip: "content-box, border-box",
  maskComposite: "exclude",
}

/** Gradientkant med en ljusstråle som roterar runt kortet (står still med "minska rörelse"). */
function BeamBorder({ active }: { active: boolean }) {
  const spin = useSpin(active, 7)
  return (
    <div aria-hidden style={RING_MASK} className="pointer-events-none absolute -inset-px overflow-hidden rounded-[inherit] p-px">
      <div className="absolute inset-0 bg-gradient-to-b from-brand/45 via-white/10 to-emerald-500/35" />
      <motion.div
        style={{ rotate: spin, x: "-50%", y: "-50%" }}
        className="absolute top-1/2 left-1/2 h-[300%] w-[300%] [background:conic-gradient(from_0deg,transparent_0deg,var(--brand)_40deg,#6ee7b7_80deg,transparent_140deg,transparent_190deg,#10b981_240deg,transparent_300deg)]"
      />
    </div>
  )
}

/**
 * Glaskort som lyfter vid hover och lyser grönt där muspekaren är.
 * `highlight` ger den roterande gradientkanten och en grön ton uppifrån.
 */
function PriceCard({
  children,
  className,
  highlight,
  lift = -6,
  ...rest
}: { children: React.ReactNode; className?: string; highlight?: boolean; lift?: number } & Omit<HTMLMotionProps<"article">, "children">) {
  const ref = React.useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const inView = useInView(ref, { margin: "-10% 0px" })
  const mx = useMotionValue(-999)
  const my = useMotionValue(-999)
  const spot = useMotionTemplate`radial-gradient(440px circle at ${mx}px ${my}px, rgba(172, 237, 55, 0.09), transparent 65%)`
  return (
    <motion.article
      ref={ref}
      whileHover={{ y: lift }}
      transition={LIFT}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        mx.set(e.clientX - r.left)
        my.set(e.clientY - r.top)
      }}
      className={cn(
        "group/card relative rounded-3xl border bg-white/[0.04] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_40px_90px_-50px_rgba(0,0,0,0.9)] backdrop-blur-md",
        highlight ? "border-transparent" : "border-white/10",
        className
      )}
      {...rest}
    >
      {highlight && <BeamBorder active={inView && !reduce} />}
      {highlight && <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-brand/[0.08] via-transparent to-transparent" />}
      <motion.div
        aria-hidden
        style={{ background: spot }}
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/card:opacity-100"
      />
      <div className="relative">{children}</div>
    </motion.article>
  )
}

/** Liten etikett överst i ett kort ("För klienter", "För PT:er"). */
function Tag({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold">
      <Icon aria-hidden className="size-3.5 text-brand" />
      {children}
    </span>
  )
}

/** Bocklista där raderna glider in en i taget och bockarna ritas fram. */
function CheckList({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <motion.ul
      aria-label={label}
      variants={stagger(0.06, 0.1)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      className="space-y-3"
    >
      {items.map((item) => (
        <motion.li key={item} variants={listItem} className="flex items-start gap-3 text-sm leading-snug">
          <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 ring-1 ring-brand/30">
            <svg viewBox="0 0 24 24" fill="none" className="size-3 text-brand">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" variants={drawCheck} />
            </svg>
          </span>
          <span className="text-foreground/90">{item}</span>
        </motion.li>
      ))}
    </motion.ul>
  )
}

// ------------------------------------------------------- målgruppsväxlare ---

/** Segmenterad växlare (flikar) med ett pill som glider mellan valen. Piltangenter byter flik. */
function AudienceToggle({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = AUDIENCES.findIndex((a) => a.id === value)
    let next = -1
    if (e.key === "ArrowRight") next = (i + 1) % AUDIENCES.length
    else if (e.key === "ArrowLeft") next = (i - 1 + AUDIENCES.length) % AUDIENCES.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = AUDIENCES.length - 1
    if (next < 0) return
    e.preventDefault()
    const id = AUDIENCES[next].id
    onChange(id)
    document.getElementById(tabId(id))?.focus()
  }
  return (
    <LayoutGroup id="priser-malgrupp">
      <div
        role="tablist"
        aria-label="Visa priser för"
        className="relative flex w-full max-w-sm rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] backdrop-blur-md"
      >
        {AUDIENCES.map(({ id, label, icon: Icon }) => {
          const active = id === value
          return (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={PANEL_ID}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={onKeyDown}
              className={cn(
                "relative flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
                active ? "text-brand-foreground" : "text-muted-foreground hover:text-foreground",
                FOCUS
              )}
            >
              {active && (
                <motion.span layoutId="pill" transition={SPRING} aria-hidden className="absolute inset-0 rounded-full bg-brand shadow-[0_8px_28px_-8px] shadow-brand/70" />
              )}
              <Icon aria-hidden className="relative size-4" />
              <span className="relative">{label}</span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}

// ----------------------------------------------------------- huvudkorten ---

/** "0 kr" som studsar in – gäller bara att skapa klientkontot. */
function ZeroPrice() {
  return (
    <div className="relative mt-1 flex items-end gap-3">
      <span aria-hidden className="pointer-events-none absolute -top-4 -left-6 size-32 rounded-full bg-brand/20 blur-2xl" />
      <p className="relative flex items-baseline gap-2">
        <motion.span
          initial={{ opacity: 0, scale: 0.5, y: 16 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 240, damping: 15, delay: 0.15 }}
          className="inline-block origin-bottom-left text-7xl leading-[0.9] font-extrabold tracking-tighter sm:text-8xl"
        >
          <GradientText>0</GradientText>
        </motion.span>
        <span className="text-3xl font-bold tracking-tight">kr</span>
      </p>
      <span className="relative pb-2 text-sm leading-tight text-muted-foreground">
        att skapa
        <br />
        konto
      </span>
    </div>
  )
}

/** Klientkortet: 0 kr för kontot, allt i appen, och "Skapa konto". */
function ClientCard({ onShowPt }: { onShowPt: () => void }) {
  return (
    <PriceCard highlight aria-labelledby="priser-klient-titel" className="p-6 sm:p-8" {...SWAP}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tag icon={UserRound}>För klienter</Tag>
        <span className="text-xs text-muted-foreground">Kom igång direkt</span>
      </div>
      <h3 id="priser-klient-titel" className="mt-6 text-lg font-semibold">
        Klientkonto
      </h3>
      <ZeroPrice />
      <p className="mt-5 text-pretty text-muted-foreground">
        Du betalar bara för de tjänster du köper av din PT – <span className="font-medium text-foreground">priset du ser är priset du betalar</span>. Kort
        via Stripe.
      </p>
      <div aria-hidden className={cn(DIVIDER, "my-6")} />
      <CheckList items={CLIENT_FEATURES} label="Det här finns i appen" />
      <div className="mt-8">
        <Link href={LINKS.start} className={cn(PRIMARY_BTN, "w-full", FOCUS)}>
          Skapa konto
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover/btn:translate-x-1 motion-reduce:transition-none" />
        </Link>
        <ul aria-label="Skapa konto med" className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {SIGN_IN.map((way) => (
            <li key={way} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted-foreground">
              {way}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-6 flex flex-wrap items-center gap-x-1 border-t border-white/5 pt-4 text-sm text-muted-foreground">
        Är du PT?
        <button
          type="button"
          onClick={onShowPt}
          className={cn("inline-flex min-h-11 items-center gap-1 rounded-md px-1 font-semibold text-brand underline-offset-4 hover:underline", FOCUS)}
        >
          Så ansöker du <ArrowRight aria-hidden className="size-3.5" />
        </button>
      </p>
    </PriceCard>
  )
}

/** Ansökan i tre steg med en linje som ritas fram mellan stegen. */
function ApplySteps() {
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Så blir du PT på Coavira</p>
      <div className="relative mt-3">
        <span aria-hidden className="absolute top-5 right-[16.66%] left-[16.66%] h-px bg-white/10" />
        <motion.span
          aria-hidden
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: EASE, delay: 0.3 }}
          className="absolute top-5 right-[16.66%] left-[16.66%] h-px origin-left bg-gradient-to-r from-brand to-emerald-400"
        />
        <ol className="relative grid grid-cols-3 gap-2">
          {APPLY_STEPS.map(({ icon: Icon, label }, i) => (
            <motion.li
              key={label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.2 + i * 0.35 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <span aria-hidden className="grid size-10 place-items-center rounded-full border border-brand/30 bg-[#0d1218] text-brand shadow-[0_0_24px_-6px] shadow-brand/60">
                <Icon className="size-4" />
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                <span className="sr-only">Steg {i + 1}: </span>
                {label}
              </span>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** PT-kortet: egna priser, ansökan via e-post (manuell granskning) och inloggning. */
function PtCard() {
  return (
    <PriceCard highlight aria-labelledby="priser-pt-titel" className="p-6 sm:p-8" {...SWAP}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tag icon={BadgeCheck}>För PT:er</Tag>
        <span className="text-xs text-muted-foreground">Verifieras manuellt</span>
      </div>
      <h3 id="priser-pt-titel" className="mt-6 text-lg font-semibold">
        PT-konto
      </h3>
      <p className="mt-1 text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-6xl">
        <GradientText>Egna priser.</GradientText>
      </p>
      <p className="mt-5 text-pretty text-muted-foreground">
        Sälj pass, program och kostcoaching och få betalt med kort via Stripe. <span className="font-medium text-foreground">Passgränsen</span> skyddar dig mot
        obetalda pass.
      </p>
      <ApplySteps />
      <div aria-hidden className={cn(DIVIDER, "my-6")} />
      <CheckList items={PT_FEATURES} label="Det här får du som PT" />
      <div className="mt-8">
        <a href={LINKS.ptApply} className={cn(PRIMARY_BTN, "w-full", FOCUS)}>
          <Mail aria-hidden className="size-4" />
          Ansök som PT
          <span className="sr-only"> (öppnar e-post)</span>
          <ArrowRight aria-hidden className="size-4 transition-transform group-hover/btn:translate-x-1 motion-reduce:transition-none" />
        </a>
        <p className="mt-3 text-center text-xs text-pretty text-muted-foreground">Vi granskar dina certifikat manuellt och återkommer med villkor.</p>
      </div>
      <div className="mt-6 flex justify-center border-t border-white/5 pt-4">
        <Link href={LINKS.ptLogin} className={cn(GHOST_BTN, FOCUS)}>
          <LogIn aria-hidden className="size-4 text-brand" />
          <span>
            <span className="text-muted-foreground">Redan PT?</span> Logga in
          </span>
        </Link>
      </div>
    </PriceCard>
  )
}

// ------------------------------------------------- exempelmeny & varukorg ---

interface ServicesProps {
  audience: Audience
  prices: Record<ServiceId, number>
  onPrice: (id: ServiceId, price: number) => void
  selected: ServiceId
  onSelect: (id: ServiceId) => void
  addOn: boolean
  onAddOn: (on: boolean) => void
}

/** Exempel-PT:ns namn och verifieringsbricka (mockup). */
function PtIdentity() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-3.5 pl-1">
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand to-emerald-400 text-xs font-bold text-brand-foreground">
        ES
      </span>
      <span className="text-sm leading-tight">
        <span className="block font-semibold">{PT_NAME}</span>
        <span className="flex items-center gap-1 text-xs font-medium text-brand">
          <BadgeCheck aria-hidden className="size-3.5" /> Verifierad PT
        </span>
      </span>
    </div>
  )
}

/** Ljusglimt som sveper över mersäljsknappen (bara när den syns och rörelse är tillåten). */
function Shimmer() {
  return (
    <motion.span
      aria-hidden
      animate={{ x: ["-120%", "380%"] }}
      transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 2.6 }}
      className="pointer-events-none absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
    />
  )
}

/**
 * Exempelmenyn: välj tjänst (radioknappar, piltangenter), mersälj av
 * kostcoaching med konfetti, varukorg med animerad summa och – som PT –
 * knappar för att sätta egna priser.
 */
function ServicesCard({ audience, prices, onPrice, selected, onSelect, addOn, onAddOn }: ServicesProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const upsellRef = React.useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, margin: "-15% 0px" })
  const inView = useInView(ref, { margin: "-10% 0px" })
  const reduce = !!useReducedMotion()
  const fire = useConfetti()
  const [open, setOpen] = React.useState(false)
  const [paid, setPaid] = React.useState(false)
  const [say, setSay] = React.useState("")

  const pt = audience === "pt"
  const start = seen || reduce
  const service = byId(selected)
  const withAddOn = addOn && !service.includesNutrition
  const total = prices[selected] + (withAddOn ? prices.nutrition : 0)

  const choose = (id: ServiceId) => {
    onSelect(id)
    setPaid(false)
    if (byId(id).includesNutrition) setOpen(false)
  }

  const onRadioKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (i + 1) % SERVICES.length
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (i - 1 + SERVICES.length) % SERVICES.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = SERVICES.length - 1
    if (next < 0) return
    e.preventDefault()
    const id = SERVICES[next].id
    choose(id)
    document.getElementById(radioId(id))?.focus()
  }

  const add = () => {
    onAddOn(true)
    setOpen(false)
    setPaid(false)
    setSay(`Tillagt! Kostcoaching hos ${PT_FIRST}. Totalt ${formatSek(prices[selected] + prices.nutrition)}.`)
    void fire(upsellRef.current, { particles: 80, spread: 75 })
    requestAnimationFrame(() => undoRef.current?.focus())
  }

  const remove = () => {
    onAddOn(false)
    setPaid(false)
    setSay(`Kostcoaching borttagen. Totalt ${formatSek(prices[selected])}.`)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const decline = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const bump = (id: ServiceId, delta: number) => {
    const next = Math.min(PRICE_MAX, Math.max(PRICE_MIN, prices[id] + delta))
    onPrice(id, next)
    setPaid(false)
    setSay(`${byId(id).title}: ${formatSek(next)}`)
  }

  const pay = () => {
    setPaid(true)
    setSay(pt ? "Demo: klienten skickas vidare till Stripe för kortbetalning." : "Demo: i appen skickas du nu vidare till Stripe för kortbetalning.")
  }

  return (
    <PriceCard lift={-4} aria-labelledby="priser-tjanster-titel" className="p-5 sm:p-7">
      <div ref={ref}>
        {/* Rubrik + exempel-PT */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={audience}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="max-w-md min-w-0"
            >
              <h3 id="priser-tjanster-titel" className="text-2xl font-bold tracking-tight">
                {pt ? "Exempel på din tjänstemeny" : "Exempel på PT-tjänster"}
              </h3>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">
                {pt ? (
                  <>
                    <span className="font-medium text-emerald-300">Exempel – du sätter dina egna priser.</span> Ändra ett pris och se exakt vad klienten betalar.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-emerald-300">Exempel – PT:n sätter sina egna priser.</span> Välj en tjänst och testa mersäljet, precis som i
                    appen.
                  </>
                )}
              </p>
            </motion.div>
          </AnimatePresence>
          <PtIdentity />
        </div>

        {/* Tjänster (radioknappar) – med prisknappar för PT */}
        <LayoutGroup id="priser-tjanster">
          <div role="radiogroup" aria-label={`Tjänster hos ${PT_NAME} (exempel)`} className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {SERVICES.map((s, i) => {
              const active = s.id === selected
              const Icon = s.icon
              return (
                <div key={s.id} className="relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.02]">
                  {active && (
                    <motion.span
                      layoutId="vald"
                      transition={SPRING}
                      style={{ borderRadius: 16 }}
                      aria-hidden
                      className="absolute -inset-px border border-brand/60 bg-brand/[0.07] shadow-[0_0_32px_-12px] shadow-brand/70"
                    />
                  )}
                  <motion.button
                    id={radioId(s.id)}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => choose(s.id)}
                    onKeyDown={(e) => onRadioKey(e, i)}
                    whileTap={{ scale: 0.98 }}
                    className={cn("relative flex flex-1 items-start gap-3 rounded-2xl p-3.5 text-left", FOCUS)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-300",
                        active ? "bg-brand text-brand-foreground" : "bg-white/[0.06] text-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{s.title}</span>
                        {s.tag && (
                          <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300 uppercase ring-1 ring-emerald-400/20">
                            {s.tag}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{s.summary}</span>
                      <span className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-[11px] text-muted-foreground">{pt ? "Ditt pris" : "t.ex."}</span>
                        <Kr value={prices[s.id]} start={start} className="text-lg font-bold tracking-tight" />
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1 grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-300",
                        active ? "border-brand bg-brand" : "border-white/25"
                      )}
                    >
                      {active && <span className="size-2 rounded-full bg-brand-foreground" />}
                    </span>
                  </motion.button>
                  {pt && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="relative flex items-center justify-between gap-2 border-t border-white/[0.06] py-1 pr-1.5 pl-3.5"
                    >
                      <span className="text-xs text-muted-foreground">Sätt ditt pris</span>
                      <span className="flex items-center">
                        <button
                          type="button"
                          aria-label={`Sänk priset för ${s.title} med ${PRICE_STEP} kr`}
                          disabled={prices[s.id] <= PRICE_MIN}
                          onClick={() => bump(s.id, -PRICE_STEP)}
                          className={cn(
                            "grid size-11 place-items-center rounded-full text-muted-foreground transition hover:bg-white/[0.08] hover:text-foreground active:scale-90 disabled:opacity-40 motion-reduce:active:scale-100",
                            FOCUS
                          )}
                        >
                          <Minus aria-hidden className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Höj priset för ${s.title} med ${PRICE_STEP} kr`}
                          disabled={prices[s.id] >= PRICE_MAX}
                          onClick={() => bump(s.id, PRICE_STEP)}
                          className={cn(
                            "grid size-11 place-items-center rounded-full text-brand transition hover:bg-brand/10 active:scale-90 disabled:opacity-40 motion-reduce:active:scale-100",
                            FOCUS
                          )}
                        >
                          <Plus aria-hidden className="size-4" />
                        </button>
                      </span>
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        </LayoutGroup>

        {/* Varukorgen – ser ut som appens "Bekräfta köp" */}
        <div className={cn(PANEL, "mt-5 p-4 sm:p-5")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{pt ? "Så ser klienten köpet" : "Din varukorg"}</p>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock aria-hidden className="size-3.5" /> Kort via Stripe
            </span>
          </div>

          <ul aria-label="Varukorg" className="relative mt-2">
            <AnimatePresence mode="popLayout">
              <motion.li
                key={service.id}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="flex items-start justify-between gap-3 border-b border-white/[0.06] py-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{service.title}</span>
                  <span className="block text-xs text-muted-foreground">{service.summary}</span>
                </span>
                <Kr value={prices[service.id]} start={start} className="shrink-0 text-sm font-semibold" />
              </motion.li>
              {withAddOn && (
                <motion.li
                  key="kostcoaching"
                  layout
                  initial={{ opacity: 0, y: -10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  className="flex items-start justify-between gap-3 border-b border-white/[0.06] py-3"
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <Salad aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Kostcoaching</span>
                      <span className="block text-xs text-muted-foreground">Tillägg · kostschema, recept och uppföljning</span>
                    </span>
                  </span>
                  <Kr value={prices.nutrition} start={start} className="shrink-0 text-sm font-semibold text-brand" />
                </motion.li>
              )}
            </AnimatePresence>
          </ul>

          {/* Mersälj */}
          <div ref={upsellRef} className="relative py-3">
            <AnimatePresence mode="popLayout">
              {service.includesNutrition ? (
                <motion.p
                  key="ingar"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand"
                >
                  <Check aria-hidden className="size-4" />
                  {selected === "full" ? "Kostcoaching ingår i helhetspaketet" : "Kostcoaching ingår"}
                </motion.p>
              ) : withAddOn ? (
                <motion.div key="tillagt" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-2">
                  <motion.span
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 16 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1.5 text-sm font-semibold text-brand ring-1 ring-brand/30"
                  >
                    <Check aria-hidden className="size-4" /> Tillagt!
                  </motion.span>
                  <span className="text-sm text-muted-foreground">Kostcoaching hos {PT_FIRST}</span>
                  <button
                    ref={undoRef}
                    type="button"
                    onClick={remove}
                    aria-label="Ångra – ta bort kostcoaching"
                    className={cn(
                      "ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground",
                      FOCUS
                    )}
                  >
                    <Undo2 aria-hidden className="size-4" /> Ångra
                  </button>
                </motion.div>
              ) : (
                <motion.div key="erbjudande" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <button
                    ref={triggerRef}
                    type="button"
                    aria-expanded={open}
                    aria-controls={UPSELL_ID}
                    onClick={() => setOpen((o) => !o)}
                    className={cn(
                      "relative inline-flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-xl border border-dashed border-brand/45 bg-brand/[0.06] px-3.5 text-left text-sm font-semibold text-brand transition-colors hover:bg-brand/[0.12] sm:w-auto",
                      FOCUS
                    )}
                  >
                    {inView && !reduce && !open && <Shimmer />}
                    <Plus aria-hidden className={cn("size-4 transition-transform duration-300", open && "rotate-45")} />
                    Lägg till kostcoaching
                    <span className="ml-auto pl-2 text-xs font-medium text-muted-foreground tabular-nums">+ {formatSek(prices.nutrition)}</span>
                  </button>
                  <AnimatePresence>
                    {open && (
                      <motion.div
                        id={UPSELL_ID}
                        role="group"
                        aria-label="Mersälj: kostcoaching"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.15 } }}
                        transition={{ type: "spring", stiffness: 380, damping: 28 }}
                        onKeyDown={(e) => {
                          if (e.key !== "Escape") return
                          e.stopPropagation()
                          decline()
                        }}
                        className="relative mt-2 origin-top overflow-hidden rounded-2xl border border-white/10 bg-[#141a22] p-4 shadow-2xl shadow-black/50"
                      >
                        <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-brand/15 blur-2xl" />
                        <div className="relative flex items-start gap-3">
                          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand ring-1 ring-brand/25">
                            <Salad className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-balance">Kosten är det som syns på riktigt – vill du lägga till kostcoaching av {PT_FIRST}?</p>
                            <p className="mt-1 text-xs text-muted-foreground">Personligt kostschema, recept och uppföljning.</p>
                          </div>
                        </div>
                        <div className="relative mt-4 flex flex-col gap-2 sm:flex-row">
                          <button type="button" onClick={add} className={cn(PRIMARY_BTN, "min-h-11 px-5 sm:flex-1", FOCUS)}>
                            <Sparkles aria-hidden className="size-4" /> Ja, lägg till · {formatSek(prices.nutrition)}
                          </button>
                          <button type="button" onClick={decline} className={cn(GHOST_BTN, FOCUS)}>
                            Nej tack
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Summa + betala */}
          <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-3">
            <span className="pb-1 text-sm text-muted-foreground">Totalt</span>
            <Kr value={total} start={start} pulse className="text-3xl font-bold tracking-tight" />
          </div>
          <button type="button" onClick={pay} className={cn(PRIMARY_BTN, "mt-4 w-full", FOCUS)}>
            <CreditCard aria-hidden className="size-4" /> Betala <Kr value={total} start={start} />
          </button>
          <AnimatePresence>
            {paid && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="mt-3 flex items-start gap-2 text-xs text-pretty text-brand"
              >
                <Lock aria-hidden className="mt-px size-3.5 shrink-0" />
                {pt
                  ? "Demo – klienten skickas vidare till Stripe, och passen låses upp när betalningen är klar."
                  : "Demo – i appen skickas du nu vidare till Stripe för säker kortbetalning."}
              </motion.p>
            )}
          </AnimatePresence>
          <p className="mt-3 text-xs text-muted-foreground">{pt ? "Klienten betalar exakt det pris du sätter." : "Priset du ser är priset du betalar."}</p>
        </div>
        <p className="sr-only" aria-live="polite">
          {say}
        </p>
      </div>
    </PriceCard>
  )
}

/** Högra kolumnen: exempelmenyn med två svävande brickor (bara på stora skärmar) som rör sig lite med scrollen. */
function ServicesColumn({ className, ...props }: ServicesProps & { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const up = useTransform(scrollYProgress, [0, 1], [14, -14])
  const down = useTransform(scrollYProgress, [0, 1], [-12, 12])
  return (
    <div ref={ref} className={cn("relative", className)}>
      <motion.div aria-hidden style={reduce ? undefined : { y: up }} className="absolute -top-8 right-8 z-10 hidden lg:block">
        <FloatingBadge className="relative" delay={0.3}>
          <Lock className="size-4 text-brand" /> Kort via Stripe
        </FloatingBadge>
      </motion.div>
      <motion.div aria-hidden style={reduce ? undefined : { y: down }} className="absolute right-10 -bottom-8 z-10 hidden lg:block">
        <FloatingBadge className="relative" delay={0.9} distance={8}>
          <ShieldCheck className="size-4 text-brand" /> Passgräns: inga obetalda pass
        </FloatingBadge>
      </motion.div>
      <ServicesCard {...props} />
    </div>
  )
}

// --------------------------------------------------------------- löften ---

/** Tre korta löften under korten. */
function Promises() {
  return (
    <motion.ul
      aria-label="Bra att veta"
      variants={stagger(0.1)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      className="mt-12 grid gap-3 md:grid-cols-3"
    >
      {PROMISES.map(({ icon: Icon, title, text }) => (
        <motion.li
          key={title}
          variants={fadeUp}
          whileHover={{ y: -3 }}
          className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md transition-colors hover:border-white/20"
        >
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  )
}

/** Rutnät och gröna glödfält bakom sektionen. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <GridBackdrop className="opacity-50" />
      <GlowOrb className="top-1/3 left-[6%] size-[26rem] max-w-[80vw]" />
      <GlowOrb className="right-[6%] bottom-[12%] size-[22rem] max-w-[70vw] bg-emerald-500/15" />
    </div>
  )
}

// ------------------------------------------------------------- sektionen ---

/** Priser & medlemskap: målgruppsväxlare, huvudkort (klient/PT), exempelmeny och löften. */
export function Pricing() {
  const [audience, setAudience] = React.useState<Audience>("client")
  const [prices, setPrices] = React.useState<Record<ServiceId, number>>(EXAMPLE_PRICES)
  const [selected, setSelected] = React.useState<ServiceId>("package")
  const [addOn, setAddOn] = React.useState(false)

  const showPt = () => {
    setAudience("pt")
    requestAnimationFrame(() => document.getElementById(tabId("pt"))?.focus())
  }

  return (
    <Section
      id="priser"
      className="isolate overflow-x-clip"
      eyebrow="Priser & medlemskap"
      title={
        <>
          Tydliga priser. <GradientText>Inga dolda avgifter.</GradientText>
        </>
      }
      intro="Som klient skapar du konto för 0 kr. Du betalar bara för det du köper av din PT – med kort via Stripe, och priset du ser är priset du betalar."
    >
      <Backdrop />
      <Reveal className="mb-10 flex justify-center sm:mb-12">
        <AudienceToggle value={audience} onChange={setAudience} />
      </Reveal>
      <Reveal delay={0.1} role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(audience)} className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="relative lg:col-span-5">
          <div aria-hidden className="pointer-events-none absolute inset-x-8 inset-y-16 -z-10 rounded-full bg-brand/15 blur-3xl" />
          <AnimatePresence mode="wait">{audience === "client" ? <ClientCard key="client" onShowPt={showPt} /> : <PtCard key="pt" />}</AnimatePresence>
        </div>
        <ServicesColumn
          className="lg:col-span-7"
          audience={audience}
          prices={prices}
          onPrice={(id, price) => setPrices((p) => ({ ...p, [id]: price }))}
          selected={selected}
          onSelect={setSelected}
          addOn={addOn}
          onAddOn={setAddOn}
        />
      </Reveal>
      <Promises />
    </Section>
  )
}
