"use client"

import { Flashlight, Keyboard, Loader2, ScanLine } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { isValidBarcode } from "@/lib/food-search"

/**
 * Streckkodsscanner med mobilkameran.
 *
 * - Webbläsarens inbyggda BarcodeDetector när den finns (Chrome/Android, snabb och exakt).
 * - Annars zxing (ren JavaScript, fungerar i Safari/iPhone), laddas först när det behövs.
 * - Bara koder med giltig kontrollsiffra godtas, och med zxing måste samma kod läsas
 *   två gånger i rad – det tar bort i stort sett alla felläsningar.
 * - Går kameran inte att använda kan koden skrivas in för hand.
 */
export function BarcodeScanner({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (code: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skanna streckkod</DialogTitle>
          <DialogDescription>Rikta kameran mot streckkoden på förpackningen.</DialogDescription>
        </DialogHeader>
        {open && (
          <ScannerBody
            onDetected={(code) => {
              onOpenChange(false)
              onDetected(code)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type CameraState = "starting" | "scanning" | "denied" | "unavailable"

interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type NativeDetectorCtor = {
  new (opts: { formats: string[] }): NativeDetector
  getSupportedFormats(): Promise<string[]>
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"]

function ScannerBody({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [state, setState] = React.useState<CameraState>("starting")
  const [torch, setTorch] = React.useState<{ supported: boolean; on: boolean }>({ supported: false, on: false })
  const [manual, setManual] = React.useState("")
  const [manualError, setManualError] = React.useState<string | null>(null)
  const trackRef = React.useRef<MediaStreamTrack | null>(null)
  // Föräldern skickar en ny funktion vid varje rendering; kameran ska inte startas om för det.
  const onDetectedRef = React.useRef(onDetected)
  React.useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  React.useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    let stopZxing: (() => void) | undefined
    let last = { code: "", at: 0 }

    const found = (code: string, trusted: boolean) => {
      if (stopped || !isValidBarcode(code)) return
      const now = Date.now()
      // Inbyggd detektor: en träff räcker. zxing: två identiska träffar inom 1,5 s.
      if (trusted || (last.code === code && now - last.at < 1500)) {
        stopped = true
        navigator.vibrate?.(60)
        onDetectedRef.current(code)
        return
      }
      last = { code, at: now }
    }

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unavailable")
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (e) {
        setState(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unavailable")
        return
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop())
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})
      const track = stream.getVideoTracks()[0]
      trackRef.current = track
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
      setTorch({ supported: Boolean(caps.torch), on: false })
      setState("scanning")

      const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
      const supported = Native ? await Native.getSupportedFormats().catch(() => []) : []
      if (Native && FORMATS.some((f) => supported.includes(f))) {
        const detector = new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
        const tick = async () => {
          if (stopped) return
          try {
            if (video.readyState >= 2) {
              const [hit] = await detector.detect(video)
              if (hit) found(hit.rawValue, true)
            }
          } catch {}
          timer = window.setTimeout(tick, 150)
        }
        void tick()
        return
      }

      // Reserv: zxing (laddas bara här, ca 100 kB).
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ])
      if (stopped) return
      const hints = new Map<number, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
        [DecodeHintType.TRY_HARDER, true],
      ])
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result) found(result.getText(), false)
      })
      stopZxing = () => controls.stop()
      if (stopped) stopZxing()
    })()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stopZxing?.()
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }
  }, [])

  const toggleTorch = async () => {
    const track = trackRef.current
    if (!track) return
    const on = !torch.on
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      setTorch((t) => ({ ...t, on }))
    } catch {
      setTorch({ supported: false, on: false })
    }
  }

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    const code = manual.replace(/\D/g, "")
    if (!isValidBarcode(code)) {
      setManualError("Kontrollera siffrorna – streckkoden är inte giltig.")
      return
    }
    onDetected(code)
  }

  return (
    <div className="space-y-4">
      {state === "denied" || state === "unavailable" ? (
        <div className="rounded-xl bg-muted p-4 text-sm">
          {state === "denied"
            ? "Kameran är blockerad. Tillåt kameran för den här sidan i webbläsarens inställningar, eller skriv in koden nedan."
            : "Ingen kamera hittades. Skriv in siffrorna under streckkoden i stället."}
        </div>
      ) : (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" aria-label="Kamerabild" />
          {/* Sikte */}
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-1/3 w-4/5 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <ScanLine className="absolute top-1/2 left-1/2 size-full -translate-x-1/2 -translate-y-1/2 animate-pulse text-primary/70" strokeWidth={0.5} />
            </div>
          </div>
          {state === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
          {torch.supported && (
            <Button
              type="button"
              size="icon"
              variant={torch.on ? "default" : "secondary"}
              className="absolute right-3 bottom-3 rounded-full"
              aria-label={torch.on ? "Släck ficklampan" : "Tänd ficklampan"}
              aria-pressed={torch.on}
              onClick={toggleTorch}
            >
              <Flashlight />
            </Button>
          )}
        </div>
      )}

      <form onSubmit={submitManual} className="space-y-1.5">
        <label htmlFor="manual-barcode" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Keyboard className="size-3.5" /> Eller skriv in streckkoden
        </label>
        <div className="flex gap-2">
          <Input
            id="manual-barcode"
            inputMode="numeric"
            autoComplete="off"
            placeholder="T.ex. 7310865004703"
            value={manual}
            onChange={(e) => {
              setManual(e.target.value)
              setManualError(null)
            }}
            maxLength={14}
            aria-invalid={Boolean(manualError)}
          />
          <Button type="submit" variant="secondary" disabled={manual.replace(/\D/g, "").length < 8}>
            Sök
          </Button>
        </div>
        {manualError && <p className="text-xs text-destructive">{manualError}</p>}
      </form>
    </div>
  )
}
