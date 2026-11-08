"use client"

/**
 * Hybrid-landningssida (förhandsgranskning, /landing-preview).
 *
 * Kombinerar dagens landningssida (/) med förslaget från /landing-preview:
 *
 *  Från dagens sida – innehållet som säljer:
 *   - Varumärkesraden "Träning och kost. På dina villkor." och värdeerbjudandet.
 *   - Butikslänkar direkt i hero + "Är du PT? Ansök" (konverteringspunkterna).
 *   - Faktaraden (livsmedel, kalendersynk, hälsodata, chatt, EU) – utan marquee.
 *   - "Din coach. Ett tryck bort." – chatt, teknikvideo, samtal, missat samtal.
 *   - "Gratis app. Betala bara för din coach." med växeln klient/PT.
 *   - "Din resa börjar nu." och den rikare sidfoten (utan jättevattenstämpeln).
 *
 *  Från förslaget – formen:
 *   - Typografisk hierarki (Geist, negativ spärrning), lugn struktur, få ytor.
 *   - Appens riktiga vyer som HTML (passet med förra vikten, klient/PT-flikar).
 *   - Korta mikrorörelser (≤ 500 ms, bara transform/opacity) och reducerad rörelse.
 *
 *  Bort från båda: glöd, gradienttext, svävande notischips, konfetti, marquee.
 *  Limegrönt (#84cc16) bara för primära handlingar och status.
 *
 *  Rättat mot appen: hälsodata synkas från Apple Hälsa, Health Connect och
 *  Strava (dagens sida nämner Garmin, som appen inte har).
 */
import { CalendarDays, Check, HeartPulse, MessageCircle, Phone, PhoneMissed, Play, ScanBarcode, ShieldCheck, Video } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { LINKS, STORE_URLS } from "@/components/landing/links"
import { cn } from "@/lib/utils"

// ------------------------------------------------------------ tokens ---
// Kontrast mot #131916: text 17,1:1 · dämpad #a3aba6 7,6:1 · svag #7d857f 4,7:1 (bara mot bakgrunden) · lime 9,0:1.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#84cc16] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131916]"
const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8"
const SECTION = "scroll-mt-20 border-t border-[rgba(249,251,248,0.08)] py-20 sm:py-28"

export function LandingPreview() {
  return (
    <div className="min-h-svh bg-[#131916] font-sans text-[#f9fbf8] antialiased" style={{ colorScheme: "dark" }}>
      <style>{CSS}</style>
      <a
        href="#innehall"
        className={cn("sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[#f9fbf8] focus:px-4 focus:py-2 focus:text-[#131916]", FOCUS)}
      >
        Hoppa till innehållet
      </a>
      <PreviewBanner />
      <Nav />
      <main id="innehall" tabIndex={-1} className="outline-none">
        <Hero />
        <FactRow />
        <Features />
        <ChatSection />
        <ProductViews />
        <Pricing />
        <ExampleWeek />
        <Download />
      </main>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------- primitives ---

/** Tonar in när elementet syns (8 px uppåt, 400 ms). Statisk med reducerad rörelse. */
function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "li" }) {
  const ref = React.useRef<HTMLElement>(null)
  const shown = useInView(ref)
  return (
    <Tag ref={ref as never} className={cn("lp-reveal", shown && "lp-in", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  )
}

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [shown, setShown] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return shown
}

function SectionHeading({ id, kicker, title, lead, center = false }: { id: string; kicker: string; title: React.ReactNode; lead?: string; center?: boolean }) {
  return (
    <Reveal className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <p className="text-sm font-medium text-[#a3aba6]">{kicker}</p>
      <h2 id={id} className="mt-3 text-[clamp(1.875rem,4.2vw,3rem)] leading-[1.06] font-semibold tracking-[-0.03em] text-balance">
        {title}
      </h2>
      {lead && <p className={cn("mt-4 max-w-[60ch] text-[17px] leading-[1.55] text-[#a3aba6]", center && "mx-auto")}>{lead}</p>}
    </Reveal>
  )
}

function Tick({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
        on ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "border-[rgba(249,251,248,0.22)]",
        className
      )}
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  )
}

/** Två flikar (WAI-ARIA tabs): klick eller piltangenter, fokus följer valet. */
function Segmented<T extends string>({ label, value, onChange, options, idPrefix }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; idPrefix: string }) {
  const refs = React.useRef<Partial<Record<T, HTMLButtonElement | null>>>({})
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const i = options.findIndex((o) => o.id === value)
    const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length].id
    onChange(next)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="inline-flex rounded-full border border-[rgba(249,251,248,0.12)] p-1">
      {options.map((o) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[o.id] = el
          }}
          id={`${idPrefix}-tab-${o.id}`}
          role="tab"
          type="button"
          aria-selected={value === o.id}
          aria-controls={`${idPrefix}-panel-${o.id}`}
          tabIndex={value === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
          className={cn(
            "lp-press h-10 rounded-full px-5 text-sm font-medium transition-colors duration-200",
            value === o.id ? "bg-[#f9fbf8] text-[#131916]" : "text-[#a3aba6] hover:text-[#f9fbf8]",
            FOCUS
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Butikslänk – eller, utan publicerad länk, en ärlig "Släpps snart"-ruta (ingen knapp som inte leder någonstans). */
function StoreLink({ store, tone = "dark" }: { store: "ios" | "android"; tone?: "dark" | "light" }) {
  const url = STORE_URLS[store]
  const name = store === "ios" ? "App Store" : "Google Play"
  const light = tone === "light"
  const cls = "inline-flex h-14 min-w-40 flex-col items-start justify-center rounded-2xl border px-5"
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          cls,
          "lp-press transition-colors",
          light ? "border-[#131916] bg-[#131916] text-[#f9fbf8] hover:bg-[#232b26]" : "border-[rgba(249,251,248,0.2)] hover:bg-[rgba(249,251,248,0.06)]",
          FOCUS
        )}
      >
        <span className={cn("text-[11px]", light ? "text-[#c9cfcb]" : "text-[#a3aba6]")}>{store === "ios" ? "Hämta i" : "Ladda ned på"}</span>
        <span className="text-lg font-semibold tracking-[-0.01em]">{name}</span>
      </a>
    )
  }
  return (
    <span className={cn(cls, "border-dashed", light ? "border-[rgba(19,25,22,0.3)] text-[#3d4540]" : "border-[rgba(249,251,248,0.18)] text-[#a3aba6]")}>
      <span className="text-[11px]">Släpps snart</span>
      <span className="text-lg font-semibold tracking-[-0.01em]">{name}</span>
    </span>
  )
}

function StoreLinks({ tone }: { tone?: "dark" | "light" }) {
  return (
    <div role="group" aria-label="Ladda ned appen" className="flex flex-wrap gap-3">
      <StoreLink store="ios" tone={tone} />
      <StoreLink store="android" tone={tone} />
    </div>
  )
}

// ------------------------------------------------------------- chrome ---

function PreviewBanner() {
  return (
    <div role="note" className="border-b border-[rgba(249,251,248,0.09)] bg-[#1a221e] px-4 py-2 text-center text-xs text-[#a3aba6]">
      Förhandsgranskning – hybrid av dagens sida och det nya förslaget. Inte publicerad. Dagens sida finns på{" "}
      <Link href="/" className={cn("underline underline-offset-2 hover:text-[#f9fbf8]", FOCUS)}>
        /
      </Link>
      .
    </div>
  )
}

const NAV_LINKS = [
  { href: "#funktioner", label: "Funktioner" },
  { href: "#chatt", label: "Chatt & samtal" },
  { href: "#priser", label: "Priser" },
  { href: "#exempel", label: "Så funkar det" },
]

function Nav() {
  const [scrolled, setScrolled] = React.useState(false)
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])
  return (
    <header className={cn("sticky top-0 z-40 transition-[background-color,border-color] duration-300", scrolled ? "lp-material border-b border-[rgba(249,251,248,0.08)]" : "border-b border-transparent")}>
      <nav aria-label="Huvudmeny" className={cn(CONTAINER, "flex h-16 items-center justify-between gap-4")}>
        <a href="#innehall" className={cn("flex items-center gap-2 rounded-md text-[17px] font-semibold tracking-[-0.02em]", FOCUS)} aria-label="Coavira, till början">
          <Logo />
          Coavira
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={cn("rounded-full px-3 py-2 text-sm text-[#a3aba6] transition-colors hover:text-[#f9fbf8]", FOCUS)}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <a href="#ladda-ned" className={cn("lp-press inline-flex h-10 items-center rounded-full bg-[#84cc16] px-4 text-sm font-semibold text-[#131916] transition-colors hover:bg-[#93d72b]", FOCUS)}>
          Ladda ned
        </a>
      </nav>
    </header>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <rect width="24" height="24" rx="7" fill="#84cc16" />
      <path d="M15.6 8.4a4.9 4.9 0 1 0 0 7.2" fill="none" stroke="#131916" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

// --------------------------------------------------------------- hero ---

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-x-clip">
      <div className={cn(CONTAINER, "grid items-center gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-24 lg:pb-24")}>
        <div className="lp-rise">
          <p className="text-sm font-medium text-[#a3aba6]">Appen för dig och din PT</p>
          <h1 id="hero-title" className="mt-4 text-[clamp(2.75rem,7vw,5rem)] leading-[1] font-semibold tracking-[-0.045em] text-balance">
            Träning och kost.
            <span className="block text-[#a3aba6]">På dina villkor.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-[#a3aba6] sm:text-lg">
            Koppla samman med din PT, följ ditt skräddarsydda kostschema och nå dina mål snabbare – i en och samma app.
          </p>
          <div className="mt-8">
            <StoreLinks />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href="#pt" className={cn("rounded-md font-medium text-[#84cc16] underline-offset-4 hover:underline", FOCUS)}>
              Är du PT? Ansök <span aria-hidden>→</span>
            </a>
            <span className="text-[#7d857f]">0 kr att ladda ned · iPhone och Android</span>
          </div>
        </div>
        <HeroDevice />
      </div>
    </section>
  )
}

/** Signaturen: passet i appen – nästa pass, set för set, med förra passets vikt. */
function HeroDevice() {
  const sets = [
    { kg: "82,5", reps: 8 },
    { kg: "82,5", reps: 8 },
    { kg: "82,5", reps: 7 },
  ]
  return (
    <div className="lp-rise relative mx-auto w-full max-w-[400px] [animation-delay:120ms]" role="img" aria-label="Exempel: ett pass i Coavira-appen med förra passets vikter och tre avbockade set">
      <div className="rounded-[2.25rem] border border-[rgba(249,251,248,0.1)] bg-[#0e1310] p-2.5 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]">
        <div className="overflow-hidden rounded-[1.8rem] bg-[#1a221e]">
          <div className="flex items-center justify-between px-5 pt-4 text-[11px] text-[#7d857f]" aria-hidden>
            <span>07:12</span>
            <span>Pull · PPL</span>
          </div>
          <div className="px-5 pt-3 pb-5">
            <p className="text-[11px] font-medium tracking-wide text-[#84cc16] uppercase">Pass 2 av 3 denna vecka</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Barbell Row</p>
            <p className="mt-1 text-sm text-[#a3aba6]">3 × 6–8 · vila 2 min</p>
            <div className="mt-4 rounded-2xl border border-[rgba(132,204,22,0.3)] bg-[rgba(132,204,22,0.08)] px-3.5 py-2.5 text-sm">
              <span className="font-medium">+2,5 kg idag.</span> <span className="text-[#a3aba6]">Förra gången: 80 kg × 8, alla set.</span>
            </div>
            <ol className="mt-4 space-y-2">
              {sets.map((s, i) => (
                <li key={i} className="lp-set flex items-center gap-3 rounded-xl bg-[#131916] px-3 py-2.5" style={{ ["--i" as string]: i }}>
                  <span className="w-5 text-xs text-[#7d857f] tabular-nums">{i + 1}</span>
                  <span className="flex-1 text-[15px] tabular-nums">
                    {s.kg} kg <span className="text-[#7d857f]">×</span> {s.reps}
                  </span>
                  <span className="lp-tick">
                    <Tick on />
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-[rgba(249,251,248,0.08)] px-5 py-3.5">
            <div className="flex h-11 items-center justify-center rounded-full bg-[#84cc16] text-sm font-semibold text-[#131916]">Nästa övning: Face Pull</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Dagens sidas faktarad – statisk i stället för rullande, och bara det appen faktiskt gör. */
const FACTS_ROW = [
  { icon: ScanBarcode, label: "Svenska livsmedel och streckkoder" },
  { icon: CalendarDays, label: "Kalendersynk med Google, Outlook och Apple" },
  { icon: HeartPulse, label: "Apple Hälsa, Health Connect och Strava" },
  { icon: MessageCircle, label: "Chatt och videosamtal med din PT" },
  { icon: ShieldCheck, label: "Data lagras inom EU" },
]

function FactRow() {
  return (
    <div className="border-t border-[rgba(249,251,248,0.08)]">
      <ul className={cn(CONTAINER, "grid grid-cols-1 gap-x-8 gap-y-3 py-6 text-sm text-[#a3aba6] sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-between")}>
        {FACTS_ROW.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2.5">
            <Icon className="size-4 shrink-0 text-[#f9fbf8]" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------ features ---

const FEATURES = [
  { title: "Din PT. Din plan.", text: "PT:n bygger passet, du ser det direkt i appen. Passet klarmarkeras när vikterna är ifyllda." },
  { title: "Nästa pass på en knapp", text: "Välj split och hur många dagar i veckan du tränar. Appen vet vilket pass som står på tur – och föreslår vikterna." },
  { title: "Svensk matdatabas i fickan", text: "Sök eller skanna streckkoden – svenska varor först. Ett aktivt kostschema åt gången." },
  { title: "Boka med din coach", text: "Synkas med Google, Outlook och Apple Kalender. Du bokar aldrig fler pass än du köpt." },
  { title: "Köp direkt i appen", text: "Pass, program, kostcoaching eller helhetspaket – betala med kort, direkt till din PT." },
  { title: "Framsteg som följer verkligheten", text: "Viktkurvan räknas om med förbränningen från Apple Hälsa, Health Connect och Strava." },
]

function Features() {
  return (
    <section id="funktioner" aria-labelledby="funktioner-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionHeading id="funktioner-title" kicker="Funktioner" title="Byggd för resultat." lead="Pass, kost och bokning – allt mellan dig och din PT på ett ställe." />
        <ul className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-[rgba(249,251,248,0.09)] bg-[rgba(249,251,248,0.09)] sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal as="li" key={f.title} delay={(i % 3) * 60} className="bg-[#131916] p-6 sm:p-8">
              <h3 className="text-lg font-semibold tracking-[-0.01em]">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-[#a3aba6]">{f.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ---------------------------------------------------------- chat & call ---

const CHAT_POINTS = [
  { icon: MessageCircle, title: "Chatta och skicka teknikvideor", text: "Bilder, filmer och PDF:er – feedbacken kopplas till rätt pass." },
  { icon: Video, title: "Ring och videoringa i appen", text: "Inga länkar, inga extra appar. Kamerarutan flyttar du dit du vill." },
  { icon: PhoneMissed, title: "Missat samtal? Ring upp direkt", text: "Det missade samtalet blir ett kort i chatten. Ett tryck, så är ni igång." },
]

function ChatSection() {
  return (
    <section id="chatt" aria-labelledby="chatt-title" className={SECTION}>
      <div className={cn(CONTAINER, "grid items-center gap-12 lg:grid-cols-2 lg:gap-16")}>
        <div>
          <SectionHeading id="chatt-title" kicker="Chatt och samtal" title="Din coach. Ett tryck bort." lead="Fråga, filma och ring din PT – allt i samma tråd." />
          <ul className="mt-10 space-y-6">
            {CHAT_POINTS.map(({ icon: Icon, title, text }, i) => (
              <Reveal as="li" key={title} delay={i * 60} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(249,251,248,0.12)]">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-1 block text-[15px] leading-[1.55] text-[#a3aba6]">{text}</span>
                </span>
              </Reveal>
            ))}
          </ul>
          <p className="mt-8 text-sm text-[#7d857f]">Samtal låses upp efter köp eller bokat pass. Flera PT:er? En egen tråd med var och en.</p>
        </div>
        <ChatMock />
      </div>
    </section>
  )
}

/** Tråden i appen. Meddelandena kommer in ett i taget när vyn syns (statiskt med reducerad rörelse). */
function ChatMock() {
  const ref = React.useRef<HTMLDivElement>(null)
  const shown = useInView(ref)
  const msgs: { me: boolean; text: React.ReactNode; time: string }[] = [
    { me: false, text: "God morgon Sara! Hur kändes knäböjen igår?", time: "08:02" },
    { me: true, text: "Tungt på sista setet. Filmade det – kolla gärna tekniken!", time: "08:10" },
    {
      me: true,
      text: (
        <span className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[rgba(19,25,22,0.25)]">
            <Play className="size-4 fill-current" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-medium">knaboj-set3.mp4</span>
            <span className="block text-xs opacity-75">0:24 · kopplad till benpasset</span>
          </span>
        </span>
      ),
      time: "08:10",
    },
    { me: false, text: "Snyggt djup! Håll bröstet uppe i botten – nästa gång kör vi 80 kg på sista setet.", time: "08:31" },
  ]
  return (
    <div ref={ref} role="img" aria-label="Exempel: chatt mellan Sara och hennes PT Elin, med en teknikvideo och ett missat samtal" className={cn("lp-chat mx-auto w-full max-w-[440px]", shown && "lp-chat-in")}>
      <div className="overflow-hidden rounded-[2rem] border border-[rgba(249,251,248,0.1)] bg-[#1a221e]">
        <div className="flex items-center gap-3 border-b border-[rgba(249,251,248,0.08)] px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#131916] text-xs font-semibold">ES</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Elin Söderberg</span>
            <span className="block text-xs text-[#a3aba6]">Din PT · Träning och kost</span>
          </span>
          <Phone className="size-[18px] text-[#a3aba6]" aria-hidden />
          <Video className="ml-3 size-[18px] text-[#a3aba6]" aria-hidden />
        </div>
        <div className="space-y-2 px-4 py-5">
          {msgs.map((m, i) => (
            <div key={i} className={cn("lp-msg flex", m.me ? "justify-end" : "justify-start")} style={{ ["--i" as string]: i }}>
              <div className={cn("max-w-[82%] rounded-2xl px-3.5 py-2 text-[14px] leading-[1.45]", m.me ? "rounded-br-md bg-[#84cc16] text-[#131916]" : "rounded-bl-md bg-[#131916]")}>
                {m.text}
                <span className={cn("mt-0.5 block text-right text-[10px]", m.me ? "text-[#2b3a12]" : "text-[#7d857f]")}>{m.time}</span>
              </div>
            </div>
          ))}
          <div className="lp-msg flex justify-center pt-2" style={{ ["--i" as string]: msgs.length }}>
            <div className="flex w-full max-w-[300px] items-center gap-3 rounded-2xl border border-[rgba(249,251,248,0.1)] bg-[#131916] px-3 py-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-[rgba(239,68,68,0.14)] text-[#f87171]">
                <PhoneMissed className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Missat videosamtal</span>
                <span className="block text-xs text-[#a3aba6]">12:04 · från Elin</span>
              </span>
              <span className="rounded-full bg-[#f9fbf8] px-3 py-1 text-xs font-semibold text-[#131916]">Ring upp</span>
            </div>
          </div>
        </div>
        <div className="border-t border-[rgba(249,251,248,0.08)] px-4 py-3">
          <div className="flex h-10 items-center rounded-full bg-[#131916] px-4 text-sm text-[#7d857f]">Skriv ett meddelande…</div>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------- product views ---

type Audience = "klient" | "pt"
const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "klient", label: "För klienten" },
  { id: "pt", label: "För PT:n" },
]

function ProductViews() {
  const [tab, setTab] = React.useState<Audience>("klient")
  return (
    <section id="vyer" aria-labelledby="vyer-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionHeading
          id="vyer-title"
          kicker="Klient och PT"
          title="Två sidor av samma träning."
          lead="Klienten ser dagens pass och kost. PT:n ser alla klienter, förfrågningar och meddelanden – och bygger passen som klienten kör."
        />
        <Reveal className="mt-10">
          <Segmented label="Välj vy" value={tab} onChange={setTab} options={AUDIENCES} idPrefix="vy" />
        </Reveal>
        <div id={`vy-panel-${tab}`} role="tabpanel" aria-labelledby={`vy-tab-${tab}`} key={tab} className="lp-swap mt-8">
          {tab === "klient" ? <ClientView /> : <TrainerView />}
        </div>
        <p className="mt-4 text-xs text-[#7d857f]">Vyerna visar exempeldata.</p>
      </div>
    </section>
  )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-w-0 rounded-3xl border border-[rgba(249,251,248,0.09)] bg-[#1a221e] p-5 sm:p-6", className)}>{children}</div>
}

function ClientView() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Panel>
        <p className="text-sm text-[#a3aba6]">Torsdag 12 november</p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">God morgon Sara</p>
        <div className="mt-5 rounded-2xl bg-[#131916] p-4">
          <p className="text-[11px] font-medium tracking-wide text-[#84cc16] uppercase">Nästa pass · PPL</p>
          <p className="mt-1 text-xl font-semibold">Legs</p>
          <p className="mt-0.5 truncate text-sm text-[#a3aba6]">Back Squat · Romanian Deadlift · Bulgarian Split Squats</p>
          <div className="mt-4 flex h-11 items-center justify-center rounded-full bg-[#84cc16] text-sm font-semibold text-[#131916]">Nästa pass</div>
          <div className="mt-3 flex items-center gap-2" role="img" aria-label="2 av 3 pass denna vecka">
            <span className="h-1.5 flex-1 rounded-full bg-[#84cc16]" />
            <span className="h-1.5 flex-1 rounded-full bg-[#84cc16]" />
            <span className="h-1.5 flex-1 rounded-full bg-[rgba(132,204,22,0.18)]" />
            <span className="ml-1 text-xs text-[#a3aba6] tabular-nums">2 av 3 denna vecka</span>
          </div>
        </div>
      </Panel>
      <div className="grid min-w-0 grid-cols-1 gap-4">
        <Panel>
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-medium">Dagens kost</p>
            <p className="text-sm text-[#a3aba6] tabular-nums">1 640 / 2 400 kcal</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#131916]">
            <div className="h-full w-[68%] rounded-full bg-[#f9fbf8]" />
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              ["Frukost", "Havregrynsgröt, kvarg, blåbär", "517", true],
              ["Lunch", "Kyckling, jasminris, broccoli", "650", true],
              ["Mellanmål", "Banan, 120 g", "107", false],
            ].map(([m, items, kcal, done]) => (
              <li key={m as string} className="flex items-center gap-3">
                <Tick on={done as boolean} className="size-5" />
                <span className="min-w-0 flex-1">
                  <span className="block">{m}</span>
                  <span className="block truncate text-xs text-[#a3aba6]">{items}</span>
                </span>
                <span className="text-xs text-[#a3aba6] tabular-nums">{kcal} kcal</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#131916] text-sm font-semibold">ES</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Elin Söderberg</span>
            <span className="block truncate text-sm text-[#a3aba6]">Snyggt i går! Vi höjer knäböjen till 4 × 5.</span>
          </span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#84cc16] px-1.5 text-[11px] font-semibold text-[#131916]" aria-label="1 oläst">
            1
          </span>
        </Panel>
      </div>
    </div>
  )
}

function TrainerView() {
  const clients = [
    { name: "Sara Lindqvist", plan: "PPL · 3 dagar/v", adherence: 92, initials: "SL" },
    { name: "Jonas Pettersson", plan: "Upper/Lower · 4 dagar/v", adherence: 75, initials: "JP" },
    { name: "Mira Holm", plan: "Full Body · 3 dagar/v", adherence: 100, initials: "MH" },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-1">
        {[
          ["Aktiva klienter", "12"],
          ["Förfrågningar", "2"],
          ["Olästa meddelanden", "3"],
          ["Pass att klarmarkera", "5"],
        ].map(([label, value]) => (
          <Panel key={label} className="p-4 sm:p-5">
            <p className="text-sm text-[#a3aba6]">{label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
          </Panel>
        ))}
      </div>
      <Panel>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-medium">Klienter</p>
          <p className="text-xs text-[#a3aba6]">Följsamhet, 4 veckor</p>
        </div>
        <ul className="mt-4 divide-y divide-[rgba(249,251,248,0.08)]">
          {clients.map((c) => (
            <li key={c.name} className="flex items-center gap-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#131916] text-xs font-semibold">{c.initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate text-xs text-[#a3aba6]">{c.plan}</span>
              </span>
              <span className="w-16 sm:w-20">
                <span className="block h-1.5 overflow-hidden rounded-full bg-[#131916]">
                  <span className="block h-full rounded-full bg-[#f9fbf8]" style={{ width: `${c.adherence}%` }} />
                </span>
              </span>
              <span className="w-11 text-right text-sm tabular-nums">{c.adherence} %</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-2xl bg-[#131916] p-4">
          <p className="text-sm font-medium">Passbyggaren</p>
          <p className="mt-1 text-sm text-[#a3aba6]">Välj en split eller bygg egen – dra övningarna i ordning, sätt set, reps och startvikt. Saknas en övning skapar du den direkt.</p>
        </div>
      </Panel>
    </div>
  )
}

// -------------------------------------------------------------- pricing ---

const CLIENT_INCLUDED = [
  "Boka och flytta pass med din PT",
  "Träningsloggen med set, reps och vikter",
  "Dagens kost – kcal och makron mot dina mål",
  "Chatt med din PT, med bilagor",
  "Framsteg efter dina mål",
  "Kalendersynk med Google, Outlook och Apple",
  "Flera PT:er i samma app",
]

const PT_STEPS = [
  { title: "Skicka ditt certifikat", text: "Vi granskar det manuellt – ingen kan registrera sig själv som PT." },
  { title: "Coavira skapar ditt konto", text: "Du loggar in, kopplar utbetalningar och fyller i profilen." },
  { title: "Sätt egna priser", text: "Pass, program, kostcoaching eller helhetspaket – du bestämmer." },
]

const TRUST = [
  { title: "Verifierade PT:er", text: "Varje PT:s certifikat granskas manuellt innan kontot skapas." },
  { title: "Ett kostschema åt gången", text: "Har du flera PT:er gäller ett kostschema i taget – inga krockande råd." },
  { title: "Hälsodata bara med ditt samtycke", text: "Exportera allt eller radera kontot direkt i appen." },
]

function Pricing() {
  const [tab, setTab] = React.useState<"klient" | "pt">("klient")
  return (
    <section id="priser" aria-labelledby="priser-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionHeading
          id="priser-title"
          kicker="Priser"
          title="Gratis app. Betala bara för din coach."
          lead="Köp pass, program och kostcoaching direkt av din PT – till PT:ns egna priser."
        />
        <Reveal className="mt-10">
          <Segmented
            label="Priser för"
            value={tab}
            onChange={setTab}
            options={[
              { id: "klient", label: "För klienter" },
              { id: "pt", label: "För PT:er" },
            ]}
            idPrefix="pris"
          />
        </Reveal>
        <div id={`pris-panel-${tab}`} role="tabpanel" aria-labelledby={`pris-tab-${tab}`} key={tab} className="lp-swap mt-8">
          {tab === "klient" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Panel className="flex flex-col">
                <p className="text-sm text-[#a3aba6]">Coavira-appen</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-[clamp(3.5rem,8vw,5rem)] leading-none font-semibold tracking-[-0.05em] tabular-nums">0</span>
                  <span className="text-2xl font-semibold">kr</span>
                </p>
                <p className="mt-3 text-[15px] leading-[1.6] text-[#a3aba6]">Kontot kostar ingenting. Pass, program och kostcoaching köper du av din PT – med kort, direkt i appen.</p>
                <p className="mt-auto border-t border-[rgba(249,251,248,0.08)] pt-4 text-sm text-[#a3aba6]">
                  <span className="font-medium text-[#f9fbf8]">Coavira Plus 49 kr/mån</span> – full historik, sömn och export. Helt frivilligt.
                </p>
              </Panel>
              <Panel>
                <p className="font-medium">Det här ingår</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {CLIENT_INCLUDED.map((t) => (
                    <li key={t} className="flex items-start gap-2.5 text-[15px]">
                      <Check className="mt-0.5 size-4 shrink-0 text-[#84cc16]" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Panel>
                <p className="font-medium">Så blir du PT på Coavira</p>
                <ol className="mt-5 space-y-5">
                  {PT_STEPS.map((s, i) => (
                    <li key={s.title} className="flex gap-4">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[rgba(249,251,248,0.16)] text-sm font-semibold tabular-nums">{i + 1}</span>
                      <span>
                        <span className="block font-semibold">{s.title}</span>
                        <span className="mt-0.5 block text-[15px] leading-[1.55] text-[#a3aba6]">{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Panel>
              <Panel className="flex flex-col">
                <p className="font-medium">Avgift per köp</p>
                <dl className="mt-4 space-y-4">
                  <div className="flex items-baseline justify-between gap-4 border-b border-[rgba(249,251,248,0.08)] pb-4">
                    <dt className="text-[15px] text-[#a3aba6]">Klienter du tar med dig</dt>
                    <dd className="text-2xl font-semibold tabular-nums">5 %</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-[15px] text-[#a3aba6]">Klienter som hittar dig via Coavira</dt>
                    <dd className="text-2xl font-semibold tabular-nums">10 %</dd>
                  </div>
                </dl>
                <a
                  href={LINKS.ptApply}
                  className={cn("lp-press mt-6 inline-flex h-12 items-center justify-center rounded-full bg-[#84cc16] px-6 text-[15px] font-semibold text-[#131916] transition-colors hover:bg-[#93d72b] lg:mt-auto", FOCUS)}
                >
                  Ansök som PT
                </a>
              </Panel>
            </div>
          )}
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-3">
          {TRUST.map((f, i) => (
            <Reveal as="li" key={f.title} delay={i * 60} className="rounded-3xl border border-[rgba(249,251,248,0.09)] p-6">
              <p className="font-semibold">{f.title}</p>
              <p className="mt-2 text-[15px] leading-[1.6] text-[#a3aba6]">{f.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

// ---------------------------------------------------------- example week ---

const WEEK = [
  { day: "Måndag", who: "PT:n", text: "Elin bygger en Push/Pull/Legs till Sara och sätter tre dagar i veckan." },
  { day: "Tisdag", who: "Klienten", text: "Sara trycker på Nästa pass. Push startar med förra veckans vikter ifyllda." },
  { day: "Onsdag", who: "Klienten", text: "Lunchen loggas med streckkoden. Elin ser samma Dagens kost." },
  { day: "Fredag", who: "PT:n", text: "Elin går igenom passet, svarar i chatten och klarmarkerar det." },
  { day: "Söndag", who: "Appen", text: "Viktkurvan räknas om med veckans förbränning från Apple Hälsa." },
]

function ExampleWeek() {
  return (
    <section id="exempel" aria-labelledby="exempel-title" className={SECTION}>
      <div className={cn(CONTAINER, "grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16")}>
        <SectionHeading id="exempel-title" kicker="Så funkar det" title="En vecka med Sara och hennes PT." lead="Ett exempel på en vanlig träningsvecka i Coavira – från planeringen till uppföljningen." />
        <ol>
          {WEEK.map((w, i) => (
            <Reveal as="li" key={w.day} delay={i * 50} className="grid grid-cols-[5.5rem_1fr] gap-4 border-b border-[rgba(249,251,248,0.06)] py-4 last:border-b-0 sm:grid-cols-[7rem_1fr]">
              <span>
                <span className="block text-sm font-medium">{w.day}</span>
                <span className="block text-xs text-[#7d857f]">{w.who}</span>
              </span>
              <p className="text-[15px] leading-[1.6] text-[#a3aba6]">{w.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ------------------------------------------------------------- download ---

function Download() {
  return (
    <section id="ladda-ned" aria-labelledby="ladda-ned-title" className={SECTION}>
      <div className={CONTAINER}>
        <Reveal className="rounded-[2rem] bg-[#f9fbf8] p-8 text-[#131916] sm:p-12 lg:p-16">
          <p className="text-sm font-medium text-[#58605a]">Ditt första steg</p>
          <h2 id="ladda-ned-title" className="mt-3 text-[clamp(2.5rem,6vw,4.25rem)] leading-[1] font-semibold tracking-[-0.045em] text-balance">
            Din resa börjar nu.
          </h2>
          <p className="mt-5 max-w-[50ch] text-[17px] leading-[1.55] text-[#3d4540]">Ladda ned Coavira gratis och träna med din PT – var du än är.</p>
          <div className="mt-8">
            <StoreLinks tone="light" />
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#3d4540]">
            {["Verifierade PT:er", "Hälsodata bara med ditt samtycke", "iPhone och Android"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-4 text-[#3f6212]" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <div id="pt" className="mt-10 flex scroll-mt-24 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[52ch] text-[15px] leading-[1.6] text-[#a3aba6]">
            <span className="font-semibold text-[#f9fbf8]">Är du PT?</span> Skicka ditt certifikat, så granskar vi det och skapar ditt konto.
          </p>
          <a href={LINKS.ptApply} className={cn("inline-flex items-center gap-1 rounded-md text-[15px] font-medium text-[#84cc16] underline-offset-4 hover:underline", FOCUS)}>
            Ansök om att coacha <span aria-hidden>→</span>
            <span className="sr-only"> (öppnar e-post)</span>
          </a>
        </div>
      </div>
    </section>
  )
}

const FOOTER = [
  {
    title: "Produkt",
    links: [
      ["#funktioner", "Funktioner"],
      ["#chatt", "Chatt och samtal"],
      ["#priser", "Priser"],
    ],
  },
  {
    title: "Appen",
    links: [
      ["#ladda-ned", "Ladda ned appen"],
      [LINKS.ptApply, "Ansök som PT"],
      [LINKS.support, "Support"],
    ],
  },
  {
    title: "Juridik och kontakt",
    links: [
      [LINKS.privacy, "Integritetspolicy"],
      [LINKS.terms, "Användarvillkor"],
      [LINKS.contact, "Kontakt"],
    ],
  },
]

function Footer() {
  return (
    <footer className="border-t border-[rgba(249,251,248,0.08)] pt-14 pb-10">
      <div className={CONTAINER}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]">
              <Logo /> Coavira
            </p>
            <p className="mt-3 max-w-[32ch] text-sm leading-[1.6] text-[#a3aba6]">Träning, kost och din PT – i en app.</p>
          </div>
          {FOOTER.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-medium">{col.title}</p>
              <ul className="mt-3 space-y-2 text-sm text-[#a3aba6]">
                {col.links.map(([href, label]) => (
                  <li key={label}>
                    <a href={href} className={cn("rounded-sm hover:text-[#f9fbf8]", FOCUS)}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-[rgba(249,251,248,0.08)] pt-6 text-sm text-[#7d857f] sm:flex-row sm:items-center sm:justify-between">
          <p>© Coavira · Byggt i Sverige · Data lagras inom EU</p>
          <a href="#innehall" className={cn("rounded-sm hover:text-[#f9fbf8]", FOCUS)}>
            Till toppen <span aria-hidden>↑</span>
          </a>
        </div>
      </div>
    </footer>
  )
}

// --------------------------------------------------------------- motion ---
// Bara transform/opacity, ease-out, ≤ 500 ms. Allt stängs av med reducerad rörelse.
const CSS = `
.lp-reveal { opacity: 0; transform: translateY(8px); transition: opacity 400ms cubic-bezier(.2,.7,.2,1), transform 400ms cubic-bezier(.2,.7,.2,1); }
.lp-reveal.lp-in { opacity: 1; transform: none; }
@keyframes lp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.lp-rise { animation: lp-rise 500ms cubic-bezier(.2,.7,.2,1) both; }
@keyframes lp-tick { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
.lp-set .lp-tick { display: inline-flex; animation: lp-tick 260ms cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(700ms + var(--i) * 420ms); }
.lp-chat .lp-msg { opacity: 0; transform: translateY(6px); }
.lp-chat-in .lp-msg { opacity: 1; transform: none; transition: opacity 320ms cubic-bezier(.2,.7,.2,1), transform 320ms cubic-bezier(.2,.7,.2,1); transition-delay: calc(var(--i) * 260ms); }
@keyframes lp-swap { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.lp-swap { animation: lp-swap 240ms cubic-bezier(.2,.7,.2,1) both; }
.lp-press { transition-property: background-color, color, border-color, transform; transition-duration: 200ms; }
.lp-press:active { transform: scale(.97); transition-duration: 100ms; }
.lp-material { background: rgba(19,25,22,.72); -webkit-backdrop-filter: blur(16px) saturate(160%); backdrop-filter: blur(16px) saturate(160%); }
@media (prefers-reduced-motion: reduce) {
  .lp-reveal, .lp-reveal.lp-in, .lp-chat .lp-msg { opacity: 1; transform: none; transition: none; }
  .lp-rise, .lp-swap, .lp-set .lp-tick { animation: none; }
  .lp-press:active { transform: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .lp-material { background: #131916; -webkit-backdrop-filter: none; backdrop-filter: none; }
}
`
