"use client"

import { Lock, Mic, MicOff, Phone, Video, VideoOff } from "lucide-react"
import * as React from "react"

import { useCall } from "@/components/calls/call-provider"
import { PersonAvatar } from "@/components/common"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

/** Inkommande samtal, "ringer…" och pågående samtal. Ligger över hela appen. */
export function CallOverlay() {
  const { state, accept, decline, hangup, toggleMute, toggleCamera } = useCall()
  const { mode, data } = useAppData()
  if (state.status === "idle" || !state.peer) return null
  const peerAvatar = data.trainers.find((t) => t.id === state.peer?.id)?.avatarUrl
  const kindLabel = state.kind === "video" ? "Videosamtal" : "Röstsamtal"

  if (state.status === "incoming") {
    return (
      <div
        role="alertdialog"
        aria-label={`Inkommande ${kindLabel.toLowerCase()} från ${state.peer.name}`}
        className="fixed inset-x-0 top-0 z-50 mx-auto max-w-md p-3 motion-safe:animate-in motion-safe:slide-in-from-top-4"
      >
        <div className="flex items-center gap-3 rounded-3xl bg-[oklch(0.18_0.015_160)]/95 p-3 pr-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
          <span className="relative">
            <span className="absolute inset-0 rounded-full bg-primary/40 motion-safe:animate-ping" aria-hidden />
            <PersonAvatar name={state.peer.name} src={peerAvatar} className="relative size-12 ring-2 ring-white/20" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{state.peer.name}</div>
            <div className="flex items-center gap-1 text-xs text-white/70">
              {state.kind === "video" ? <Video className="size-3.5" /> : <Phone className="size-3.5" />} {kindLabel}
            </div>
          </div>
          <RoundButton label="Avböj" tone="danger" onClick={decline}>
            <Phone className="rotate-[135deg]" />
          </RoundButton>
          <RoundButton label="Svara" tone="accept" onClick={accept} autoFocus>
            {state.kind === "video" ? <Video /> : <Phone />}
          </RoundButton>
        </div>
      </div>
    )
  }

  const remoteHasVideo = (state.remoteStream?.getVideoTracks().length ?? 0) > 0
  const statusText =
    state.status === "outgoing" ? "Ringer…" : state.status === "connecting" ? "Ansluter…" : <CallTimer startedAt={state.startedAt} />

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${kindLabel} med ${state.peer.name}`}
      className="fixed inset-0 z-50 flex flex-col bg-[radial-gradient(120%_80%_at_50%_0%,oklch(0.3_0.06_160),oklch(0.12_0.012_160))] text-white"
    >
      {/* Motparten */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {remoteHasVideo && state.status === "connected" ? (
          <MediaView stream={state.remoteStream} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-5">
            <span className="relative">
              {state.status !== "connected" && <span className="absolute -inset-3 rounded-full border border-white/15 motion-safe:animate-ping" aria-hidden />}
              <PersonAvatar name={state.peer.name} src={peerAvatar} className="relative size-28 text-3xl ring-4 ring-white/10" />
            </span>
            <div className="text-center">
              <div className="text-2xl font-semibold tracking-tight">{state.peer.name}</div>
              <div className="mt-1 text-sm text-white/70 tabular">{statusText}</div>
              <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/70">
                <Lock className="size-3" /> Krypterat · direkt mellan er
              </div>
              {mode === "demo" && state.status === "connected" && (
                <p className="mt-3 max-w-xs text-xs text-white/60">Demoläge: ingen riktig motpart. Med Supabase kopplas samtalet upp på riktigt.</p>
              )}
            </div>
          </div>
        )}
        {/* Ljud från motparten när det inte finns video */}
        {!remoteHasVideo && state.remoteStream && <MediaView stream={state.remoteStream} audioOnly />}

        {remoteHasVideo && state.status === "connected" && (
          <div className="absolute top-4 left-4 rounded-full bg-black/40 px-3 py-1 text-sm backdrop-blur">
            {state.peer.name} · {statusText}
          </div>
        )}

        {/* Egen kamera */}
        {state.kind === "video" && state.localStream && !state.cameraOff && (
          <MediaView
            stream={state.localStream}
            muted
            mirror
            className="absolute right-4 bottom-4 aspect-[3/4] w-28 rounded-xl border border-white/20 object-cover shadow-lg sm:w-40"
          />
        )}
      </div>

      {/* Kontroller: frostad list med etiketter under ikonerna */}
      <div className="flex justify-center px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-5 rounded-[2rem] bg-white/10 px-6 py-3 ring-1 ring-white/10 backdrop-blur-xl">
          <LabeledControl caption={state.muted ? "Ljud av" : "Mikrofon"}>
            <RoundButton label={state.muted ? "Slå på mikrofonen" : "Stäng av mikrofonen"} active={state.muted} onClick={toggleMute}>
              {state.muted ? <MicOff /> : <Mic />}
            </RoundButton>
          </LabeledControl>
          {state.kind === "video" && (
            <LabeledControl caption={state.cameraOff ? "Kamera av" : "Kamera"}>
              <RoundButton label={state.cameraOff ? "Slå på kameran" : "Stäng av kameran"} active={state.cameraOff} onClick={toggleCamera}>
                {state.cameraOff ? <VideoOff /> : <Video />}
              </RoundButton>
            </LabeledControl>
          )}
          <LabeledControl caption="Lägg på">
            <RoundButton label="Lägg på" tone="danger" size="lg" onClick={hangup}>
              <Phone className="rotate-[135deg]" />
            </RoundButton>
          </LabeledControl>
        </div>
      </div>
    </div>
  )
}

function LabeledControl({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span className="text-[11px] text-white/70" aria-hidden>
        {caption}
      </span>
    </div>
  )
}

/** Rund samtalsknapp: neutral (glas), aktiv (vit), avböj/lägg på (röd) eller svara (grön). */
function RoundButton({
  label,
  active = false,
  tone = "neutral",
  size = "md",
  autoFocus,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  tone?: "neutral" | "danger" | "accept"
  size?: "md" | "lg"
  autoFocus?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={tone === "neutral" ? active : undefined}
      autoFocus={autoFocus}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95 [&_svg]:size-[22px] [&_svg]:stroke-[2.2]",
        size === "lg" ? "size-16" : "size-13",
        tone === "danger" && "bg-[oklch(0.62_0.21_25)] text-white shadow-lg shadow-black/30 hover:bg-[oklch(0.56_0.21_25)]",
        tone === "accept" && "bg-[oklch(0.68_0.17_150)] text-white shadow-lg shadow-black/30 hover:bg-[oklch(0.62_0.17_150)]",
        tone === "neutral" && (active ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25")
      )}
    >
      {children}
    </button>
  )
}

function MediaView({
  stream,
  muted,
  mirror,
  audioOnly,
  className,
}: {
  stream?: MediaStream
  muted?: boolean
  mirror?: boolean
  audioOnly?: boolean
  className?: string
}) {
  const ref = React.useRef<HTMLVideoElement & HTMLAudioElement>(null)
  React.useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream
  }, [stream])
  if (audioOnly) return <audio ref={ref} autoPlay />
  return <video ref={ref} autoPlay playsInline muted={muted} className={cn(mirror && "-scale-x-100", className)} />
}

function CallTimer({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const s = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
  return (
    <span className="tabular">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  )
}
