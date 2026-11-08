"use client"

/**
 * Förslag på ny landningssida (förhandsgranskning, /landing-preview).
 *
 * Designprinciper (granskat mot apple-design, design-review och better-interface):
 *  - En signatur: själva produkten. Hero och produktvyerna visar Coaviras
 *    riktiga vyer (Nästa pass, set med förra passets vikt, Dagens kost, PT:ns
 *    översikt) som HTML – inga stockfoton, inga påhittade skärmdumpar.
 *  - Färg betyder en sak: limegrönt (#84cc16) bara för primära handlingar och
 *    status (klart, på tur). Resten är #131916 och #f9fbf8 med dämpade nivåer.
 *  - Typografi: Geist. Rubriker med negativ spärrning och tät radhöjd,
 *    brödtext 17 px/1,55 med 60–70 tecken per rad.
 *  - Rörelse: kort (≤ 400 ms), ease-out, bara transform/opacity, och allt
 *    stängs av med prefers-reduced-motion.
 *  - Ärligt innehåll: priser och avgifter är appens riktiga (0 kr för klienter,
 *    5/10 % för PT:er, Plus 49 kr/mån). Exempel är märkta som exempel och inga
 *    omdömen är påhittade.
 */
import Link from "next/link"
import * as React from "react"

import { LINKS, STORE_URLS } from "@/components/landing/links"
import { cn } from "@/lib/utils"

// ------------------------------------------------------------ tokens ---
// Kontrast mot #131916: text 17,1:1 · dämpad 7,6:1 · svag 4,7:1 · lime 9,0:1.
const C = {
  bg: "#131916",
  raised: "#1a221e",
  line: "rgba(249,251,248,0.09)",
  text: "#f9fbf8",
  muted: "#a3aba6",
  subtle: "#7d857f",
  lime: "#84cc16",
} as const

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[#84cc16] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131916]"
const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8"

export function LandingPreview() {
  return (
    <div className="lp min-h-svh font-sans antialiased" style={{ background: C.bg, color: C.text, colorScheme: "dark" }}>
      <style>{CSS}</style>
      <a href="#innehall" className={cn("sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[#f9fbf8] focus:px-4 focus:py-2 focus:text-[#131916]", FOCUS)}>
        Hoppa till innehållet
      </a>
      <PreviewBanner />
      <Nav />
      <main id="innehall" tabIndex={-1} className="outline-none">
        <Hero />
        <Features />
        <ProductViews />
        <ExampleWeek />
        <Download />
      </main>
      <Footer />
    </div>
  )
}

// ---------------------------------------------------------- primitives ---

/** Tonar in när sektionen syns (8 px uppåt, 400 ms). Statisk med reducerad rörelse. */
function Reveal({ children, className, delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section" }) {
  const ref = React.useRef<HTMLElement>(null)
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
  }, [])
  return (
    <Tag ref={ref as never} className={cn("lp-reveal", shown && "lp-in", className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  )
}

function PrimaryLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "lp-press inline-flex h-12 items-center justify-center rounded-full bg-[#84cc16] px-6 text-[15px] font-semibold text-[#131916] transition-colors hover:bg-[#93d72b]",
        FOCUS,
        className
      )}
    >
      {children}
    </a>
  )
}

function SecondaryLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "lp-press inline-flex h-12 items-center justify-center rounded-full border border-[rgba(249,251,248,0.16)] px-6 text-[15px] font-medium text-[#f9fbf8] transition-colors hover:bg-[rgba(249,251,248,0.06)]",
        FOCUS,
        className
      )}
    >
      {children}
    </a>
  )
}

function SectionHeading({ id, kicker, title, lead }: { id: string; kicker: string; title: React.ReactNode; lead?: string }) {
  return (
    <Reveal className="max-w-2xl">
      <p className="text-sm font-medium text-[#a3aba6]">{kicker}</p>
      <h2 id={id} className="mt-3 text-[clamp(1.875rem,4.2vw,3rem)] leading-[1.06] font-semibold tracking-[-0.03em] text-balance">
        {title}
      </h2>
      {lead && <p className="mt-4 max-w-[62ch] text-[17px] leading-[1.55] text-[#a3aba6]">{lead}</p>}
    </Reveal>
  )
}

/** Liten bock i en rund ruta – samma form som i appens set-loggning. */
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
      {on && (
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      )}
    </span>
  )
}

// ------------------------------------------------------------- chrome ---

function PreviewBanner() {
  return (
    <div className="border-b border-[rgba(249,251,248,0.09)] bg-[#1a221e] py-2 text-center text-xs text-[#a3aba6]" role="note">
      Förhandsgranskning av en ny landningssida – inte publicerad. Dagens sida finns på{" "}
      <Link href="/" className={cn("underline underline-offset-2 hover:text-[#f9fbf8]", FOCUS)}>
        /
      </Link>
      .
    </div>
  )
}

const NAV_LINKS = [
  { href: "#funktioner", label: "Funktioner" },
  { href: "#vyer", label: "Klient och PT" },
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
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,border-color] duration-300",
        // Genomskinligt lager med oskärpa – innehållet skrollar under. Helt täckande vid reducerad transparens.
        scrolled ? "lp-material border-b border-[rgba(249,251,248,0.08)]" : "border-b border-transparent"
      )}
    >
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
        <a
          href="#ladda-ned"
          className={cn("lp-press inline-flex h-10 items-center rounded-full bg-[#f9fbf8] px-4 text-sm font-semibold text-[#131916] transition-colors hover:bg-white", FOCUS)}
        >
          Ladda ned
        </a>
      </nav>
    </header>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <rect width="24" height="24" rx="7" fill={C.lime} />
      <path d="M15.6 8.4a4.9 4.9 0 1 0 0 7.2" fill="none" stroke={C.bg} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

// --------------------------------------------------------------- hero ---

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-x-clip">
      <div className={cn(CONTAINER, "grid items-center gap-12 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-24 lg:pb-28")}>
        <div className="lp-rise">
          <h1 id="hero-title" className="text-[clamp(2.5rem,6.4vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.04em] text-balance">
            Din PT planerar. <span className="text-[#a3aba6]">Du trycker på Nästa pass.</span>
          </h1>
          <p className="mt-6 max-w-[54ch] text-[17px] leading-[1.6] text-[#a3aba6] sm:text-lg">
            Coavira samlar passen, kosten, chatten och framstegen mellan dig och din personliga tränare – i en app. Förra veckans vikter står redan ifyllda.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryLink href="#ladda-ned">Ladda ned appen</PrimaryLink>
            <SecondaryLink href="#pt">Jag är PT</SecondaryLink>
          </div>
          <p className="mt-5 text-sm text-[#7d857f]">0 kr för klienter · iPhone och Android</p>
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
    <div className="lp-rise relative mx-auto w-full max-w-[400px] [animation-delay:120ms]" aria-label="Exempel: ett pass i Coavira-appen" role="img">
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
              <span className="font-medium text-[#f9fbf8]">+2,5 kg idag.</span> <span className="text-[#a3aba6]">Förra gången: 80 kg × 8, alla set.</span>
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

// ------------------------------------------------------------ features ---

const FEATURES = [
  {
    title: "Nästa pass på en knapp",
    text: "Välj split och hur många dagar i veckan du tränar. Appen vet vilket pass som står på tur – inga datum att planera om.",
  },
  {
    title: "Vikterna föreslås åt dig",
    text: "Klarade du alla reps förra gången föreslår appen lite tyngre. Repintervallen styr ökningen, och du ser alltid vad du lyfte senast.",
  },
  {
    title: "Kosten loggas på sekunder",
    text: "Skanna streckkoden eller tryck på det du brukar äta. Svenska livsmedel, och din PT ser samma Dagens kost som du.",
  },
  {
    title: "Din PT finns i appen",
    text: "Chatta, skicka en video på tekniken eller ring upp. Passen och kommentarerna hamnar på samma ställe som träningen.",
  },
  {
    title: "Framsteg som följer verkligheten",
    text: "Viktkurvan räknas om med förbränningen från Apple Hälsa, Health Connect och Strava – och med hur ofta du faktiskt tränar.",
  },
  {
    title: "Din data är din",
    text: "Exportera allt eller radera kontot direkt i appen. Bara du och dina PT:er ser din träning.",
  },
]

function Features() {
  return (
    <section id="funktioner" aria-labelledby="funktioner-title" className="scroll-mt-20 border-t border-[rgba(249,251,248,0.08)] py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHeading id="funktioner-title" kicker="Funktioner" title="Allt mellan två pass, på ett ställe." />
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

// -------------------------------------------------------- product views ---

type Audience = "klient" | "pt"
const AUDIENCES: { id: Audience; label: string }[] = [
  { id: "klient", label: "För klienten" },
  { id: "pt", label: "För PT:n" },
]

function ProductViews() {
  const [tab, setTab] = React.useState<Audience>("klient")
  const refs = React.useRef<Record<Audience, HTMLButtonElement | null>>({ klient: null, pt: null })
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const next = tab === "klient" ? "pt" : "klient"
    setTab(next)
    refs.current[next]?.focus()
  }
  return (
    <section id="vyer" aria-labelledby="vyer-title" className="scroll-mt-20 border-t border-[rgba(249,251,248,0.08)] py-20 sm:py-28">
      <div className={CONTAINER}>
        <SectionHeading
          id="vyer-title"
          kicker="Klient och PT"
          title="Två sidor av samma träning."
          lead="Klienten ser dagens pass och kost. PT:n ser alla klienter, förfrågningar och meddelanden – och bygger passen som klienten kör."
        />
        <Reveal className="mt-10">
          <div role="tablist" aria-label="Välj vy" onKeyDown={onKey} className="inline-flex rounded-full border border-[rgba(249,251,248,0.12)] p-1">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                ref={(el) => {
                  refs.current[a.id] = el
                }}
                id={`tab-${a.id}`}
                role="tab"
                type="button"
                aria-selected={tab === a.id}
                aria-controls={`panel-${a.id}`}
                tabIndex={tab === a.id ? 0 : -1}
                onClick={() => setTab(a.id)}
                className={cn(
                  "lp-press h-10 rounded-full px-5 text-sm font-medium transition-colors duration-200",
                  tab === a.id ? "bg-[#f9fbf8] text-[#131916]" : "text-[#a3aba6] hover:text-[#f9fbf8]",
                  FOCUS
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Reveal>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab} className="lp-swap mt-8">
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
          <div className="flex items-baseline justify-between">
            <p className="font-medium">Dagens kost</p>
            <p className="text-sm text-[#a3aba6] tabular-nums">1 640 / 2 400 kcal</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#131916]">
            <div className="h-full w-[68%] rounded-full bg-[#f9fbf8]" />
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {[
              ["Frukost", "Havregrynsgröt, kvarg, blåbär", "517"],
              ["Lunch", "Kyckling, jasminris, broccoli", "650"],
              ["Mellanmål", "Banan, 120 g", "107"],
            ].map(([m, items, kcal]) => (
              <li key={m} className="flex items-center gap-3">
                <Tick on={m !== "Mellanmål"} className="size-5" />
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
        <div className="flex items-baseline justify-between">
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
              <span className="w-20">
                <span className="block h-1.5 overflow-hidden rounded-full bg-[#131916]">
                  <span className="block h-full rounded-full bg-[#f9fbf8]" style={{ width: `${c.adherence}%` }} />
                </span>
              </span>
              <span className="w-10 text-right text-sm tabular-nums">{c.adherence} %</span>
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

// ---------------------------------------------------------- example week ---

const WEEK = [
  { day: "Måndag", who: "PT:n", text: "Elin bygger en Push/Pull/Legs till Sara och sätter tre dagar i veckan." },
  { day: "Tisdag", who: "Klienten", text: "Sara trycker på Nästa pass. Push startar med förra veckans vikter ifyllda." },
  { day: "Onsdag", who: "Klienten", text: "Lunchen loggas med streckkoden. Elin ser samma Dagens kost." },
  { day: "Fredag", who: "PT:n", text: "Elin går igenom passet, svarar i chatten och klarmarkerar det." },
  { day: "Söndag", who: "Appen", text: "Viktkurvan räknas om med veckans förbränning från Apple Hälsa." },
]

const FACTS = [
  { title: "Verifierade PT:er", text: "Varje PT:s certifikat granskas manuellt innan kontot skapas." },
  { title: "Ett kostschema åt gången", text: "Har du flera PT:er gäller ett kostschema i taget – inga krockande råd." },
  { title: "Inga bindningstider", text: "Du köper pass och coaching av din PT. Kontot kostar ingenting." },
]

function ExampleWeek() {
  return (
    <section id="exempel" aria-labelledby="exempel-title" className="scroll-mt-20 border-t border-[rgba(249,251,248,0.08)] py-20 sm:py-28">
      <div className={cn(CONTAINER, "grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16")}>
        <SectionHeading
          id="exempel-title"
          kicker="Så funkar det"
          title="En vecka med Sara och hennes PT."
          lead="Ett exempel på hur en vanlig träningsvecka ser ut i Coavira – från planeringen till uppföljningen."
        />
        <ol className="relative space-y-1">
          {WEEK.map((w, i) => (
            <Reveal as="li" key={w.day} delay={i * 50} className="grid grid-cols-[5.5rem_1fr] gap-4 rounded-2xl px-1 py-4 sm:grid-cols-[7rem_1fr]">
              <span>
                <span className="block text-sm font-medium">{w.day}</span>
                <span className="block text-xs text-[#7d857f]">{w.who}</span>
              </span>
              <p className="text-[15px] leading-[1.6] text-[#a3aba6]">{w.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
      <div className={cn(CONTAINER, "mt-16")}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FACTS.map((f, i) => (
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

// ------------------------------------------------------------- download ---

function StoreLink({ store }: { store: "ios" | "android" }) {
  const url = STORE_URLS[store]
  const name = store === "ios" ? "App Store" : "Google Play"
  const cls = "inline-flex h-14 min-w-44 flex-col items-start justify-center rounded-2xl border px-5"
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={cn(cls, "lp-press border-[rgba(249,251,248,0.2)] transition-colors hover:bg-[rgba(249,251,248,0.06)]", FOCUS)}>
        <span className="text-[11px] text-[#a3aba6]">{store === "ios" ? "Hämta i" : "Ladda ned på"}</span>
        <span className="text-lg font-semibold tracking-[-0.01em]">{name}</span>
      </a>
    )
  }
  // Ingen länk än – säg det rakt ut i stället för en knapp som inte leder någonstans.
  return (
    <span className={cn(cls, "border-dashed border-[rgba(249,251,248,0.16)]")}>
      <span className="text-[11px] text-[#a3aba6]">Släpps snart</span>
      <span className="text-lg font-semibold tracking-[-0.01em] text-[#a3aba6]">{name}</span>
    </span>
  )
}

function Download() {
  return (
    <section id="ladda-ned" aria-labelledby="ladda-ned-title" className="scroll-mt-20 border-t border-[rgba(249,251,248,0.08)] py-20 sm:py-28">
      <div className={CONTAINER}>
        <Reveal className="grid gap-10 rounded-[2rem] bg-[#f9fbf8] p-8 text-[#131916] sm:p-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <h2 id="ladda-ned-title" className="text-[clamp(2rem,4.6vw,3.25rem)] leading-[1.04] font-semibold tracking-[-0.035em] text-balance">
              Träna med din PT. Börja i dag.
            </h2>
            <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.55] text-[#3d4540]">
              Ladda ned Coavira, välj din PT eller bjud in den du redan tränar med. Appen kostar 0 kr – pass och coaching köper du direkt av din PT.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <div>
              <dt className="text-[#58605a]">Klienter</dt>
              <dd className="mt-0.5 font-semibold">0 kr</dd>
            </div>
            <div>
              <dt className="text-[#58605a]">Coavira Plus</dt>
              <dd className="mt-0.5 font-semibold">49 kr/mån</dd>
            </div>
            <div>
              <dt className="text-[#58605a]">PT, egna klienter</dt>
              <dd className="mt-0.5 font-semibold">5 % per köp</dd>
            </div>
            <div>
              <dt className="text-[#58605a]">PT, klienter via Coavira</dt>
              <dd className="mt-0.5 font-semibold">10 % per köp</dd>
            </div>
          </dl>
        </Reveal>
        <div className="mt-8 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div role="group" aria-label="Ladda ned appen" className="flex flex-wrap gap-3">
            <StoreLink store="ios" />
            <StoreLink store="android" />
          </div>
          <div id="pt" className="max-w-sm scroll-mt-24">
            <p className="font-semibold">Är du PT?</p>
            <p className="mt-1 text-[15px] leading-[1.6] text-[#a3aba6]">
              Skicka ditt certifikat, så granskar vi det och skapar ditt konto. Sedan sätter du dina egna priser.
            </p>
            <a
              href={LINKS.ptApply}
              className={cn("mt-3 inline-flex items-center gap-1 rounded-md text-[15px] font-medium text-[#84cc16] underline-offset-4 hover:underline", FOCUS)}
            >
              Ansök som PT <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[rgba(249,251,248,0.08)] py-10">
      <div className={cn(CONTAINER, "flex flex-col gap-4 text-sm text-[#a3aba6] sm:flex-row sm:items-center sm:justify-between")}>
        <p>© Coavira</p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {[
            ["/integritet", "Integritet"],
            ["/villkor", "Villkor"],
            ["/support", "Support"],
          ].map(([href, label]) => (
            <li key={href}>
              <a href={href} className={cn("rounded-sm hover:text-[#f9fbf8]", FOCUS)}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}

// --------------------------------------------------------------- motion ---
// Bara transform/opacity, ease-out, ≤ 400 ms. Allt stängs av med reducerad rörelse.
const CSS = `
.lp-reveal { opacity: 0; transform: translateY(8px); transition: opacity 400ms cubic-bezier(.2,.7,.2,1), transform 400ms cubic-bezier(.2,.7,.2,1); }
.lp-reveal.lp-in { opacity: 1; transform: none; }
@keyframes lp-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.lp-rise { animation: lp-rise 500ms cubic-bezier(.2,.7,.2,1) both; }
@keyframes lp-tick { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
.lp-set .lp-tick { display: inline-flex; animation: lp-tick 260ms cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(700ms + var(--i) * 420ms); }
@keyframes lp-swap { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.lp-swap { animation: lp-swap 240ms cubic-bezier(.2,.7,.2,1) both; }
.lp-press { transition-property: background-color, color, border-color, transform; }
.lp-press:active { transform: scale(.97); transition-duration: 100ms; }
.lp-material { background: rgba(19,25,22,.72); -webkit-backdrop-filter: blur(16px) saturate(160%); backdrop-filter: blur(16px) saturate(160%); }
@media (prefers-reduced-motion: reduce) {
  .lp-reveal, .lp-reveal.lp-in { opacity: 1; transform: none; transition: none; }
  .lp-rise, .lp-swap, .lp-set .lp-tick { animation: none; }
  .lp-press:active { transform: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .lp-material { background: #131916; -webkit-backdrop-filter: none; backdrop-filter: none; }
}
`
