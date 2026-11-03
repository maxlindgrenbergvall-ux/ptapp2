import { NextResponse, type NextRequest } from "next/server"
import sharp from "sharp"

import { classifyImage, IMAGE_FORMATS } from "@/lib/moderation/classify"
import { BLOCKED_MESSAGE, decide, type ModerationDecision, type ModerationScores } from "@/lib/moderation/policy"
import { clientIp, rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { imageUploadFields } from "@/lib/validation"

// Modellen körs på CPU; första anropet laddar den (~1 s).
export const maxDuration = 30

/** Under Vercels gräns för request-body (4,5 MB). Klienten skalar ner bilder innan de skickas. */
const MAX_BYTES = 4 * 1024 * 1024

/**
 * Bilduppladdning med innehållsfilter (v29): profilbilder och bilder i chatten.
 *
 *  1. Inloggning (Supabase) och rate limiting (30 bilder / 10 min).
 *  2. Format kontrolleras genom att läsa bilden (inte filändelsen).
 *  3. Bildfiltret (nsfwjs på servern) klassar bilden: tydligt sexuellt
 *     innehåll stoppas (422), gränsfall sparas men loggas i moderation_events.
 *  4. Bilden skalas om och kodas om till WebP – EXIF-data (t.ex. GPS-position)
 *     följer inte med – och sparas med service role i användarens mapp.
 *
 * Storage tillåter inte längre att webbläsaren laddar upp bilder direkt till
 * avatars eller chat-attachments (v29), så filtret går inte att kringgå.
 * I demoläget (utan Supabase) granskas bilden men sparas inte här.
 *
 * multipart/form-data: file, bucket ("avatars" | "chat-attachments"), path (chatt).
 * Svar: { ref } · 400/413/415 ogiltig fil · 401 · 403 · 422 stoppad · 429 · 503.
 */
export async function POST(request: NextRequest) {
  let userId: string | null = null
  const supabase = isSupabaseEnabled ? await createSupabaseServerClient() : null
  if (supabase) {
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: "Logga in för att ladda upp bilder." }, { status: 401 })
    userId = data.user.id
  }
  if (await rateLimited(`image-upload:${userId ?? `ip:${clientIp(request)}`}`, 30, 600)) return tooManyRequests(600)

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const fields = imageUploadFields.safeParse({ bucket: form?.get("bucket"), path: form?.get("path") ?? undefined })
  if (!(file instanceof File) || !fields.success) return NextResponse.json({ error: "Ogiltig uppladdning." }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Bilden är för stor (max 4 MB)." }, { status: 413 })

  const input = Buffer.from(await file.arrayBuffer())
  const meta = await sharp(input).metadata().catch(() => null)
  if (!meta?.format || !IMAGE_FORMATS.has(meta.format)) {
    return NextResponse.json({ error: "Filen är ingen bild som stöds. Välj JPEG, PNG eller WebP." }, { status: 415 })
  }

  // Behörighet: chattbilder bara i en tråd användaren är part i (samma regel som Storage, v2).
  const target = fields.data
  if (supabase && target.bucket === "chat-attachments") {
    if (!target.path) return NextResponse.json({ error: "Ogiltig uppladdning." }, { status: 400 })
    const thread = target.path.split("/")[0]
    const { data: allowed } = await supabase.rpc("can_access_client", { p_client: thread })
    if (!allowed) return NextResponse.json({ error: "Du kan inte skicka bilder i den här chatten." }, { status: 403 })
  }

  let scores: ModerationScores
  try {
    scores = await classifyImage(input)
  } catch (e) {
    console.error("moderation: classify failed", { message: (e as Error).message })
    // Hellre stoppa än släppa igenom ogranskat.
    return NextResponse.json({ error: "Bilden kunde inte granskas just nu. Försök igen om en stund." }, { status: 503 })
  }
  const decision = (await testOverride(input)) ?? decide(scores)

  if (decision.action === "block") {
    await logEvent(userId, target.bucket, null, decision, scores)
    return NextResponse.json({ error: BLOCKED_MESSAGE, reason: "moderation" }, { status: 422 })
  }

  // Demoläget: bara granskning – webbläsaren behåller bilden lokalt.
  if (!supabase || !userId) return NextResponse.json({ ok: true, flagged: decision.action === "flag" })
  if (!hasServiceRole()) return NextResponse.json({ error: "Bilduppladdning är inte konfigurerad (service role saknas)." }, { status: 503 })

  const output =
    target.bucket === "avatars"
      ? await sharp(input).rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 85 }).toBuffer()
      : await sharp(input, { animated: false }).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
  const path = target.bucket === "avatars" ? `${userId}/avatar.webp` : target.path!.replace(/\.[^./]*$/, "") + ".webp"

  const admin = createSupabaseAdmin()
  const { error } = await admin.storage.from(target.bucket).upload(path, output, { contentType: "image/webp", upsert: target.bucket === "avatars" })
  if (error) {
    console.error("image upload", { bucket: target.bucket, message: error.message })
    return NextResponse.json({ error: "Bilden kunde inte sparas. Försök igen." }, { status: 502 })
  }
  if (decision.action === "flag") await logEvent(userId, target.bucket, path, decision, scores)

  const ref =
    target.bucket === "avatars"
      ? `${admin.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
      : `storage:chat-attachments/${path}`
  return NextResponse.json({ ref, flagged: decision.action === "flag" })
}

/** Stoppade och flaggade bilder loggas för granskning (bara servern kan läsa tabellen). */
async function logEvent(userId: string | null, bucket: string, path: string | null, decision: ModerationDecision, scores: ModerationScores) {
  console.warn("moderation", { userId, bucket, action: decision.action, reason: "reason" in decision ? decision.reason : undefined })
  if (!userId || !hasServiceRole()) return
  const round = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))
  const { error } = await createSupabaseAdmin()
    .from("moderation_events")
    // Databasen (v29) lagrar händelsen i dåtid: "blocked" | "flagged".
    .insert({ user_id: userId, bucket, path, action: decision.action === "block" ? "blocked" : "flagged", reason: "reason" in decision ? decision.reason : null, scores: round })
  if (error) console.error("moderation: log failed", { message: error.message })
}

/**
 * Bara för e2e-testerna: MODERATION_TEST_BLOCK_COLOR (t.ex. "ff00ff") gör att
 * en enfärgad testbild i den färgen behandlas som olämplig, så att hela flödet
 * kan testas utan riktigt olämpligt material. Färgen överlever webbläsarens
 * omskalning. Ignoreras i Vercels produktion.
 */
async function testOverride(input: Buffer): Promise<ModerationDecision | null> {
  const hex = process.env.VERCEL_ENV === "production" ? undefined : process.env.MODERATION_TEST_BLOCK_COLOR
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null
  const target = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const { channels } = await sharp(input).removeAlpha().stats()
  const solid = channels.slice(0, 3).every((c, i) => Math.abs(c.mean - target[i]) < 12 && c.stdev < 12)
  return solid ? { action: "block", reason: "test" } : null
}
