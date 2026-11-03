"use client"

/**
 * Filer: profilbilder, chattbilagor och övningsvideor.
 *
 * En fil pekas ut med en "ref":
 *  - `storage:<bucket>/<sökväg>`: privat fil i Supabase Storage. Visas via en
 *    signerad länk som gäller en timme (useFileUrl).
 *  - `https://…`: publik fil (profilbilder) eller extern länk.
 *  - `data:` / `blob:`: demoläget. Blob-länkar gäller bara tills sidan laddas om.
 */
import * as React from "react"

import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import type { AttachmentKind } from "@/types/domain"

export type Bucket = "avatars" | "chat-attachments" | "exercise-videos"

export const MAX_BYTES: Record<Bucket, number> = {
  avatars: 5 * 1024 * 1024,
  "chat-attachments": 50 * 1024 * 1024,
  "exercise-videos": 200 * 1024 * 1024,
}

export const ACCEPT: Record<Bucket, string> = {
  avatars: "image/jpeg,image/png,image/webp",
  "chat-attachments": "image/*,video/mp4,video/quicktime,video/webm,application/pdf",
  "exercise-videos": "video/mp4,video/quicktime,video/webm",
}

export function attachmentKind(mime: string): AttachmentKind {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("video/")) return "video"
  if (mime === "application/pdf") return "pdf"
  return "file"
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`
}

export class UploadError extends Error {}

/** Säkert filnamn för en lagringssökväg (behåller filändelsen). */
export function safeName(name: string) {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase().replace(/[^.a-z0-9]/g, "") : ""
  const base = name
    .slice(0, name.length - ext.length)
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${base || "fil"}${ext}`
}

/** Bilder som granskas av bildfiltret (v29): profilbilder och bilder i chatten. */
const moderated = (bucket: Bucket, file: File) => bucket === "avatars" || (bucket === "chat-attachments" && file.type.startsWith("image/"))

/** Laddar upp och returnerar en ref att spara i databasen. */
export async function uploadFile(bucket: Bucket, path: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES[bucket]) {
    throw new UploadError(`Filen är för stor (max ${formatBytes(MAX_BYTES[bucket])}).`)
  }
  if (moderated(bucket, file)) return uploadImage(bucket as "avatars" | "chat-attachments", path, file)
  if (!isSupabaseEnabled) {
    // Demoläge: profilbilder som liten data-URL (överlever omladdning), övrigt som blob-URL.
    return bucket === "avatars" ? resizeImage(file, 256) : URL.createObjectURL(file)
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new UploadError("Filer kan bara skickas när du är online.")
  }
  const body = bucket === "avatars" ? await dataUrlToBlob(await resizeImage(file, 512)) : file
  const sb = getSupabase()
  const { error } = await sb.storage.from(bucket).upload(path, body, { contentType: body.type || file.type, upsert: bucket === "avatars" })
  if (error) {
    // RLS: man får bara skriva i sin egen mapp ({uid}/…), se migration v14.
    throw new UploadError(
      /row-level security|unauthorized|403/i.test(error.message)
        ? "Bilden kunde inte sparas: du har bara behörighet till din egen profilbild. Logga in igen och försök på nytt."
        : error.message
    )
  }
  if (bucket === "avatars") {
    // Cache-buster så att en ny bild syns direkt trots samma sökväg.
    return `${sb.storage.from(bucket).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
  }
  return `storage:${bucket}/${path}`
}

/**
 * Bilder går via servern (/api/uploads/image): bildfiltret granskar dem innan
 * de sparas, och servern skalar om och tar bort EXIF-data. Storage tillåter
 * inte längre direkta bilduppladdningar till de här bucketarna (v29).
 * Bilden skalas ner här först så att den ryms i en request (max 4 MB).
 */
async function uploadImage(bucket: "avatars" | "chat-attachments", path: string, file: File): Promise<string> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new UploadError("Bilder kan bara skickas när du är online.")
  const small = bucket === "avatars" ? await dataUrlToBlob(await resizeImage(file, 512)) : await scaleImage(file, 2048)
  const form = new FormData()
  form.set("file", small, "bild")
  form.set("bucket", bucket)
  if (bucket === "chat-attachments" && isSupabaseEnabled) form.set("path", path)
  let res: Response
  try {
    res = await fetch("/api/uploads/image", { method: "POST", body: form })
  } catch {
    throw new UploadError("Bilden kunde inte skickas. Kontrollera uppkopplingen.")
  }
  const body = (await res.json().catch(() => ({}))) as { ref?: string; error?: string }
  if (!res.ok) throw new UploadError(body.error ?? "Bilden kunde inte laddas upp.")
  if (body.ref) return body.ref
  // Demoläget: servern har bara granskat bilden – den sparas lokalt.
  return bucket === "avatars" ? resizeImage(file, 256) : URL.createObjectURL(small)
}

/** Skalar ner en bild till högst `max` px på längsta sidan (behåller proportionerna). */
function scaleImage(file: File, max: number): Promise<Blob> {
  return new Promise((resolveImg, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const f = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(img.width * f)
      canvas.height = Math.round(img.height * f)
      const ctx = canvas.getContext("2d")
      URL.revokeObjectURL(url)
      if (!ctx) return reject(new UploadError("Bilden kunde inte läsas."))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => (b ? resolveImg(b) : reject(new UploadError("Bilden kunde inte läsas."))), "image/jpeg", 0.88)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new UploadError("Filen är ingen bild som går att läsa."))
    }
    img.src = url
  })
}

// --------------------------------------------------- visning (signerad URL) ---

const signed = new Map<string, { url: string; expires: number }>()

async function resolve(ref: string): Promise<string> {
  if (!ref.startsWith("storage:")) return ref
  const hit = signed.get(ref)
  if (hit && hit.expires > Date.now() + 60_000) return hit.url
  const rest = ref.slice("storage:".length)
  const bucket = rest.slice(0, rest.indexOf("/"))
  const path = rest.slice(bucket.length + 1)
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data) throw new Error(error?.message ?? "Kunde inte hämta filen")
  signed.set(ref, { url: data.signedUrl, expires: Date.now() + 3600_000 })
  return data.signedUrl
}

/** URL att visa för en ref (null medan den hämtas, "error" om den inte finns). */
export function useFileUrl(ref: string | undefined): string | null | "error" {
  const direct = ref && !ref.startsWith("storage:") ? ref : null
  const [state, setState] = React.useState<{ ref?: string; url: string | null | "error" }>({ url: null })
  React.useEffect(() => {
    if (!ref || direct) return
    let cancelled = false
    resolve(ref)
      .then((url) => !cancelled && setState({ ref, url }))
      .catch(() => !cancelled && setState({ ref, url: "error" }))
    return () => {
      cancelled = true
    }
  }, [ref, direct])
  if (direct) return direct
  return state.ref === ref ? state.url : null
}

// ------------------------------------------------------------- bilder ---

/** Skalar ner en bild till max `size` px (kvadratisk beskärning) som WebP/JPEG-data-URL. */
export function resizeImage(file: File, size: number): Promise<string> {
  return new Promise((resolveImg, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = Math.min(size, side)
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new UploadError("Bilden kunde inte läsas."))
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const webp = canvas.toDataURL("image/webp", 0.85)
      resolveImg(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new UploadError("Filen är ingen bild som går att läsa."))
    }
    img.src = url
  })
}

async function dataUrlToBlob(dataUrl: string) {
  return (await fetch(dataUrl)).blob()
}
