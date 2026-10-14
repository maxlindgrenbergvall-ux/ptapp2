/** Tolkar en videolänk så att den kan bäddas in. */
export type VideoSource =
  | { type: "youtube"; id: string; embedUrl: string }
  | { type: "vimeo"; id: string; embedUrl: string }
  | { type: "file"; url: string }

export function parseVideo(input: string | undefined): VideoSource | null {
  if (!input) return null
  const ref = input.trim()
  if (ref.startsWith("storage:") || ref.startsWith("blob:") || ref.startsWith("data:video/")) return { type: "file", url: ref }

  let url: URL
  try {
    url = new URL(ref)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const host = url.hostname.replace(/^www\.|^m\./, "")

  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/)?.[1]
    if (id && /^[\w-]{6,20}$/.test(id)) {
      // youtube-nocookie: ingen spårningscookie förrän videon spelas.
      return { type: "youtube", id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` }
    }
    return null
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d{6,12})/)?.[1]
    return id ? { type: "vimeo", id, embedUrl: `https://player.vimeo.com/video/${id}?dnt=1` } : null
  }
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) return { type: "file", url: ref }
  return null
}
