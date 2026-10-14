import { ArrowRight, Dumbbell, LayoutDashboard, Smartphone } from "lucide-react"
import Link from "next/link"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { isSupabaseEnabled } from "@/lib/supabase/config"

const demoRoles = [
  {
    href: "/klient",
    icon: Smartphone,
    title: "Jag tränar",
    who: "Inloggad som Sara (klient)",
    text: "Dagens pass och kost, logga set med ett tryck, hitta och boka PT.",
  },
  {
    href: "/pt",
    icon: LayoutDashboard,
    title: "Jag är PT",
    who: "Inloggad som Elin (PT)",
    text: "Klientöversikt, passbyggare, kostscheman, progress och chatt.",
  },
]

export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Dumbbell className="size-4" />
          </span>
          Forma
        </span>
        <div className="flex items-center gap-2">
          {isSupabaseEnabled && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/logga-in">Logga in</Link>
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-1 flex-col justify-center gap-8 py-12">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">Träning som följs upp.</h1>
          <p className="max-w-xl text-lg text-muted-foreground text-pretty">
            {isSupabaseEnabled
              ? "En plats för PT och klient: program, kost, loggning och feedback. Hitta en PT som matchar dina mål och kom igång."
              : "En plats för PT och klient: program, kost, loggning och feedback. Välj en demovy nedan. All data är påhittad och sparas bara i din webbläsare."}
          </p>
        </div>

        {isSupabaseEnabled ? (
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="h-12 bg-brand px-6 text-base text-brand-foreground hover:bg-brand/90">
              <Link href="/registrera">
                Skapa konto <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
              <Link href="/logga-in">Logga in</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {demoRoles.map(({ href, icon: Icon, title, who, text }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-4 rounded-2xl border bg-card p-6 transition-colors hover:border-foreground/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Icon className="size-6" />
                <div className="space-y-1">
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    {title}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </h2>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
                <span className="mt-auto text-xs font-medium text-muted-foreground">{who}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
