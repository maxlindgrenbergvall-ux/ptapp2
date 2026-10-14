"use client"

import { Download, FileText, ImageOff, Paperclip } from "lucide-react"

import { formatBytes, useFileUrl } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type { Attachment } from "@/types/domain"

/** Visar en bilaga i en chattbubbla: bild, video eller fil (PDF m.m.) som kort. */
export function AttachmentView({ attachment: a, mine }: { attachment: Attachment; mine: boolean }) {
  const url = useFileUrl(a.ref)
  const broken = url === "error"

  if (a.kind === "image" && !broken) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- signerade/blob-URL:er, inte optimerbara bilder */}
        <img
          src={url}
          alt={a.name}
          className="max-h-64 w-full object-cover"
          onError={(e) => ((e.currentTarget as HTMLImageElement).replaceWith(brokenNode(a.name)))}
        />
      </a>
    ) : (
      <div className="h-40 w-56 animate-pulse rounded-xl bg-black/10" />
    )
  }

  if (a.kind === "video" && !broken) {
    return url ? (
      <video src={url} controls playsInline preload="metadata" className="max-h-72 w-full rounded-xl bg-black" aria-label={a.name} />
    ) : (
      <div className="aspect-video w-56 animate-pulse rounded-xl bg-black/10" />
    )
  }

  const Icon = broken ? ImageOff : a.kind === "pdf" ? FileText : Paperclip
  return (
    <a
      href={url && !broken ? url : undefined}
      target="_blank"
      rel="noreferrer noopener"
      download={a.kind === "file" ? a.name : undefined}
      aria-disabled={!url || broken}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2 text-left",
        mine ? "bg-black/10" : "bg-background/70",
        (!url || broken) && "pointer-events-none opacity-70"
      )}
    >
      <Icon className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{a.name}</span>
        <span className="block text-xs opacity-70">{broken ? "Filen är inte tillgänglig" : `${a.kind === "pdf" ? "PDF" : "Fil"} · ${formatBytes(a.size)}`}</span>
      </span>
      {!broken && <Download className="size-4 shrink-0 opacity-70" />}
    </a>
  )
}

function brokenNode(name: string) {
  const el = document.createElement("div")
  el.className = "flex h-24 items-center justify-center rounded-xl bg-black/10 px-3 text-xs"
  el.textContent = `${name} – bilden är inte tillgänglig`
  return el
}
