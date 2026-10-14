"use client"

import { Phone, Video } from "lucide-react"

import { useCall } from "@/components/calls/call-provider"
import { Button } from "@/components/ui/button"

/** Ring-knappar för chatthuvudet. */
export function CallButtons({ threadId, peerId, peerName, disabled }: { threadId: string; peerId: string; peerName: string; disabled?: boolean }) {
  const { start, state } = useCall()
  const busy = state.status !== "idle"
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Röstsamtal med ${peerName}`}
        disabled={disabled || busy}
        onClick={() => start(threadId, { id: peerId, name: peerName }, "audio")}
      >
        <Phone />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Videosamtal med ${peerName}`}
        disabled={disabled || busy}
        onClick={() => start(threadId, { id: peerId, name: peerName }, "video")}
      >
        <Video />
      </Button>
    </div>
  )
}
