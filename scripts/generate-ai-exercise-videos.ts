/**
 * AI-videoguider för övningsbanken (v60) – EN och samma AI-modell för alla övningar.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/generate-ai-exercise-videos.ts            # torrkörning (gratis)
 *   npx tsx --tsconfig tsconfig.json scripts/generate-ai-exercise-videos.ts --yes      # generera (kostar per video)
 *     --only e-squat,e-sledpush   bara dessa övningar
 *     --limit 10                  högst 10 videor den här körningen
 *     --force                     gör om även övningar som redan har video
 *
 * Miljövariabler (bara på din dator eller i en serverjobbmiljö – aldrig NEXT_PUBLIC_):
 *   SUPABASE_URL (eller NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 *   FAL_KEY                       API-nyckel för fal.ai
 *   GUIDE_REFERENCE_IMAGE_URL     LÅST referensbild på Coaviras AI-modell (samma i varje video)
 *   FAL_MODEL                     standard: fal-ai/kling-video/v2.1/standard/image-to-video
 *   FAL_API_BASE                  standard: https://queue.fal.run (tester: en lokal mock)
 *
 * Flöde per övning: prompt (låst karaktär + rörelsen) → fal.ai (bild-till-video
 * med referensbilden och ett låst seed) → MP4 laddas ned → Storage-bucketen
 * exercise-guides/<id>.mp4 → exercises.video_url. Appen visar videon som en
 * tyst loop (autoPlay loop muted playsInline) i Videoguide / Utförande; tills
 * dess visar den sin inbyggda animation med samma modell.
 *
 * Ingen automatisk kö: scriptet körs bara för hand, och utan --yes görs inga
 * betalda anrop.
 */
import library from "@/lib/exercise-library.json"
import en from "@/lib/i18n/dictionaries/en"
import { GUIDES } from "@/lib/exercise-guides/guides"

/** Den låsta karaktären – samma text i varje video (tillsammans med referensbilden och seedet). */
export const CHARACTER_PROMPT =
  "The same athletic fitness model in every clip (match the reference image exactly: face, hair, build, outfit): " +
  "a fit adult in a fitted charcoal training top and black shorts with lime green (#84cc16) accents on the shoes and headband. " +
  "Minimal dark studio (#131916) with a soft floor reflection and a thin lime green floor line, soft key light from the front-left. " +
  "Full body in frame, side view, locked-off camera, no cuts, no text, no logos, no music. " +
  "Smooth, controlled, technically perfect repetition that loops seamlessly (the last frame matches the first)."
export const NEGATIVE_PROMPT = "different person, extra limbs, distorted hands, text, watermark, logo, gym crowd, mirrors, camera shake, cuts, blur"
/** Låst seed – samma "slump" för alla övningar. */
export const LOCKED_SEED = 618_203

type BankExercise = { id: string; name: string; equipment: string; custom?: unknown }

/** Övningens rörelse i prompten (engelska utförandesteg ur appens språkfil). */
export function promptFor(exercise: BankExercise): string {
  const guide = GUIDES[exercise.id]
  if (!guide) throw new Error(`Ingen guide för ${exercise.id}`)
  const steps = (en.guide.steps as Record<string, { start: string; move: string; control: string }>)[guide.steps]
  return `${CHARACTER_PROMPT} Exercise: ${exercise.name}. Start: ${steps.start} Movement: ${steps.move} ${steps.control} One full repetition, 5 seconds.`
}

export interface Options {
  yes: boolean
  only: string[] | null
  limit: number
  force: boolean
}

export function parseArgs(argv: string[]): Options {
  const value = (name: string) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  return {
    yes: argv.includes("--yes"),
    only: value("--only") ? value("--only")!.split(",").map((s) => s.trim()).filter(Boolean) : null,
    limit: Math.max(1, Number(value("--limit") ?? 1000) || 1000),
    force: argv.includes("--force"),
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

interface Env {
  supabaseUrl: string
  serviceKey: string
  falKey: string
  falBase: string
  model: string
  referenceImage: string
}

function env(): Env {
  const need = (k: string, v: string | undefined) => {
    if (!v) throw new Error(`Saknar ${k}`)
    return v
  }
  return {
    supabaseUrl: need("SUPABASE_URL", process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, ""),
    serviceKey: need("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    falKey: need("FAL_KEY", process.env.FAL_KEY),
    falBase: (process.env.FAL_API_BASE ?? "https://queue.fal.run").replace(/\/$/, ""),
    model: process.env.FAL_MODEL ?? "fal-ai/kling-video/v2.1/standard/image-to-video",
    referenceImage: need("GUIDE_REFERENCE_IMAGE_URL", process.env.GUIDE_REFERENCE_IMAGE_URL),
  }
}

/** En video från fal.ai (köad begäran → vänta → hämta resultatet). */
async function generate(e: Env, prompt: string): Promise<string> {
  const headers = { Authorization: `Key ${e.falKey}`, "Content-Type": "application/json" }
  const queued = await json<{ request_id: string; status_url: string; response_url: string }>(
    await fetch(`${e.falBase}/${e.model}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt, negative_prompt: NEGATIVE_PROMPT, image_url: e.referenceImage, seed: LOCKED_SEED, duration: "5", aspect_ratio: "16:9", cfg_scale: 0.6 }),
    }),
    "fal.ai (kö)"
  )
  for (let i = 0; i < 180; i++) {
    const s = await json<{ status: string }>(await fetch(queued.status_url, { headers }), "fal.ai (status)")
    if (s.status === "COMPLETED") break
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error(`fal.ai: ${s.status}`)
    await sleep(Number(process.env.FAL_POLL_MS ?? 5000))
  }
  const result = await json<{ video?: { url?: string } }>(await fetch(queued.response_url, { headers }), "fal.ai (resultat)")
  if (!result.video?.url) throw new Error("fal.ai: ingen video i svaret")
  return result.video.url
}

/** Ladda upp MP4 till exercise-guides/<id>.mp4 och koppla den till övningen. */
async function store(e: Env, id: string, videoUrl: string): Promise<string> {
  const video = await fetch(videoUrl)
  if (!video.ok) throw new Error(`Nedladdning: HTTP ${video.status}`)
  const body = new Uint8Array(await video.arrayBuffer())
  const auth = { apikey: e.serviceKey, Authorization: `Bearer ${e.serviceKey}` }
  const up = await fetch(`${e.supabaseUrl}/storage/v1/object/exercise-guides/${id}.mp4`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "video/mp4", "x-upsert": "true", "cache-control": "31536000" },
    body,
  })
  if (!up.ok) throw new Error(`Storage: HTTP ${up.status} ${(await up.text()).slice(0, 200)}`)
  const publicUrl = `${e.supabaseUrl}/storage/v1/object/public/exercise-guides/${id}.mp4`
  const patch = await fetch(`${e.supabaseUrl}/rest/v1/exercises?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ video_url: publicUrl }),
  })
  if (!patch.ok) throw new Error(`exercises.video_url: HTTP ${patch.status} ${(await patch.text()).slice(0, 200)}`)
  return publicUrl
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv)
  // Bara förinlagda övningar (egna övningar får aldrig en guide).
  const bank = (library as BankExercise[]).filter((x) => !x.custom && GUIDES[x.id])
  let todo = bank.filter((x) => !opts.only || opts.only.includes(x.id))
  if (!opts.yes) {
    console.log(`Torrkörning: ${todo.length} övningar skulle få en AI-video (inga anrop görs). Kör med --yes för att generera.`)
    for (const x of todo.slice(0, 3)) console.log(`\n[${x.id}] ${promptFor(x)}`)
    return { generated: [], skipped: todo.map((x) => x.id), failed: [] }
  }
  const e = env()
  const existing = await json<{ id: string; video_url: string | null }[]>(
    await fetch(`${e.supabaseUrl}/rest/v1/exercises?select=id,video_url&owner_id=is.null`, { headers: { apikey: e.serviceKey, Authorization: `Bearer ${e.serviceKey}` } }),
    "exercises"
  )
  const done = new Set(existing.filter((r) => r.video_url).map((r) => r.id))
  const skipped = todo.filter((x) => !opts.force && done.has(x.id)).map((x) => x.id)
  todo = todo.filter((x) => opts.force || !done.has(x.id)).slice(0, opts.limit)
  const generated: string[] = []
  const failed: { id: string; error: string }[] = []
  for (const x of todo) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = await store(e, x.id, await generate(e, promptFor(x)))
        generated.push(x.id)
        console.log(`✓ ${x.id} → ${url}`)
        break
      } catch (err) {
        if (attempt === 2) {
          failed.push({ id: x.id, error: err instanceof Error ? err.message : String(err) })
          console.log(`✗ ${x.id}: ${failed.at(-1)!.error}`)
        }
      }
    }
  }
  console.log(`\nKlart: ${generated.length} nya, ${skipped.length} hade redan video, ${failed.length} misslyckades.`)
  if (failed.length) process.exitCode = 1
  return { generated, skipped, failed }
}

// Körs direkt (inte när testerna importerar funktionerna).
if (process.argv[1]?.endsWith("generate-ai-exercise-videos.ts")) void main()
