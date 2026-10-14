"use client"

/**
 * Datalagret som alla vyer använder via `useAppData()`.
 *
 * Två lägen, samma API:
 * - **Supabase** (när NEXT_PUBLIC_SUPABASE_* är satta): data laddas med RLS,
 *   ändringar appliceras direkt i UI:t, läggs i en offlinekö och skickas i
 *   ordning. Realtid håller chatt, bokningar och pass uppdaterade.
 * - **Demo**: mockdata i webbläsaren, för utveckling och visningar.
 */

import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { DEMO_CLIENT_ID, DEMO_TRAINER_ID, createSeedData } from "@/lib/data/seed"
import { backoffMs, Outbox } from "@/lib/data/outbox"
import { reducer, replay, type Action, type PersistableAction, type TrainerProfilePatch } from "@/lib/data/state"
import { todayISO } from "@/lib/date"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled } from "@/lib/supabase/config"
import type {
  AppData,
  BookingStatus,
  ClientStatus,
  ID,
  ISODate,
  Me,
  NutritionPlan,
  SetLog,
  UserRole,
  WeightEntry,
  WorkoutStatus,
  WorkoutTemplate,
} from "@/types/domain"

export type SyncStatus = "synced" | "syncing" | "offline" | "error"
export interface SyncState {
  status: SyncStatus
  pending: number
}

const DEMO_KEY = "pt-platform:v1"
const outboxKey = (uid: string) => `forma:outbox:v1:${uid}`
const cacheKey = (uid: string) => `forma:cache:v1:${uid}`

// ------------------------------------------------------------- actions ---

function createActions(ctx: {
  me: Me
  getData: () => AppData
  commit: (a: PersistableAction) => void
  dispatch: React.Dispatch<Action>
  mode: "demo" | "supabase"
}) {
  const { me, getData, commit } = ctx
  const newId = () => crypto.randomUUID()
  const now = () => new Date().toISOString()

  return {
    newId,
    logSet: (workoutId: ID, log: SetLog) => {
      // Första loggade setet startar passet.
      if (getData().workouts.find((w) => w.id === workoutId)?.status === "planned") {
        commit({ type: "setWorkoutStatus", workoutId, status: "in_progress" })
      }
      commit({ type: "upsertSetLog", workoutId, log })
    },
    setWorkoutStatus: (workoutId: ID, status: WorkoutStatus, comment?: string) =>
      commit({ type: "setWorkoutStatus", workoutId, status, comment, completedAt: status === "completed" ? now() : undefined }),
    scheduleWorkout: (clientId: ID, template: WorkoutTemplate, date: ISODate) => {
      const id = newId()
      commit({
        type: "addWorkout",
        workout: {
          id,
          clientId,
          templateId: template.id,
          name: template.name,
          date,
          // Ögonblicksbild av mallen med egna id:n per övning (set-loggar pekar på dem).
          exercises: template.exercises.map((e) => ({ ...e, id: newId() })),
          status: "planned",
          logs: [],
        },
      })
    },
    saveTemplate: (template: WorkoutTemplate) => commit({ type: "upsertTemplate", template }),
    deleteTemplate: (templateId: ID) => commit({ type: "deleteTemplate", templateId }),
    saveNutritionPlan: (plan: NutritionPlan) => commit({ type: "upsertNutritionPlan", plan }),
    toggleMeal: (clientId: ID, date: ISODate, mealId: ID) => {
      const checked = !getData().mealChecks.some((m) => m.clientId === clientId && m.date === date && m.mealId === mealId)
      commit({ type: "setMealCheck", clientId, date, mealId, checked })
    },
    sendMessage: (threadId: ID, body: string, workoutId?: ID) => {
      const text = body.trim()
      if (!text) return
      commit({
        type: "addMessage",
        message: { id: newId(), threadId, senderId: me.id, body: text.slice(0, 2000), workoutId, sentAt: now() },
      })
    },
    markThreadRead: (threadId: ID) => {
      const hasUnread = getData().messages.some((m) => m.threadId === threadId && m.senderId !== me.id && !m.readAt)
      if (hasUnread) commit({ type: "markThreadRead", threadId, readerId: me.id, readAt: now() })
    },
    addWeight: (clientId: ID, entry: WeightEntry) => commit({ type: "addWeight", clientId, entry }),
    requestBooking: (trainerId: ID, slot: string, note?: string) => {
      const self = getData().clients.find((c) => c.id === me.id)
      // Första bokningen hos en PT är också en förfrågan om coachning.
      if (self && !self.trainerId) commit({ type: "requestCoaching", trainerId, clientId: me.id, goal: "" })
      commit({
        type: "addBooking",
        booking: { id: newId(), trainerId, clientId: me.id, slot, note, status: "requested" },
      })
    },
    setBookingStatus: (bookingId: ID, status: BookingStatus) => commit({ type: "setBookingStatus", bookingId, status }),
    setClientStatus: (clientId: ID, status: ClientStatus) => {
      const current = getData().clients.find((c) => c.id === clientId)
      commit({
        type: "setClientStatus",
        clientId,
        status,
        startedAt: current?.status === "pending" && status === "active" ? todayISO() : undefined,
      })
    },
    updateTrainerProfile: (patch: TrainerProfilePatch) => commit({ type: "updateTrainerProfile", trainerId: me.id, patch }),
    addAvailability: (slot: string) => commit({ type: "addAvailability", trainerId: me.id, slot }),
    removeAvailability: (slot: string) => commit({ type: "removeAvailability", trainerId: me.id, slot }),
    resetDemo: () => {
      if (ctx.mode !== "demo") return
      try {
        window.localStorage.removeItem(DEMO_KEY)
      } catch {}
      ctx.dispatch({ type: "hydrate", data: createSeedData() })
    },
  }
}

export type AppActions = ReturnType<typeof createActions>

interface Ctx {
  data: AppData
  me: Me
  mode: "demo" | "supabase"
  actions: AppActions
  sync: SyncState
  signOut: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const DataContext = React.createContext<Ctx | null>(null)

// ------------------------------------------------------------- provider ---

export function AppDataProvider({ children, role }: { children: React.ReactNode; role: UserRole }) {
  return isSupabaseEnabled ? <SupabaseProvider role={role}>{children}</SupabaseProvider> : <DemoProvider role={role}>{children}</DemoProvider>
}

/**
 * Håller senaste tillståndet utanför React så att actions (händelsehanterare)
 * alltid ser det, även flera ändringar i samma händelse.
 */
class LocalEngine {
  private data: AppData | null = null
  constructor(private readonly dispatch: React.Dispatch<Action>) {}
  getData = () => this.data!
  setData(data: AppData | null) {
    this.data = data
  }
  apply = (a: Action) => {
    this.data = reducer(this.data, a)
    this.dispatch(a)
  }
}

function DemoProvider({ children, role }: { children: React.ReactNode; role: UserRole }) {
  const [data, dispatch] = React.useReducer(reducer, null)
  const [engine] = React.useState(() => new LocalEngine(dispatch))

  // Datan skapas först i webbläsaren: den beror på dagens datum och localStorage.
  React.useEffect(() => {
    engine.apply({ type: "hydrate", data: loadDemo() })
  }, [engine])

  React.useEffect(() => {
    engine.setData(data)
    if (!data) return
    try {
      window.localStorage.setItem(DEMO_KEY, JSON.stringify({ savedOn: todayISO(), data }))
    } catch {}
  }, [data, engine])

  const me = React.useMemo<Me>(() => {
    const id = role === "trainer" ? DEMO_TRAINER_ID : DEMO_CLIENT_ID
    return { id, role, name: role === "trainer" ? "Elin Söderberg" : "Sara Lindqvist" }
  }, [role])

  const actions = React.useMemo(
    () => createActions({ me, mode: "demo", dispatch: engine.apply, getData: engine.getData, commit: engine.apply }),
    [me, engine]
  )

  const value = React.useMemo<Ctx | null>(
    () =>
      data
        ? {
            data,
            me,
            mode: "demo",
            actions,
            sync: { status: "synced", pending: 0 },
            signOut: async () => {
              window.location.replace("/")
            },
            deleteAccount: async () => {
              toast.info("Kontoradering finns bara när Supabase är kopplat.")
            },
          }
        : null,
    [data, me, actions]
  )

  if (!value) return <LoadingScreen />
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

function loadDemo(): AppData {
  try {
    const raw = window.localStorage.getItem(DEMO_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { savedOn: ISODate; data: AppData }
      // Demodatan är relativ till datumet den skapades, så en ny dag ger ny data.
      if (parsed.savedOn === todayISO()) return parsed.data
    }
  } catch {}
  return createSeedData()
}

/**
 * Optimistiska ändringar + offlinekö mot Supabase. Varje ändring appliceras
 * lokalt direkt, läggs i kön och skickas i ordning. Vid nätverksfel väntar kön
 * (exponentiell backoff, 'online'-händelsen, flikfokus) och fortsätter sedan.
 */
class SyncEngine extends LocalEngine {
  me: Me | null = null
  outbox: Outbox | null = null
  private flushing = false
  private retryTimer: number | undefined

  constructor(
    dispatch: React.Dispatch<Action>,
    private readonly setSync: React.Dispatch<React.SetStateAction<SyncState>>
  ) {
    super(dispatch)
  }

  start(me: Me) {
    this.me = me
    this.outbox = new Outbox(outboxKey(me.id))
  }

  get pending() {
    return this.outbox?.size ?? 0
  }

  commit = (a: PersistableAction) => {
    this.apply(a)
    this.outbox?.push(a)
    this.setSync((s) => ({ ...s, pending: this.pending }))
    void this.flush()
  }

  flush = async () => {
    const { outbox, me } = this
    if (!outbox || !me || this.flushing) return
    this.flushing = true
    window.clearTimeout(this.retryTimer)
    try {
      const { persistAction } = await import("@/lib/data/supabase-source")
      let hadError = false
      while (outbox.peek()) {
        this.setSync({ status: "syncing", pending: outbox.size })
        const op = outbox.peek()!
        const res = await persistAction(getSupabase(), me, op.action)
        if (res.ok) {
          outbox.shift()
          continue
        }
        if (res.retry) {
          outbox.markAttempt()
          this.setSync({ status: "offline", pending: outbox.size })
          this.retryTimer = window.setTimeout(() => void this.flush(), backoffMs(op.attempts))
          return
        }
        // Permanent nekad (RLS/validering): släpp den och berätta. Ingen idé att försöka igen.
        outbox.shift()
        hadError = true
        toast.error("En ändring kunde inte sparas", {
          description: res.message,
          action: { label: "Ladda om", onClick: () => window.location.reload() },
        })
      }
      this.setSync({ status: hadError ? "error" : "synced", pending: 0 })
    } finally {
      this.flushing = false
    }
  }

  /** Rensar kö och lokal cache (utloggning / radering). */
  forget() {
    window.clearTimeout(this.retryTimer)
    this.outbox?.clear()
    if (this.me) clearCache(this.me.id)
  }
}

function SupabaseProvider({ children, role }: { children: React.ReactNode; role: UserRole }) {
  const router = useRouter()
  const [data, dispatch] = React.useReducer(reducer, null)
  const [me, setMe] = React.useState<Me | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [sync, setSync] = React.useState<SyncState>({ status: "synced", pending: 0 })
  const [engine] = React.useState(() => new SyncEngine(dispatch, setSync))

  React.useEffect(() => {
    engine.setData(data)
  }, [data, engine])

  // Laddning: server → (vid offline) cache. Köade ändringar spelas upp ovanpå.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const sb = getSupabase()
      const { loadRemote, OfflineError } = await import("@/lib/data/supabase-source")
      try {
        const loaded = await loadRemote(sb)
        if (cancelled) return
        if (loaded.me.role !== role) {
          router.replace(HOME_FOR_ROLE[loaded.me.role])
          return
        }
        engine.start(loaded.me)
        engine.apply({ type: "hydrate", data: replay(loaded.data, engine.outbox!.actions) })
        setMe(loaded.me)
        void engine.flush()
      } catch (e) {
        if (cancelled) return
        if (e instanceof OfflineError) {
          // Ingen kontakt: starta från senaste cache (sessionen finns lokalt i cookien).
          const { data: s } = await sb.auth.getSession()
          const cached = s.session ? readCache(s.session.user.id) : null
          if (cached) {
            engine.start(cached.me)
            engine.apply({ type: "hydrate", data: replay(cached.data, engine.outbox!.actions) })
            setMe(cached.me)
            setSync({ status: "offline", pending: engine.pending })
            return
          }
          setError("Ingen uppkoppling, och ingen sparad data att visa än.")
          return
        }
        if (e instanceof Error && e.message === "Inte inloggad") {
          router.replace(`/logga-in?next=${encodeURIComponent(window.location.pathname)}`)
          return
        }
        setError(e instanceof Error ? e.message : "Kunde inte ladda data")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [role, router, engine])

  // Cache för offlinestart (avstudsad). Rensas vid utloggning.
  React.useEffect(() => {
    if (!data || !me) return
    const t = window.setTimeout(() => writeCache(me, data), 1000)
    return () => window.clearTimeout(t)
  }, [data, me])

  // Synka när nätet kommer tillbaka eller fliken blir aktiv igen.
  React.useEffect(() => {
    const kick = () => void engine.flush()
    const onVisible = () => document.visibilityState === "visible" && kick()
    window.addEventListener("online", kick)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("online", kick)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [engine])

  // Realtid.
  React.useEffect(() => {
    if (!me) return
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    void import("@/lib/data/supabase-source").then(({ subscribeRealtime }) => {
      if (!cancelled) unsubscribe = subscribeRealtime(getSupabase(), me, engine.apply)
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [me, engine])

  const actions = React.useMemo(
    () =>
      me && createActions({ me, mode: "supabase", dispatch: engine.apply, getData: engine.getData, commit: engine.commit }),
    [me, engine]
  )

  const signOut = React.useCallback(async () => {
    const pending = engine.pending
    if (pending > 0 && !window.confirm(`${pending} ändringar är inte synkade än och försvinner om du loggar ut. Logga ut ändå?`)) {
      return
    }
    engine.forget()
    await getSupabase().auth.signOut()
    window.location.replace("/logga-in")
  }, [engine])

  const deleteAccount = React.useCallback(async () => {
    const { error: rpcError } = await getSupabase().rpc("delete_my_account")
    if (rpcError) {
      toast.error("Kontot kunde inte raderas", { description: rpcError.message })
      return
    }
    engine.forget()
    await getSupabase().auth.signOut()
    window.location.replace("/konto-raderat")
  }, [engine])

  const value = React.useMemo<Ctx | null>(
    () => (data && me && actions ? { data, me, mode: "supabase", actions, sync, signOut, deleteAccount } : null),
    [data, me, actions, sync, signOut, deleteAccount]
  )

  if (error) return <ErrorScreen message={error} />
  if (!value) return <LoadingScreen />
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

function readCache(uid: string): { me: Me; data: AppData } | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(uid))
    return raw ? (JSON.parse(raw) as { me: Me; data: AppData }) : null
  } catch {
    return null
  }
}
function writeCache(me: Me, data: AppData) {
  try {
    window.localStorage.setItem(cacheKey(me.id), JSON.stringify({ me, data }))
  } catch {}
}
function clearCache(uid: string) {
  try {
    window.localStorage.removeItem(cacheKey(uid))
  } catch {}
}

// ---------------------------------------------------------------- hooks ---

export function useAppData() {
  const ctx = React.useContext(DataContext)
  if (!ctx) throw new Error("useAppData måste användas inom <AppDataProvider>")
  return ctx
}

function LoadingScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center" aria-busy="true">
      <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <span className="sr-only">Laddar…</span>
    </div>
  )
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-medium">Något gick fel</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <button className="text-sm underline underline-offset-4" onClick={() => window.location.reload()}>
        Försök igen
      </button>
    </div>
  )
}
