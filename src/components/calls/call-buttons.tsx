"use client"

import { Phone, Video } from "lucide-react"

import { useCall } from "@/components/calls/call-provider"
import { Button } from "@/components/ui/button"

/** Ring-knappar för chatthuvudet: runda, tonade knappar med tydliga ikoner. */
export function CallButtons({ threadId, peerId, peerName, disabled }: { threadId: string; peerId: string; peerName: string; disabled?: boolean }) {
  const { start, state } = useCall()
  const busy = state.status !== "idle"
  const cls = "rounded-full bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary [&_svg]:size-[18px]"
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        className={cls}
        aria-label={`Röstsamtal med ${peerName}`}
        disabled={disabled || busy}
        onClick={() => start(threadId, { id: peerId, name: peerName }, "audio")}
      >
        <Phone strokeWidth={2.2} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cls}
        aria-label={`Videosamtal med ${peerName}`}
        disabled={disabled || busy}
        onClick={() => start(threadId, { id: peerId, name: peerName }, "video")}
      >
        <Video strokeWidth={2.2} />
      </Button>
    </div>
  )
}
