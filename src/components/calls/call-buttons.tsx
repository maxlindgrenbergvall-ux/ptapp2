"use client"

import { Lock, Phone, Video } from "lucide-react"
import { toast } from "sonner"

import { useCall } from "@/components/calls/call-provider"
import { Button } from "@/components/ui/button"
import { callLockedMessage, hasCallAccess } from "@/lib/calls/access"
import { parseCallThread } from "@/lib/calls/thread"
import { useAppData } from "@/lib/data/store"

/**
 * Ring-knappar för chatthuvudet: runda, tonade knappar med tydliga ikoner.
 * Samtal kräver köp eller bokat pass mellan klienten och PT:n – annars visas
 * ett lås som förklarar hur samtal låses upp.
 */
export function CallButtons({ threadId, peerId, peerName, disabled }: { threadId: string; peerId: string; peerName: string; disabled?: boolean }) {
  const { data, me } = useAppData()
  const { start, state } = useCall()
  const busy = state.status !== "idle"
  const { clientId, trainerId } = parseCallThread(threadId)
  const cls = "rounded-full bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary [&_svg]:size-[18px]"

  if (!hasCallAccess(data, clientId, trainerId)) {
    const message = callLockedMessage(me.role === "trainer" ? "trainer" : "client", peerName)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 rounded-full text-muted-foreground"
        aria-label={`Samtal låst. ${message}`}
        title={message}
        data-testid="call-locked"
        onClick={() => toast(message)}
      >
        <Lock className="size-3.5" /> <Phone className="size-4" />
      </Button>
    )
  }

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
