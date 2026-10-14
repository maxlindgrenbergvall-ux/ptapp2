/**
 * Signalering för samtal (WebRTC). Själva ljudet och videon går direkt mellan
 * parterna; här skickas bara korta meddelanden för att koppla ihop dem:
 * ring → accept → offer → answer → ice … → hangup.
 *
 * Transporten är utbytbar:
 * - SupabaseTransport: Realtime broadcast på den privata kanalen "call:{klient-id}".
 *   RLS på realtime.messages (se migrationen) gör att bara klienten och dennes
 *   aktiva PT kan lyssna och skicka.
 * - DemoTransport: simulerad motpart som svarar efter ett par sekunder.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type CallKind = "audio" | "video"
export interface Peer {
  id: string
  name: string
}

export type Signal =
  | { type: "ring"; callId: string; kind: CallKind; from: Peer }
  | { type: "accept"; callId: string; from: Peer }
  | { type: "decline"; callId: string; from: Peer; reason?: "busy" | "declined" }
  | { type: "offer"; callId: string; from: Peer; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; callId: string; from: Peer; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; callId: string; from: Peer; candidate: RTCIceCandidateInit }
  | { type: "hangup"; callId: string; from: Peer }

export interface SignalingTransport {
  /** Tråd (= klient-id) som kanalen gäller. */
  readonly threadId: string
  send(signal: Signal): Promise<void>
  onSignal(cb: (signal: Signal) => void): () => void
  close(): void
}

export class SupabaseTransport implements SignalingTransport {
  private listeners = new Set<(s: Signal) => void>()
  private channel: ReturnType<SupabaseClient["channel"]>
  private ready: Promise<void>

  constructor(
    private readonly sb: SupabaseClient,
    readonly threadId: string
  ) {
    this.channel = sb.channel(`call:${threadId}`, { config: { private: true, broadcast: { self: false, ack: true } } })
    this.channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      this.listeners.forEach((l) => l(payload as Signal))
    })
    this.ready = (async () => {
      // Privata kanaler auktoriseras med användarens JWT.
      await sb.realtime.setAuth()
      await new Promise<void>((resolve, reject) => {
        this.channel.subscribe((status, err) => {
          if (status === "SUBSCRIBED") resolve()
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(err ?? new Error(status))
        })
      })
    })()
    this.ready.catch(() => {})
  }

  async send(signal: Signal) {
    await this.ready
    const res = await this.channel.send({ type: "broadcast", event: "signal", payload: signal })
    if (res !== "ok") throw new Error(`Signalen kunde inte skickas (${res})`)
  }

  onSignal(cb: (s: Signal) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  close() {
    this.listeners.clear()
    void this.sb.removeChannel(this.channel)
  }
}

/**
 * Demoläge: motparten "svarar" efter 2 s och lägger på när vi gör det.
 * Ingen media skickas någonstans; samtalsvyn visar din egen kamera och motpartens avatar.
 */
export class DemoTransport implements SignalingTransport {
  private listeners = new Set<(s: Signal) => void>()
  private timers: number[] = []

  constructor(
    readonly threadId: string,
    private readonly demoPeer: Peer
  ) {}

  async send(signal: Signal) {
    if (signal.type === "ring") {
      this.timers.push(
        window.setTimeout(() => this.emit({ type: "accept", callId: signal.callId, from: this.demoPeer }), 2000)
      )
    }
  }

  private emit(s: Signal) {
    this.listeners.forEach((l) => l(s))
  }

  onSignal(cb: (s: Signal) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  close() {
    this.timers.forEach((t) => window.clearTimeout(t))
    this.listeners.clear()
  }
}

/**
 * STUN räcker för de flesta nät. Bakom strikta brandväggar/mobilnät krävs en
 * TURN-server (t.ex. Cloudflare, Twilio eller egen coturn), som anges i
 * NEXT_PUBLIC_ICE_SERVERS som JSON: [{"urls":"turn:…","username":"…","credential":"…"}].
 */
export function iceServers(): RTCIceServer[] {
  const raw = process.env.NEXT_PUBLIC_ICE_SERVERS
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RTCIceServer[]
      if (Array.isArray(parsed) && parsed.length) return parsed
    } catch {}
  }
  return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }]
}
