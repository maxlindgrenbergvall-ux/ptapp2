"use client"

import { AlertTriangle } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export interface ConfirmOptions {
  title: string
  description?: string
  /** Text på bekräftelseknappen (standard "Fortsätt"). */
  confirmLabel?: string
  cancelLabel?: string
  /** Röd knapp för det som tar bort något. */
  destructive?: boolean
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void }

let show: ((req: Request) => void) | null = null

/**
 * Appens egen bekräftelse i stället för window.confirm – i iPhone-appen visar
 * window.confirm en ruta från webbläsaren med appens adress som rubrik.
 *   if (!(await confirmDialog({ title: "Ta bort passet?", destructive: true }))) return
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ ...options, resolve })
    // Utan <ConfirmHost> (ska inte hända): webbläsarens ruta som reserv.
    else resolve(typeof window !== "undefined" && window.confirm(options.title))
  })
}

/** Monteras en gång i rotlayouten. */
export function ConfirmHost() {
  const [req, setReq] = React.useState<Request | null>(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    show = (r) => {
      setReq(r)
      setOpen(true)
    }
    return () => {
      show = null
    }
  }, [])

  const answer = (ok: boolean) => {
    req?.resolve(ok)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && answer(false)}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm" data-testid="confirm-dialog">
        <DialogHeader className="items-center px-0 text-center sm:items-start sm:pr-0 sm:text-left">
          {req?.destructive && (
            <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </span>
          )}
          <DialogTitle>{req?.title}</DialogTitle>
          {req?.description && <DialogDescription>{req.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="lg" onClick={() => answer(false)}>
            {req?.cancelLabel ?? "Avbryt"}
          </Button>
          <Button variant={req?.destructive ? "destructive" : "default"} size="lg" onClick={() => answer(true)} data-testid="confirm-ok" autoFocus>
            {req?.confirmLabel ?? "Fortsätt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
