/**
 * Automatisk prospektering (v50) – typer som delas av servern och gränssnittet.
 */

export interface ProspectConfig {
  /** Så här många godkända leads letar jobbet efter. */
  target: number
  /** Lägsta Lead Score för att en lead ska sparas. */
  minScore: number
  /** Hashtaggar att leta i (utan #). */
  hashtags: string[]
  /** Kända bra PT-konton att börja från (deras liknande konton söks också). */
  seeds: string[]
  /** Tom = hela Sverige. Annars bara leads i de här orterna. */
  cities: string[]
  /** Högst så här många profiler hämtas från Apify (kostnadstak). */
  maxProfiles: number
}

export const DEFAULT_HASHTAGS = [
  "personligtränare",
  "personligtranare",
  "ptstockholm",
  "ptgöteborg",
  "ptmalmö",
  "ptuppsala",
  "onlinecoach",
  "onlinept",
  "kostcoach",
  "träningscoach",
  "styrketräning",
  "ptlivet",
]

export const DEFAULT_CONFIG: ProspectConfig = { target: 15, minScore: 50, hashtags: DEFAULT_HASHTAGS, seeds: [], cities: [], maxProfiles: 300 }

export interface ProspectFound {
  leadId: string
  name: string
  handle: string
  email: string
  score: number
  city: string | null
}

export interface ProspectState {
  hashtagQueue: string[]
  profileQueue: string[]
  /** Konton som redan köats eller kontrollerats (inklusive de som redan finns i CRM:et). */
  seen: string[]
  run: { id: string; kind: "hashtag" | "profiles"; label: string } | null
  /** Profiler som klarat första sållningen och väntar på e-postkontroll. */
  pending: PendingCandidate[]
  found: ProspectFound[]
  stats: { runs: number; profilesFetched: number; checked: number; rejected: Record<string, number> }
  log: { at: string; text: string }[]
}

export interface PendingCandidate {
  handle: string
  name: string
  email: string | null
  phone: string | null
  websiteUrl: string | null
  city: string | null
  gym: string | null
  title: string | null
  segment: "freelance" | "influencer" | "gym_chain"
  specialties: string[]
  followers: number | null
}

export type ProspectStatus = "running" | "done" | "exhausted" | "stopped" | "failed"
export const PROSPECT_STATUS_LABEL: Record<ProspectStatus, string> = {
  running: "Pågår",
  done: "Klart – målet nått",
  exhausted: "Klart – inga fler konton att söka",
  stopped: "Stoppat",
  failed: "Misslyckades",
}

export interface ProspectJob {
  id: string
  createdAt: string
  updatedAt: string
  status: ProspectStatus
  config: ProspectConfig
  state: ProspectState
  error: string | null
}
