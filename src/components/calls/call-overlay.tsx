"use client"

import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react"
import * as React from "react"

import { useCall } from "@/components/calls/call-provider"
import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

/** Inkommande samtal, "ringer…" och pågående samtal. Ligger över hela appen. */
export function CallOverlay() {
  const { state, accept, decline, hangup, toggleMute, toggleCamera } = useCall()
  const { mode } = useAppData()
  if (state.status === "idle" || !state.peer) return null
  const kindLabel = state.kind === "video" ? "Videosamtal" : "Röstsamtal"

  if (state.status === "incoming") {
    return (
      <div role="alertdialog" aria-label={`Inkommande ${kindLabel.toLowerCase()} från ${state.peer.name}`} className="fixed inset-x-0 top-0 z-50 mx-auto max-w-md p-3">
        <div className="flex items-center gap-3 rounded-2xl border bg-popover p-4 shadow-2xl">
          <PersonAvatar name={state.peer.name} className="size-12 animate-pulse ring-2 ring-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{state.peer.name}</div>
            <div className="text-sm text-muted-foreground">Inkommande {kindLabel.toLowerCase()}…</div>
          </div>
          <Button size="icon-lg" variant="destructive" className="rounded-full" aria-label="Avböj" onClick={decline}>
            <PhoneOff />
          </Button>
          <Button size="icon-lg" className="rounded-full" aria-label="Svara" onClick={accept} autoFocus>
            {state.kind === "video" ? <Video /> : <Phone />}
          </Button>
        </div>
      </div>
    )
  }

  const remoteHasVideo = (state.remoteStream?.getVideoTracks().length ?? 0) > 0
  const statusText =
    state.status === "outgoing" ? "Ringer…" : state.status === "connecting" ? "Ansluter…" : <CallTimer startedAt={state.startedAt} />

  return (
    <div role="dialog" aria-modal="true" aria-label={`${kindLabel} med ${state.peer.name}`} className="fixed inset-0 z-50 flex flex-col bg-[oklch(0.13_0.012_160)] text-white">
      {/* Motparten */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {remoteHasVideo && state.status === "connected" ? (
          <MediaView stream={state.remoteStream} className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <PersonAvatar name={state.peer.name} className={cn("size-28 text-3xl", state.status !== "connected" && "animate-pulse")} />
            <div className="text-center">
              <div className="text-xl font-semibold">{state.peer.name}</div>
              <div className="text-sm text-white/70">{statusText}</div>
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

      {/* Kontroller */}
      <div className="flex items-center justify-center gap-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <RoundButton label={state.muted ? "Slå på mikrofonen" : "Stäng av mikrofonen"} active={state.muted} onClick={toggleMute}>
          {state.muted ? <MicOff /> : <Mic />}
        </RoundButton>
        {state.kind === "video" && (
          <RoundButton label={state.cameraOff ? "Slå på kameran" : "Stäng av kameran"} active={state.cameraOff} onClick={toggleCamera}>
            {state.cameraOff ? <VideoOff /> : <Video />}
          </RoundButton>
        )}
        <Button size="icon-lg" variant="destructive" className="size-14 rounded-full" aria-label="Lägg på" onClick={hangup}>
          <PhoneOff className="size-6" />
        </Button>
      </div>
    </div>
  )
}

function RoundButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex size-12 items-center justify-center rounded-full transition-colors [&_svg]:size-5",
        active ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25"
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
