/**
 * Samtalstråd = ett PT–klient-par. Kanalen i Supabase Realtime heter
 * "call:{klient}:{pt}" (RLS: bara de två parterna, se migration v12).
 */
export const callThread = (clientId: string, trainerId: string) => `${clientId}:${trainerId}`

export function parseCallThread(threadId: string): { clientId: string; trainerId?: string } {
  const [clientId, trainerId] = threadId.split(":")
  return { clientId, trainerId }
}

export type CallLog = { kind: "video" | "audio"; missed: boolean; minutes?: number }

/** Samtalsloggen sparas som text i chatten ("📵 Missat videosamtal", "📞 Röstsamtal · 4 min"). */
export function parseCallLog(body: string): CallLog | null {
  const missed = body.match(/^📵 Missat (video|röst)samtal$/)
  if (missed) return { kind: missed[1] === "video" ? "video" : "audio", missed: true }
  const done = body.match(/^📞 (Video|Röst)samtal · (\d+) min$/)
  if (done) return { kind: done[1] === "Video" ? "video" : "audio", missed: false, minutes: Number(done[2]) }
  return null
}
