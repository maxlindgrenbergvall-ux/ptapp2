"use client"

/**
 * Chatt- och samtalssektionen: en telefon med Coavira-chatten (exempeldata)
 * där meddelandena dyker upp ett i taget när telefonen syns, ett
 * "Missat videosamtal"-kort med Ring upp och ett låtsassamtal där den egna
 * kamerarutan kan dras (eller flyttas med piltangenterna) och snäpper mot
 * närmaste hörn. Ingen kamera eller mikrofon används.
 */
import { AnimatePresence, animate, motion, useInView, useIsPresent, useMotionValue, useReducedMotion, useScroll, useTransform } from "framer-motion"
import {
  BadgeCheck,
  CheckCheck,
  ChevronLeft,
  Dumbbell,
  Hand,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  Paperclip,
  Phone,
  PhoneMissed,
  Play,
  SendHorizontal,
  Users,
  Video,
  VideoOff,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { BrandGlyph } from "@/components/brand"
import { PersonAvatar } from "@/components/common"
import { EASE, FloatingBadge, GlassCard, GradientText, PhoneFrame, Reveal, Section, Stagger, StaggerItem } from "@/components/landing/primitives"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Exempeldata (illustration – inga riktiga användare)                 */
/* ------------------------------------------------------------------ */

const PT_NAME = "Elin Söderberg"
const PT_FIRST = "Elin"

/** Den del av mockupen som en punkt i listan pekar på (lyses upp vid hovring). */
type Spot = "chat" | "call" | "missed"

type ChatItem =
  | { id: string; kind: "text"; from: "pt" | "me"; time: string; body: string; workout?: string; read?: boolean; spot?: Spot }
  | { id: string; kind: "video"; time: string; name: string; length: string; spot?: Spot }
  | { id: string; kind: "missed"; time: string; spot?: Spot }
  | { id: string; kind: "call"; time: string; minutes: number; spot?: Spot }

/** Chatten mellan klienten Sara och hennes PT Elin. */
const SCRIPT: ChatItem[] = [
  { id: "m1", kind: "text", from: "pt", time: "08:12", body: "God morgon Sara! Hur kändes knäböjen igår?" },
  { id: "m2", kind: "text", from: "me", time: "08:20", body: "Tungt på sista setet. Filmade det – kolla gärna tekniken!" },
  { id: "m3", kind: "video", time: "08:20", name: "Teknikvideo.mp4", length: "0:24", spot: "chat" },
  {
    id: "m4",
    kind: "text",
    from: "pt",
    time: "08:31",
    workout: "Benpass · igår",
    body: "Snyggt djup! Håll bröstet uppe i botten – nästa gång kör vi 80 kg på sista setet.",
    spot: "chat",
  },
  { id: "m5", kind: "text", from: "me", time: "08:33", body: "Deal. Tack Elin!", read: true },
  { id: "m6", kind: "missed", time: "12:05", spot: "missed" },
]

/** Elins svar efter det första samtalet. */
const REPLY: ChatItem = { id: "reply", kind: "text", from: "pt", time: "Nu", body: "Tack för samtalet! Vi ses på torsdag." }

/** Tidslinjen (ms efter att telefonen syns): hur många meddelanden som visas och om Elin skriver. */
const TIMELINE = [
  { at: 250, shown: 0, typing: true },
  { at: 1250, shown: 1, typing: false },
  { at: 2150, shown: 2, typing: false },
  { at: 2750, shown: 3, typing: false },
  { at: 3450, shown: 3, typing: true },
  { at: 4850, shown: 4, typing: false },
  { at: 5750, shown: 5, typing: false },
  { at: 6950, shown: 6, typing: false },
] as const
const LAST_FRAME = TIMELINE.length - 1

const FEATURES: { spot: Spot; icon: LucideIcon; title: string; text: string }[] = [
  {
    spot: "chat",
    icon: MessageCircle,
    title: "Chatt med bilagor",
    text: "Skicka bilder, teknikvideor och PDF:er. Feedback på ett pass hamnar i samma tråd – kopplad till just det passet.",
  },
  {
    spot: "call",
    icon: Video,
    title: "Röst- och videosamtal i appen",
    text: "Ring direkt från chatten – inga länkar, inga extra appar. Din kameraruta drar du dit den inte är i vägen.",
  },
  {
    spot: "missed",
    icon: PhoneMissed,
    title: "Missat samtal? Ring upp.",
    text: "Missade samtal hamnar som ett kort i chatten. Ett tryck på Ring upp, så är ni igång igen.",
  },
]

/** Fokusring som används på alla knappar i sektionen. */
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
/** Gör små knappar i mockupen minst 44 px att träffa utan att de ser större ut. */
const HIT = "before:absolute before:-inset-1.5 before:content-['']"
/** Avatarens reservfärg i Coaviras grönt. */
const AVATAR_TONE = "[&_[data-slot=avatar-fallback]]:bg-brand/15 [&_[data-slot=avatar-fallback]]:text-brand"

/* ------------------------------------------------------------------ */
/* Sektionen                                                           */
/* ------------------------------------------------------------------ */

/** Sektion D: chatt, bilagor, missade samtal och ett videosamtal att prova. */
export function ChatShowcase() {
  const reduce = useReducedMotion()
  const phoneRef = React.useRef<HTMLDivElement>(null)
  const openerRef = React.useRef<HTMLElement | null>(null)
  const callSeq = React.useRef(0)
  const inView = useInView(phoneRef, { once: true, amount: 0.35 })

  const [frame, setFrame] = React.useState(-1)
  const [spot, setSpot] = React.useState<Spot | null>(null)
  const [callOpen, setCallOpen] = React.useState(false)
  // Varje samtal får en egen nyckel så att en ny samtalsvy alltid monteras (även mitt i förra vyns utgång).
  const [callId, setCallId] = React.useState(0)
  const [extra, setExtra] = React.useState<ChatItem[]>([])
  const [replyTyping, setReplyTyping] = React.useState(false)
  const [status, setStatus] = React.useState("")

  // Spelar upp chatten när telefonen syns (med "minska rörelse": allt på en gång).
  React.useEffect(() => {
    if (!inView) return
    const timers = reduce
      ? [window.setTimeout(() => setFrame(LAST_FRAME), 0)]
      : TIMELINE.map((f, i) => window.setTimeout(() => setFrame((cur) => Math.max(cur, i)), f.at))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [inView, reduce])

  // Elin svarar en stund efter det första samtalet.
  React.useEffect(() => {
    if (!replyTyping) return
    const t = window.setTimeout(() => {
      setReplyTyping(false)
      setExtra((cur) => [...cur, REPLY])
    }, 1700)
    return () => window.clearTimeout(t)
  }, [replyTyping])

  const current = frame >= 0 ? TIMELINE[frame] : null
  const items = [...SCRIPT.slice(0, current?.shown ?? 0), ...extra]
  const typing = Boolean(current?.typing) || replyTyping
  const hasCalled = extra.some((i) => i.kind === "call")

  const openCall = (opener: HTMLElement) => {
    openerRef.current = opener
    setFrame(LAST_FRAME)
    setStatus("")
    setCallId((n) => n + 1)
    setCallOpen(true)
  }

  const endCall = (seconds: number) => {
    const minutes = Math.max(1, Math.ceil(seconds / 60))
    callSeq.current += 1
    const card: ChatItem = { id: `call-${callSeq.current}`, kind: "call", time: "Nu", minutes }
    setCallOpen(false)
    setExtra((cur) => [...cur, card].slice(-6))
    if (!extra.some((i) => i.id === REPLY.id) && !replyTyping) setReplyTyping(true)
    setStatus(`Samtalet är avslutat. Videosamtal, ${minutes} min, visas nu i chatten.`)
    const opener = openerRef.current
    window.requestAnimationFrame(() => opener?.focus({ preventScroll: true }))
  }

  return (
    <Section
      id="kommunikation"
      align="left"
      eyebrow="Chatt & samtal"
      title={
        <>
          Coachning som känns <GradientText>nära.</GradientText>
        </>
      }
      intro="Chatta, skicka teknikvideor och ring din PT – direkt i appen. Allt samlas i samma tråd, så ingenting faller mellan stolarna."
    >
      <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-12">
        <FeatureColumn
          callOpen={callOpen}
          onSpot={setSpot}
          onTry={(el) => {
            phoneRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })
            openCall(el)
          }}
        />
        <DemoStage phoneRef={phoneRef} callOpen={callOpen}>
          <div className="relative h-[520px] sm:h-[560px]">
            <ChatScreen items={items} typing={typing} spot={spot} pulse={!hasCalled} inert={callOpen} onCall={openCall} />
            <AnimatePresence>{callOpen && <CallScreen key={`call-${callId}`} onEnd={endCall} />}</AnimatePresence>
          </div>
        </DemoStage>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Vänster kolumn: punkter och knapp                                   */
/* ------------------------------------------------------------------ */

function FeatureColumn({ callOpen, onSpot, onTry }: { callOpen: boolean; onSpot: (spot: Spot | null) => void; onTry: (el: HTMLElement) => void }) {
  return (
    <div>
      <Stagger className="space-y-4" step={0.1}>
        {FEATURES.map((f, i) => (
          <StaggerItem key={f.spot}>
            <GlassCard
              onPointerEnter={(e) => e.pointerType === "mouse" && onSpot(f.spot)}
              onPointerLeave={() => onSpot(null)}
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className="group flex gap-4 p-5 sm:p-6"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
                <f.icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-pretty text-muted-foreground">{f.text}</p>
              </div>
              <span aria-hidden className="hidden self-start text-xs font-medium text-muted-foreground/60 tabular-nums sm:block">
                0{i + 1}
              </span>
            </GlassCard>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal delay={0.15} className="mt-6 space-y-3 text-sm text-muted-foreground">
        <p className="flex items-start gap-2.5">
          <Lock className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>Samtal låses upp när du har köpt en tjänst eller bokat ett pass med din PT.</span>
        </p>
        <p className="flex items-start gap-2.5">
          <Users className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
          <span>Flera PT:er? Du får en egen tråd med var och en.</span>
        </p>
      </Reveal>

      <Reveal delay={0.25} className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
        <button
          type="button"
          disabled={callOpen}
          onClick={(e) => onTry(e.currentTarget)}
          className={cn(
            "group inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full bg-brand pr-6 pl-2 text-sm font-semibold whitespace-nowrap text-brand-foreground shadow-[0_10px_40px_-10px] shadow-brand/60 transition-[translate,box-shadow,opacity] duration-300 hover:-translate-y-0.5 hover:shadow-brand/80 active:translate-y-0 disabled:opacity-70 motion-reduce:hover:translate-y-0",
            FOCUS
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-foreground/10">
            {callOpen ? <span className="size-2 rounded-full bg-brand-foreground motion-safe:animate-pulse" aria-hidden /> : <Video className="size-4" aria-hidden />}
          </span>
          {callOpen ? "Samtal pågår…" : "Testa videosamtalet"}
        </button>
        <p className="text-xs text-muted-foreground">Interaktiv demo – ingen kamera eller mikrofon används.</p>
      </Reveal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Höger kolumn: telefonen med sken, ringar och flytande brickor       */
/* ------------------------------------------------------------------ */

function DemoStage({ phoneRef, callOpen, children }: { phoneRef: React.RefObject<HTMLDivElement | null>; callOpen: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ["start end", "end start"] })
  // Parallax: 0 vid start (samma på server och klient), står still med "minska rörelse".
  const y = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -70])

  return (
    <div ref={wrapRef} className="relative flex flex-col items-center">
      {/* Bakgrund: grönt sken (starkare under samtal) och roterande ringar */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="absolute size-[420px] max-w-full rounded-full bg-brand/15 blur-[100px]" />
        <motion.div
          initial={false}
          animate={{ opacity: callOpen ? 1 : 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="absolute size-[320px] max-w-full rounded-full bg-emerald-400/25 blur-[90px]"
        />
        <motion.svg
          viewBox="0 0 100 100"
          initial={{ rotate: 0 }}
          animate={{ rotate: reduce ? 0 : 360 }}
          transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
          className="absolute hidden size-[440px] text-white/[0.08] md:block"
        >
          <circle cx="50" cy="50" r="49.5" fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="0.6 2.2" />
        </motion.svg>
        <div className="absolute hidden size-[560px] rounded-full border border-white/[0.04] xl:block" />
      </div>

      <motion.div style={{ y }} className="relative">
        <motion.div
          ref={phoneRef}
          initial={{ opacity: 0, y: 60, rotateX: 14, scale: 0.94 }}
          whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1, ease: EASE }}
          style={{ transformPerspective: 1200 }}
        >
          <PhoneFrame time="12:07">{children}</PhoneFrame>
        </motion.div>

        <div aria-hidden className={cn("pointer-events-none absolute inset-0 transition-opacity duration-500", callOpen && "opacity-0")}>
          <FloatingBadge delay={0.4} className="top-28 right-[calc(100%-18px)] hidden w-max xl:block">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Dumbbell className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-semibold">Feedback på passet</span>
              <span className="block text-[11px] text-muted-foreground">Kopplad till benpasset</span>
            </span>
          </FloatingBadge>
          <FloatingBadge delay={1.1} className="bottom-52 left-[calc(100%-18px)] hidden w-max xl:block">
            <span className="flex size-8 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Lock className="size-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-semibold">Samtal upplåsta</span>
              <span className="block text-[11px] text-muted-foreground">efter köp eller bokat pass</span>
            </span>
          </FloatingBadge>
        </div>
      </motion.div>

      <p className="relative mt-8 max-w-xs text-center text-sm text-muted-foreground">
        Prova: tryck <span className="font-medium text-foreground">Ring upp</span> i chatten och dra kamerarutan dit du vill.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chatten i telefonen                                                 */
/* ------------------------------------------------------------------ */

function ChatScreen({
  items,
  typing,
  spot,
  pulse,
  inert,
  onCall,
}: {
  items: ChatItem[]
  typing: boolean
  spot: Spot | null
  /** Pulserande Ring upp tills man ringt en gång. */
  pulse: boolean
  inert: boolean
  onCall: (opener: HTMLElement) => void
}) {
  const reduce = useReducedMotion()
  const callLit = spot === "call"
  return (
    <div inert={inert} className="flex h-full flex-col">
      {/* Huvud: PT:n och videoknapp */}
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-3 py-2.5">
        <ChevronLeft className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span aria-hidden>
          <PersonAvatar name={PT_NAME} className={cn("size-9 ring-1 ring-brand/30", AVATAR_TONE)} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-semibold">{PT_NAME}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <BadgeCheck className="size-3 text-brand" aria-hidden /> Verifierad PT
          </p>
        </div>
        <button
          type="button"
          aria-label={`Videosamtal med ${PT_NAME} (demo)`}
          onClick={(e) => onCall(e.currentTarget)}
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-foreground transition-[background-color,box-shadow] hover:bg-white/[0.14]",
            HIT,
            FOCUS,
            callLit && "bg-brand text-brand-foreground ring-2 ring-brand/60 ring-offset-2 ring-offset-background hover:bg-brand"
          )}
        >
          <Video className="size-4" aria-hidden />
        </button>
      </div>

      {/* Meddelanden: förankrade nertill, äldre glider upp och tonar ut */}
      <div className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_14%)]">
        <ol aria-label={`Exempelchatt mellan Sara och ${PT_NAME}`} className="relative flex h-full flex-col justify-end gap-1.5 px-3 pt-6 pb-3">
          <li className="flex shrink-0 justify-center py-1">
            <span className="rounded-full bg-white/[0.06] px-3 py-0.5 text-[11px] font-medium text-muted-foreground">Idag</span>
          </li>
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item) => {
              const mine = (item.kind === "text" && item.from === "me") || item.kind === "video"
              const centered = item.kind === "missed" || item.kind === "call"
              const lit = spot !== null && item.spot === spot
              const dim = spot !== null && !lit
              return (
                <motion.li
                  key={item.id}
                  layout="position"
                  initial={{ opacity: 0, y: 14, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.45, ease: EASE }}
                  className={cn("shrink-0", centered ? "origin-bottom" : mine ? "origin-bottom-right" : "origin-bottom-left")}
                >
                  <div className={cn("transition-opacity duration-300", dim && "opacity-40")}>
                    <ChatItemView item={item} lit={lit} pulse={pulse && !reduce} onCall={onCall} />
                  </div>
                </motion.li>
              )
            })}
            {typing && (
              <motion.li
                key="typing"
                layout="position"
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={{ duration: 0.35, ease: EASE }}
                className="shrink-0 origin-bottom-left"
              >
                <TypingBubble />
              </motion.li>
            )}
          </AnimatePresence>
        </ol>
      </div>

      {/* Skrivfältet (bara utseende) */}
      <div aria-hidden className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2.5">
        <Paperclip className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex-1 truncate rounded-full bg-white/[0.06] px-3 py-2 text-[12px] text-muted-foreground">Skriv ett meddelande…</div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <SendHorizontal className="size-4" />
        </span>
      </div>
    </div>
  )
}

/** Ett meddelande, en bilaga eller ett samtalskort i chatten. */
function ChatItemView({ item, lit, pulse, onCall }: { item: ChatItem; lit: boolean; pulse: boolean; onCall: (opener: HTMLElement) => void }) {
  const litRing = lit && "ring-2 ring-brand/70 ring-offset-2 ring-offset-background"

  if (item.kind === "text") {
    const mine = item.from === "me"
    return (
      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[84%] rounded-2xl px-3 py-2 text-[13px] leading-snug transition-shadow duration-300",
            mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-white/[0.08] text-foreground",
            litRing
          )}
        >
          <span className="sr-only">{mine ? "Sara:" : `${PT_FIRST}:`} </span>
          {item.workout && (
            <span className="mb-1 flex items-center gap-1 text-[11px] font-medium opacity-80">
              <Dumbbell className="size-3" aria-hidden /> {item.workout}
            </span>
          )}
          <span className="block">{item.body}</span>
          <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums opacity-75">
            {item.time}
            {item.read && (
              <span className="inline-flex items-center gap-0.5">
                <CheckCheck className="size-3" aria-hidden /> Läst
              </span>
            )}
          </span>
        </div>
      </div>
    )
  }

  if (item.kind === "video") {
    return (
      <div className="flex justify-end">
        <div className={cn("w-[176px] rounded-2xl rounded-br-md bg-primary p-1.5 text-primary-foreground transition-shadow duration-300", litRing)}>
          <span className="sr-only">Sara skickade en bilaga: </span>
          <div aria-hidden className="relative aspect-video overflow-hidden rounded-xl bg-[linear-gradient(135deg,#21362b,#0b120f)]">
            {/* Stiliserad stång med vikter */}
            <span className="absolute top-[34%] left-1/2 h-[3px] w-[120px] -translate-x-1/2 rounded-full bg-white/35" />
            <span className="absolute top-[22%] left-[calc(50%-52px)] h-[30%] w-[6px] rounded-sm bg-white/45" />
            <span className="absolute top-[22%] left-[calc(50%+46px)] h-[30%] w-[6px] rounded-sm bg-white/45" />
            <span className="absolute inset-x-3 bottom-3 h-px bg-white/10" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-9 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                <Play className="ml-0.5 size-4 fill-current" />
              </span>
            </span>
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1 text-[10px] font-medium text-white tabular-nums">{item.length}</span>
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
              <span className="block h-full w-1/3 bg-brand" />
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 px-1.5 pt-1.5 pb-0.5 text-[11px]">
            <span className="flex min-w-0 items-center gap-1 font-semibold">
              <Paperclip className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="shrink-0 text-[10px] tabular-nums opacity-75">{item.time}</span>
          </div>
        </div>
      </div>
    )
  }

  if (item.kind === "call") {
    return (
      <div className={cn("flex w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-card px-2.5 py-2 transition-shadow duration-300", litRing)}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Video className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12.5px] font-semibold">Videosamtal · {item.minutes} min</p>
          <p className="truncate text-[11px] text-muted-foreground tabular-nums">
            {item.time} · med {PT_NAME}
          </p>
        </div>
      </div>
    )
  }

  // Missat samtal: sticker ut (rött) och kan ringas upp direkt.
  return (
    <div className={cn("w-full rounded-2xl border border-destructive/35 bg-destructive/[0.09] p-2.5 transition-shadow duration-300", litRing)}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
          <VideoOff className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[12.5px] font-semibold">Missat videosamtal</p>
          <p className="truncate text-[11px] text-muted-foreground tabular-nums">
            {item.time} · från {PT_NAME}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Ring upp ${PT_NAME} (demo)`}
        onClick={(e) => onCall(e.currentTarget)}
        className={cn(
          "relative mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-brand text-[12.5px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90",
          HIT,
          FOCUS
        )}
      >
        {pulse && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-brand"
            initial={{ scaleX: 1, scaleY: 1, opacity: 0.45 }}
            animate={{ scaleX: 1.05, scaleY: 1.4, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <Video className="relative size-4" aria-hidden />
        <span className="relative">Ring upp</span>
      </button>
    </div>
  )
}

/** "Elin skriver…" med tre studsande prickar. */
function TypingBubble() {
  const reduce = useReducedMotion()
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white/[0.08] px-3.5 py-3">
        <span className="sr-only">{PT_FIRST} skriver…</span>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="size-1.5 rounded-full bg-foreground/70"
            animate={reduce ? { opacity: [0.4, 1, 0.4] } : { y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Låtsassamtalet                                                      */
/* ------------------------------------------------------------------ */

type Phase = "ringing" | "connected"
type Corner = "tl" | "tr" | "bl" | "br"

const CORNER_LABEL: Record<Corner, string> = { tl: "uppe till vänster", tr: "uppe till höger", bl: "nere till vänster", br: "nere till höger" }
/** Enter/mellanslag flyttar kamerarutan medurs till nästa hörn. */
const NEXT_CORNER: Record<Corner, Corner> = { br: "bl", bl: "tl", tl: "tr", tr: "br" }
const KEY_MOVES: Record<string, (c: Corner) => Corner> = {
  ArrowLeft: (c) => (c[0] === "t" ? "tl" : "bl"),
  ArrowRight: (c) => (c[0] === "t" ? "tr" : "br"),
  ArrowUp: (c) => (c[1] === "l" ? "tl" : "tr"),
  ArrowDown: (c) => (c[1] === "l" ? "bl" : "br"),
  Enter: (c) => NEXT_CORNER[c],
  " ": (c) => NEXT_CORNER[c],
}

/** Kamerarutans luft mot kanterna (överst lämnas plats för namnbrickan). */
const PAD = 12
const PAD_TOP = 48

/** Förskjutning från startläget (nere till höger) till ett hörn. */
function cornerOffset(stage: HTMLElement, pip: HTMLElement, corner: Corner) {
  const maxX = Math.max(0, stage.clientWidth - pip.offsetWidth - PAD * 2)
  const maxY = Math.max(0, stage.clientHeight - pip.offsetHeight - PAD - PAD_TOP)
  return { x: corner[1] === "l" ? -maxX : 0, y: corner[0] === "t" ? -maxY : 0 }
}

function formatTimer(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Samtalsskärmen ovanpå chatten (som appens samtalsvy): "Ringer…", sedan
 * kopplat med tid som räknas upp. Escape eller "Lägg på" avslutar.
 */
function CallScreen({ onEnd }: { onEnd: (seconds: number) => void }) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const endedRef = React.useRef(false)
  const hintId = React.useId()
  const [phase, setPhase] = React.useState<Phase>("ringing")
  const [seconds, setSeconds] = React.useState(0)
  const [muted, setMuted] = React.useState(false)
  const [cameraOff, setCameraOff] = React.useState(false)
  const [moved, setMoved] = React.useState(false)
  const [announce, setAnnounce] = React.useState("")
  // Under utgångsanimationen ska vyn inte gå att klicka eller tabba in i.
  const present = useIsPresent()

  React.useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  // "Ringer…" en kort stund, sedan kopplat.
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setPhase("connected")
      setAnnounce(`Samtalet med ${PT_NAME} är kopplat.`)
    }, 1600)
    return () => window.clearTimeout(t)
  }, [])

  // Samtalstiden räknas upp när samtalet är kopplat.
  React.useEffect(() => {
    if (phase !== "connected") return
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [phase])

  const hangUp = () => {
    if (endedRef.current) return
    endedRef.current = true
    onEnd(seconds)
  }

  return (
    <motion.div
      ref={rootRef}
      role="region"
      aria-label={`Demo: videosamtal med ${PT_NAME}`}
      tabIndex={-1}
      inert={!present}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return
        e.preventDefault()
        hangUp()
      }}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.3, ease: EASE } }}
      transition={{ duration: 0.45, ease: EASE }}
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_50%_0%,oklch(0.3_0.06_160),oklch(0.12_0.012_160))] text-white outline-none"
    >
      <div ref={stageRef} className="relative min-h-0 flex-1">
        <RemoteFeed phase={phase} />

        <AnimatePresence>
          {phase === "connected" && (
            <motion.div
              key="chip"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="absolute inset-x-0 top-3 flex justify-center"
            >
              <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium backdrop-blur-md">
                <SpeakingBars />
                {PT_NAME} · <span className="tabular-nums">{formatTimer(seconds)}</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === "connected" && !moved && (
            <motion.div
              key="hint"
              aria-hidden
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4, transition: { duration: 0.2 } }}
              transition={{ duration: 0.4, delay: 0.5, ease: EASE }}
              className="pointer-events-none absolute right-3 bottom-[132px]"
            >
              <HintChip />
            </motion.div>
          )}
        </AnimatePresence>

        <p id={hintId} className="sr-only">
          Piltangenterna flyttar rutan till ett hörn, Enter flyttar den medurs. Escape lägger på.
        </p>
        <SelfView
          stageRef={stageRef}
          describedBy={hintId}
          muted={muted}
          cameraOff={cameraOff}
          onMove={(corner) => {
            setMoved(true)
            setAnnounce(`Kamerarutan: ${CORNER_LABEL[corner]}.`)
          }}
        />
      </div>

      {/* Kontroller: frostad list med etiketter under ikonerna (som i appen) */}
      <div className="flex justify-center px-3 pt-2 pb-4">
        <div className="flex items-end gap-3.5 rounded-[1.75rem] bg-white/10 px-4 py-2.5 ring-1 ring-white/10 backdrop-blur-xl">
          <LabeledControl caption={muted ? "Ljud av" : "Mikrofon"}>
            <RoundButton label="Stäng av mikrofonen" pressed={muted} onClick={() => setMuted((m) => !m)}>
              {muted ? <MicOff /> : <Mic />}
            </RoundButton>
          </LabeledControl>
          <LabeledControl caption={cameraOff ? "Kamera av" : "Kamera"}>
            <RoundButton label="Stäng av kameran" pressed={cameraOff} onClick={() => setCameraOff((c) => !c)}>
              {cameraOff ? <VideoOff /> : <Video />}
            </RoundButton>
          </LabeledControl>
          <LabeledControl caption="Lägg på">
            <RoundButton label="Lägg på" tone="danger" onClick={hangUp}>
              <Phone className="rotate-[135deg]" />
            </RoundButton>
          </LabeledControl>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </motion.div>
  )
}

/** Motpartens "video": ringande avatar, sedan en stiliserad bild i motljus. */
function RemoteFeed({ phase }: { phase: Phase }) {
  const reduce = useReducedMotion()
  return (
    <div className="absolute inset-0">
      <AnimatePresence initial={false}>
        {phase === "connected" ? (
          <motion.div
            key="video"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="absolute inset-0 overflow-hidden bg-[linear-gradient(165deg,#22382d_0%,#111c17_55%,#0a100d_100%)]"
          >
            {/* Rummet: fönsterljus, viktskivor på väggen och en hylla */}
            <div className="absolute -top-16 -right-12 size-56 rounded-full bg-emerald-200/15 blur-3xl" />
            <div className="absolute top-16 left-5 flex flex-col items-center gap-1.5">
              <span className="size-10 rounded-full border-[6px] border-white/[0.07]" />
              <span className="size-7 rounded-full border-[5px] border-white/[0.06]" />
            </div>
            <div className="absolute top-28 right-6 h-1 w-16 rounded-full bg-white/[0.07]" />
            {/* Personen (stiliserad, i motljus) */}
            <motion.div
              initial={{ y: 0, rotate: 0 }}
              animate={reduce ? { y: 0, rotate: 0 } : { y: [0, -3, 0], rotate: [0, -0.8, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-x-0 bottom-0 flex flex-col items-center"
            >
              <div className="absolute bottom-28 size-52 rounded-full bg-brand/10 blur-2xl" />
              <div className="relative size-[84px] rounded-full bg-[radial-gradient(circle_at_38%_30%,#557a66,#1d2c25_72%)] ring-1 ring-emerald-100/15" />
              <div className="relative -mt-1 h-4 w-9 bg-[#1f2f27]" />
              <div className="relative -mt-1 h-[150px] w-[220px] rounded-t-[110px] bg-[linear-gradient(180deg,#2e4a3c,#121c17)] ring-1 ring-emerald-100/10">
                {/* Coavira-märket på tröjan */}
                <span className="absolute top-12 left-16 flex size-5 items-center justify-center rounded-md bg-brand/85 text-brand-foreground">
                  <BrandGlyph className="size-3.5" />
                </span>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="ringing"
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 pb-24"
          >
            <span aria-hidden className="relative">
              {[0, 1].map((i) => (
                <motion.span
                  key={i}
                  className="absolute inset-0 rounded-full border border-white/25"
                  initial={{ scale: 1, opacity: 0 }}
                  animate={reduce ? { scale: 1, opacity: 0.4 } : { scale: [1, 1.9], opacity: [0.6, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }}
                />
              ))}
              <PersonAvatar name={PT_NAME} className={cn("relative size-24 text-2xl ring-4 ring-white/10", AVATAR_TONE)} />
            </span>
            <div className="text-center">
              <p className="text-xl font-semibold tracking-tight">{PT_NAME}</p>
              <p className="mt-0.5 text-sm text-white/75">Ringer…</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/80">
              <Lock className="size-3" aria-hidden /> Krypterat · direkt mellan er
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Tre staplar som visar att motparten pratar. */
function SpeakingBars() {
  const reduce = useReducedMotion()
  return (
    <span aria-hidden className="flex h-3 items-end gap-[2px]">
      {[0.5, 1, 0.7].map((h, i) => (
        <motion.span
          key={i}
          className="h-full w-[3px] origin-bottom rounded-full bg-brand"
          initial={{ scaleY: h }}
          animate={reduce ? { scaleY: h } : { scaleY: [h, 0.3, 1, h] }}
          transition={{ duration: 1.1 + i * 0.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </span>
  )
}

/** "Dra kamerarutan ↔" med en hand som vickar. */
function HintChip() {
  const reduce = useReducedMotion()
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md">
      <motion.span
        className="inline-flex"
        initial={{ x: 0 }}
        animate={reduce ? { x: 0 } : { x: [0, -3, 3, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.4 }}
      >
        <Hand className="size-3.5" />
      </motion.span>
      Dra kamerarutan ↔
    </span>
  )
}

/**
 * Den egna kamerarutan (stiliserad – ingen riktig kamera). Dras inom
 * samtalsytan och snäpper till närmaste hörn när man släpper; en snabb
 * knuff räcker. Piltangenter/Enter flyttar den mellan hörnen.
 */
function SelfView({
  stageRef,
  describedBy,
  muted,
  cameraOff,
  onMove,
}: {
  stageRef: React.RefObject<HTMLDivElement | null>
  describedBy: string
  muted: boolean
  cameraOff: boolean
  onMove: (corner: Corner) => void
}) {
  const reduce = useReducedMotion()
  const pipRef = React.useRef<HTMLDivElement>(null)
  const cornerRef = React.useRef<Corner>("br")
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Rutan stannar i sitt hörn om samtalsytan byter storlek.
  React.useEffect(() => {
    const stage = stageRef.current
    const pip = pipRef.current
    if (!stage || !pip) return
    const ro = new ResizeObserver(() => {
      const t = cornerOffset(stage, pip, cornerRef.current)
      x.set(t.x)
      y.set(t.y)
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [stageRef, x, y])

  const moveTo = (corner: Corner) => {
    const stage = stageRef.current
    const pip = pipRef.current
    if (!stage || !pip) return
    cornerRef.current = corner
    const t = cornerOffset(stage, pip, corner)
    if (reduce) {
      x.set(t.x)
      y.set(t.y)
    } else {
      const spring = { type: "spring", stiffness: 420, damping: 34 } as const
      void animate(x, t.x, spring)
      void animate(y, t.y, spring)
    }
    onMove(corner)
  }

  /** Närmaste hörn, med rutans fart medräknad (en knuff kastar den dit). */
  const nearestCorner = (vx: number, vy: number): Corner => {
    const stage = stageRef.current
    const pip = pipRef.current
    if (!stage || !pip) return cornerRef.current
    const cx = stage.clientWidth - PAD - pip.offsetWidth / 2 + x.get() + vx * 0.15
    const cy = stage.clientHeight - PAD - pip.offsetHeight / 2 + y.get() + vy * 0.15
    const left = cx < stage.clientWidth / 2
    const top = cy < stage.clientHeight / 2
    return top ? (left ? "tl" : "tr") : left ? "bl" : "br"
  }

  return (
    <motion.div
      ref={pipRef}
      role="button"
      tabIndex={0}
      aria-label="Din kameraruta – dra eller använd piltangenterna"
      aria-describedby={describedBy}
      drag
      dragConstraints={stageRef}
      dragElastic={0.18}
      dragMomentum={false}
      onDragEnd={(_, info) => moveTo(nearestCorner(info.velocity.x, info.velocity.y))}
      onKeyDown={(e) => {
        const move = KEY_MOVES[e.key]
        if (!move) return
        e.preventDefault()
        moveTo(move(cornerRef.current))
      }}
      whileHover={{ scale: 1.03 }}
      whileDrag={{ scale: 1.07 }}
      style={{ x, y }}
      className="absolute right-3 bottom-3 z-10 aspect-[3/4] w-[84px] cursor-grab touch-none overflow-hidden rounded-2xl border border-white/25 shadow-2xl shadow-black/50 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black active:cursor-grabbing"
    >
      {cameraOff ? (
        <div aria-hidden className="flex h-full flex-col items-center justify-center gap-1 bg-[#161b21] text-white/75">
          <VideoOff className="size-5" />
          <span className="text-[10px]">Kamera av</span>
        </div>
      ) : (
        <div aria-hidden className="relative h-full bg-[linear-gradient(160deg,var(--brand),#34d399_45%,#065f46)]">
          <span className="absolute top-[24%] left-1/2 size-8 -translate-x-1/2 rounded-full bg-black/25" />
          <span className="absolute bottom-0 left-1/2 h-9 w-16 -translate-x-1/2 rounded-t-full bg-black/25" />
        </div>
      )}
      <span aria-hidden className="absolute bottom-1.5 left-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        Du
      </span>
      {muted && (
        <span aria-hidden className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
          <MicOff className="size-3" />
        </span>
      )}
    </motion.div>
  )
}

function LabeledControl({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span className="text-[10px] text-white/75" aria-hidden>
        {caption}
      </span>
    </div>
  )
}

/** Rund samtalsknapp: neutral (glas), intryckt (vit) eller lägg på (röd). */
function RoundButton({
  label,
  pressed,
  tone = "neutral",
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  tone?: "neutral" | "danger"
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={tone === "neutral" ? Boolean(pressed) : undefined}
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      className={cn(
        "flex items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black [&_svg]:size-5 [&_svg]:stroke-[2.2]",
        tone === "danger" ? "size-14 bg-[oklch(0.62_0.21_25)] text-white shadow-lg shadow-black/30 hover:bg-[oklch(0.56_0.21_25)]" : "size-12",
        tone === "neutral" && (pressed ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25")
      )}
    >
      {children}
    </motion.button>
  )
}
