/**
 * Offlinekö för skrivningar.
 *
 * Alla ändringar läggs först här (localStorage) och skickas sedan i ordning.
 * Tappas nätet mitt i ett pass ligger avbockade set kvar i kön och skickas när
 * uppkopplingen är tillbaka – även om appen hunnit laddas om. Operationerna är
 * idempotenta (upsert på naturliga nycklar, klientgenererade id:n), så ett
 * omskick efter en timeout ger aldrig dubbletter.
 */
import type { PersistableAction } from "@/lib/data/state"

export interface QueuedOp {
  id: string
  action: PersistableAction
  queuedAt: string
  attempts: number
}

export class Outbox {
  private ops: QueuedOp[]

  constructor(private readonly storageKey: string) {
    this.ops = read(storageKey)
  }

  get size() {
    return this.ops.length
  }

  get actions(): PersistableAction[] {
    return this.ops.map((o) => o.action)
  }

  peek(): QueuedOp | undefined {
    return this.ops[0]
  }

  push(action: PersistableAction) {
    this.ops.push({ id: crypto.randomUUID(), action, queuedAt: new Date().toISOString(), attempts: 0 })
    this.save()
  }

  /** Tar bort första operationen (skickad, eller permanent avvisad). */
  shift() {
    this.ops.shift()
    this.save()
  }

  markAttempt() {
    if (this.ops[0]) {
      this.ops[0].attempts++
      this.save()
    }
  }

  clear() {
    this.ops = []
    try {
      window.localStorage.removeItem(this.storageKey)
    } catch {}
  }

  private save() {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.ops))
    } catch {
      // Full eller blockerad lagring: kön lever vidare i minnet för den här sessionen.
    }
  }
}

function read(key: string): QueuedOp[] {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as QueuedOp[]) : []
  } catch {
    return []
  }
}

/** Utfall av ett försök att skicka en operation. */
export type PersistResult =
  | { ok: true }
  /** Nätverk/server tillfälligt nere – försök igen senare, behåll ordningen. */
  | { ok: false; retry: true; message: string }
  /** Avvisad av databasen (RLS, validering) – kommer aldrig att lyckas. */
  | { ok: false; retry: false; message: string }

/** Väntetid före nästa försök: 2, 4, 8 … max 60 s. */
export function backoffMs(attempts: number) {
  return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempts - 1))
}
