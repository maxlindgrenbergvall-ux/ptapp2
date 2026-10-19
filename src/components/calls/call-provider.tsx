"use client"

import * as React from "react"
import { toast } from "sonner"

import { CallOverlay } from "@/components/calls/call-overlay"
import { CallEngine, CallError, IDLE, type CallState } from "@/lib/calls/call-engine"
import { DemoTransport, SupabaseTransport, type CallKind, type Peer } from "@/lib/calls/signaling"
import { myTrainers } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { hasCallAccess } from "@/lib/calls/access"
import { callThread, parseCallThread } from "@/lib/calls/thread"
import { getSupabase } from "@/lib/supabase/client"

interface CallCtx {
  state: CallState
  start: (threadId: string, peer: Peer, kind: CallKind) => void
  accept: () => void
  decline: () => void
  hangup: () => void
  toggleMute: () => void
  toggleCamera: () => void
}

const Ctx = React.createContext<CallCtx | null>(null)

/** Håller samtalsmotorn och lyssnar efter inkommande samtal i användarens trådar. */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const { me, mode, data, actions } = useAppData()
  const [state, setState] = React.useState<CallState>(IDLE)

  const [engine] = React.useState(
    () =>
      new CallEngine(
        { id: me.id, name: me.name },
        (threadId, peer) =>
          mode === "supabase"
            ? new SupabaseTransport(getSupabase(), threadId)
            : new DemoTransport(threadId, peer ?? { id: "demo", name: "Demo" }),
        setState,
        {
          // `actions` är stabilt så länge samma användare är inloggad.
          // Samtalstråden är "klient:pt" – loggen hamnar i rätt PT–klient-tråd.
          log: (threadId, text) => {
            const { clientId, trainerId } = parseCallThread(threadId)
            actions.sendMessage(clientId, text, undefined, { trainerId })
          },
          notify: (text) => toast(text),
        },
        mode === "demo"
      )
  )

  // Trådar att lyssna på: en per PT–klient-par (klienten kan ha flera PT:er).
  const threadIds = React.useMemo(
    () =>
      me.role === "client"
        ? myTrainers(data, me.id)
            .filter((t) => hasCallAccess(data, me.id, t.id))
            .map((t) => callThread(me.id, t.id))
        : data.clients
            // Bara par med köp eller bokat pass kan ringa (databasen spärrar kanalen annars).
            .filter((c) => c.trainerId === me.id && (c.status === "active" || c.status === "paused") && hasCallAccess(data, c.id, me.id))
            .map((c) => callThread(c.id, me.id)),
    [me, data]
  )
  const key = threadIds.join(",")
  React.useEffect(() => {
    // Demoläget har ingen motpart som kan ringa in.
    if (mode === "supabase") engine.listen(key ? key.split(",") : [])
  }, [engine, key, mode])
  React.useEffect(() => () => engine.dispose(), [engine])

  // Varna innan fliken stängs mitt i ett samtal.
  React.useEffect(() => {
    if (state.status === "idle") return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [state.status])

  const value = React.useMemo<CallCtx>(() => {
    const guard = (p: Promise<void>) =>
      p.catch((e) => toast.error(e instanceof CallError ? e.message : "Samtalet kunde inte startas"))
    return {
      state,
      start: (threadId, peer, kind) => void guard(engine.start(threadId, peer, kind)),
      accept: () => void guard(engine.accept()),
      decline: () => engine.decline(),
      hangup: () => engine.hangup(),
      toggleMute: () => engine.toggleMute(),
      toggleCamera: () => engine.toggleCamera(),
    }
  }, [engine, state])

  return (
    <Ctx.Provider value={value}>
      {children}
      <CallOverlay />
    </Ctx.Provider>
  )
}

export function useCall() {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("useCall måste användas inom <CallProvider>")
  return ctx
}
