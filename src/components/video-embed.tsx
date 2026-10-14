"use client"

import { ExternalLink, VideoOff } from "lucide-react"

import { useFileUrl } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { parseVideo } from "@/lib/video"

/** Visar en instruktionsvideo: YouTube/Vimeo som inbäddning, egen fil som <video>. */
export function VideoEmbed({ source, title, className }: { source: string; title: string; className?: string }) {
  const video = parseVideo(source)
  const fileRef = video?.type === "file" ? video.url : undefined
  const fileUrl = useFileUrl(fileRef)

  const frame = cn("aspect-video w-full overflow-hidden rounded-xl bg-black", className)

  if (!video) {
    return (
      <a href={source} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
        <ExternalLink className="size-4" /> Öppna video
      </a>
    )
  }
  if (video.type === "file") {
    if (fileUrl === "error") return <Unavailable className={frame} />
    if (!fileUrl) return <div className={cn(frame, "animate-pulse bg-muted")} />
    return (
      <video
        src={fileUrl}
        controls
        playsInline
        preload="metadata"
        className={frame}
        aria-label={title}
        onError={(e) => ((e.currentTarget as HTMLVideoElement).style.display = "none")}
      />
    )
  }
  return (
    <iframe
      src={video.embedUrl}
      title={title}
      loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      className={frame}
    />
  )
}

function Unavailable({ className }: { className: string }) {
  return (
    <div className={cn(className, "flex flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground")}>
      <VideoOff className="size-5" />
      Videon är inte tillgänglig
    </div>
  )
}
