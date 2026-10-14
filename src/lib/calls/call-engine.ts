/**
 * Samtalslogiken (WebRTC), fristående från React.
 *
 * Roller: den som ringer skapar SDP-offer när den andra parten har svarat;
 * den som tar emot svarar med answer. ICE-kandidater skickas löpande åt båda
 * hållen och köas tills motpartens SDP är satt.
 */
import {
  iceServers,
  type CallKind,
  type Peer,
  type Signal,
  type SignalingTransport,
} from "@/lib/calls/signaling"

export type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "connected"

export interface CallState {
  status: CallStatus
  callId?: string
  kind: CallKind
  peer?: Peer
  threadId?: string
  role?: "caller" | "callee"
  startedAt?: number
  muted: boolean
  cameraOff: boolean
  localStream?: MediaStream
  remoteStream?: MediaStream
}

export const IDLE: CallState = { status: "idle", kind: "video", muted: false, cameraOff: false }

const RING_TIMEOUT_MS = 30_000

export class CallError extends Error {}

export class CallEngine {
  private state: CallState = IDLE
  private transports = new Map<string, { t: SignalingTransport; off: () => void }>()
  private pc: RTCPeerConnection | null = null
  private pendingIce: RTCIceCandidateInit[] = []
  private ringTimer: number | undefined

  constructor(
    private readonly me: Peer,
    private readonly makeTransport: (threadId: string, peer?: Peer) => SignalingTransport,
    private readonly onChange: (s: CallState) => void,
    private readonly callbacks: {
      /** Loggar ett meddelande i chatten (t.ex. "Missat samtal"). */
      log: (threadId: string, text: string) => void
      notify: (text: string) => void
    },
    private readonly demo: boolean
  ) {}

  // ------------------------------------------------------------ kanaler ---

  /** Lyssnar efter inkommande samtal i de här trådarna (en per PT–klient-par). */
  listen(threadIds: string[]) {
    for (const id of threadIds) this.transport(id)
    for (const [id, entry] of this.transports) {
      if (!threadIds.includes(id) && id !== this.state.threadId) {
        entry.off()
        entry.t.close()
        this.transports.delete(id)
      }
    }
  }

  dispose() {
    this.end()
    this.transports.forEach(({ t, off }) => {
      off()
      t.close()
    })
    this.transports.clear()
  }

  private transport(threadId: string, peer?: Peer) {
    let entry = this.transports.get(threadId)
    if (!entry) {
      const t = this.makeTransport(threadId, peer)
      entry = { t, off: t.onSignal((s) => void this.handle(threadId, s)) }
      this.transports.set(threadId, entry)
    }
    return entry.t
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch }
    this.onChange(this.state)
  }

  private send(signal: Signal) {
    const threadId = this.state.threadId
    if (!threadId) return
    this.transport(threadId).send(signal).catch(() => this.callbacks.notify("Kunde inte nå motparten."))
  }

  // ------------------------------------------------------------ åtgärder ---

  async start(threadId: string, peer: Peer, kind: CallKind) {
    if (this.state.status !== "idle") return
    const stream = await this.media(kind)
    const callId = crypto.randomUUID()
    this.transport(threadId, peer)
    this.set({ ...IDLE, status: "outgoing", callId, kind, peer, threadId, role: "caller", localStream: stream, cameraOff: !hasVideo(stream) })
    this.send({ type: "ring", callId, kind, from: this.me })
    this.ringTimer = window.setTimeout(() => {
      if (this.state.status !== "outgoing") return
      this.send({ type: "hangup", callId, from: this.me })
      this.callbacks.log(threadId, `📵 Missat ${kind === "video" ? "videosamtal" : "röstsamtal"}`)
      this.callbacks.notify(`${peer.name} svarade inte`)
      this.end()
    }, RING_TIMEOUT_MS)
  }

  async accept() {
    const { status, callId, kind } = this.state
    if (status !== "incoming" || !callId) return
    window.clearTimeout(this.ringTimer)
    try {
      const stream = await this.media(kind)
      this.set({ status: "connecting", localStream: stream, cameraOff: !hasVideo(stream) })
      this.createPeer(stream)
      this.send({ type: "accept", callId, from: this.me })
    } catch (e) {
      this.decline()
      throw e
    }
  }

  decline() {
    const { callId } = this.state
    if (callId) this.send({ type: "decline", callId, from: this.me, reason: "declined" })
    this.end()
  }

  hangup() {
    const { callId, status, startedAt, role, threadId, kind } = this.state
    if (!callId) return
    this.send({ type: "hangup", callId, from: this.me })
    if (status === "connected" && role === "caller" && threadId && startedAt) {
      const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000))
      this.callbacks.log(threadId, `📞 ${kind === "video" ? "Videosamtal" : "Röstsamtal"} · ${minutes} min`)
    }
    this.end()
  }

  toggleMute() {
    const muted = !this.state.muted
    this.state.localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted))
    this.set({ muted })
  }

  toggleCamera() {
    const tracks = this.state.localStream?.getVideoTracks() ?? []
    if (tracks.length === 0) return
    const cameraOff = !this.state.cameraOff
    tracks.forEach((t) => (t.enabled = !cameraOff))
    this.set({ cameraOff })
  }

  // ----------------------------------------------------- inkommande signaler ---

  private async handle(threadId: string, s: Signal) {
    if (s.from.id === this.me.id) return
    const st = this.state

    if (s.type === "ring") {
      if (st.status !== "idle") {
        // Upptagen: tala om det för den som ringer.
        void this.transport(threadId).send({ type: "decline", callId: s.callId, from: this.me, reason: "busy" })
        return
      }
      this.set({ ...IDLE, status: "incoming", callId: s.callId, kind: s.kind, peer: s.from, threadId, role: "callee" })
      navigator.vibrate?.([300, 200, 300])
      this.ringTimer = window.setTimeout(() => this.state.status === "incoming" && this.end(), RING_TIMEOUT_MS)
      return
    }

    if (s.callId !== st.callId) return

    switch (s.type) {
      case "accept":
        if (st.status !== "outgoing") return
        window.clearTimeout(this.ringTimer)
        if (this.demo) {
          this.set({ status: "connected", startedAt: Date.now() })
          return
        }
        this.set({ status: "connecting" })
        await this.makeOffer()
        return
      case "decline":
        this.callbacks.notify(s.reason === "busy" ? `${st.peer?.name ?? "Motparten"} är upptagen i ett annat samtal` : `${st.peer?.name ?? "Motparten"} avböjde samtalet`)
        this.end()
        return
      case "offer":
        if (!this.pc) return
        await this.pc.setRemoteDescription(s.sdp)
        await this.flushIce()
        await this.pc.setLocalDescription(await this.pc.createAnswer())
        this.send({ type: "answer", callId: s.callId, from: this.me, sdp: this.pc.localDescription!.toJSON() })
        return
      case "answer":
        if (!this.pc) return
        await this.pc.setRemoteDescription(s.sdp)
        await this.flushIce()
        return
      case "ice":
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(s.candidate).catch(() => {})
        else this.pendingIce.push(s.candidate)
        return
      case "hangup":
        if (st.status === "incoming") this.callbacks.notify(`Missat samtal från ${st.peer?.name ?? "okänd"}`)
        this.end()
        return
    }
  }

  // --------------------------------------------------------------- WebRTC ---

  private async makeOffer() {
    const stream = this.state.localStream
    if (!stream || !this.state.callId) return
    const pc = this.createPeer(stream)
    await pc.setLocalDescription(await pc.createOffer())
    this.send({ type: "offer", callId: this.state.callId, from: this.me, sdp: pc.localDescription!.toJSON() })
  }

  private createPeer(stream: MediaStream) {
    const pc = new RTCPeerConnection({ iceServers: iceServers() })
    this.pc = pc
    this.pendingIce = []
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    const remote = new MediaStream()
    this.set({ remoteStream: remote })
    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => remote.getTracks().includes(t) || remote.addTrack(t))
      this.set({ remoteStream: remote })
    }
    pc.onicecandidate = (e) => {
      if (e.candidate && this.state.callId) {
        this.send({ type: "ice", callId: this.state.callId, from: this.me, candidate: e.candidate.toJSON() })
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && this.state.status !== "connected") {
        this.set({ status: "connected", startedAt: Date.now() })
      } else if (pc.connectionState === "failed") {
        this.callbacks.notify("Anslutningen bröts. Ett nätverk med strikt brandvägg kan kräva en TURN-server.")
        this.hangup()
      }
    }
    return pc
  }

  private async flushIce() {
    const pc = this.pc
    if (!pc) return
    const queued = this.pendingIce
    this.pendingIce = []
    for (const c of queued) await pc.addIceCandidate(c).catch(() => {})
  }

  private async media(kind: CallKind): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CallError("Samtal kräver en webbläsare med stöd för kamera/mikrofon (och https).")
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: kind === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      })
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ""
      // Ingen kamera? Ett videosamtal kan ändå köras med bara ljud.
      if (kind === "video" && (name === "NotFoundError" || name === "OverconstrainedError")) return this.media("audio")
      if (name === "NotAllowedError") throw new CallError("Ge appen tillgång till mikrofon och kamera i webbläsarens inställningar.")
      if (name === "NotFoundError") throw new CallError("Ingen mikrofon hittades.")
      throw new CallError("Kunde inte starta kamera/mikrofon.")
    }
  }

  private end() {
    window.clearTimeout(this.ringTimer)
    this.state.localStream?.getTracks().forEach((t) => t.stop())
    this.pc?.close()
    this.pc = null
    this.pendingIce = []
    this.set(IDLE)
  }
}

function hasVideo(stream: MediaStream) {
  return stream.getVideoTracks().length > 0
}
