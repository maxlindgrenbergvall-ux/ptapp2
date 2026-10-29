import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import type { UserRole } from "@/lib/supabase/config"

/**
 * Visas medan appens data hämtas första gången (efter det kommer den från den
 * lokala cachen direkt). Samma form som den riktiga vyn – sidhuvud, innehåll och
 * meny – så att inget hoppar när datan kommer och appen känns snabb.
 */
export function AppSkeleton({ role }: { role: UserRole }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Laddar…</span>
      <div className="app-backdrop" aria-hidden />
      {role === "client" ? <ClientSkeleton /> : <TrainerSkeleton />}
    </div>
  )
}

function Header() {
  return (
    <div className="flex h-[calc(3.5rem+var(--safe-top))] items-center justify-between border-b border-border/60 px-4 pt-[var(--safe-top)]">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-xl" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="size-9 rounded-full" />
      </div>
    </div>
  )
}

function CardBlock({ lines = 3, tall = false }: { lines?: number; tall?: boolean }) {
  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      {tall && <Skeleton className="h-24 w-full rounded-xl" />}
      <SkeletonText lines={lines} />
    </div>
  )
}

function ClientSkeleton() {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col">
      <Header />
      <main className="flex-1 space-y-5 px-4 pt-5 pb-28">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-7 w-44" />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
        <CardBlock tall />
        <CardBlock lines={2} />
      </main>
      <div className="fixed inset-x-0 bottom-0 mx-auto grid max-w-lg grid-cols-5 border-t border-border/60 bg-background/75 pb-[var(--safe-bottom)] backdrop-blur-xl">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-16 flex-col items-center justify-center gap-1.5">
            <Skeleton className="h-6 w-10 rounded-full" />
            <Skeleton className="h-2.5 w-9" />
          </div>
        ))}
      </div>
    </div>
  )
}

function TrainerSkeleton() {
  return (
    <div className="flex min-h-svh">
      <aside className="hidden h-svh w-60 shrink-0 flex-col gap-2 border-r border-border/60 p-3 pt-[calc(var(--safe-top)+0.75rem)] lg:flex">
        <Skeleton className="mb-3 h-8 w-32" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 rounded-xl" />
        ))}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="lg:hidden">
          <Header />
        </div>
        <main className="mx-auto w-full max-w-7xl space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-7 w-1/3" />
              </div>
            ))}
          </div>
          <CardBlock lines={4} />
        </main>
      </div>
    </div>
  )
}
