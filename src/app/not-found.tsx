import { Compass } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Sidan finns inte", robots: { index: false } }

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="size-7" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1.5">
        <h1 className="text-xl font-semibold">Sidan finns inte</h1>
        <p className="text-sm text-muted-foreground">Länken kan vara gammal, eller så har sidan flyttats.</p>
      </div>
      <Button asChild>
        <Link href="/">Till startsidan</Link>
      </Button>
    </main>
  )
}
