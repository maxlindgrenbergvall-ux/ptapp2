import { CalendarCheck, LineChart, MessageCircle } from "lucide-react"
import Link from "next/link"

import { OrDivider, SocialButtons } from "@/components/auth/social-buttons"
import { BrandMark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { BRAND } from "@/lib/brand"
import { isSupabaseEnabled } from "@/lib/supabase/config"

const POINTS = [
  { icon: CalendarCheck, text: "Boka och flytta pass med din PT" },
  { icon: LineChart, text: "Program, kost och progress på ett ställe" },
  { icon: MessageCircle, text: "Chatt och videosamtal med din coach" },
]

/**
 * Startsidan: inloggning och registrering. Kontotyp (PT eller klient) väljs först
 * efter registreringen, i välkomststeget. Inloggade skickas vidare av proxy.ts.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col px-4 py-8">
      <section className="flex flex-1 flex-col justify-center gap-8">
        <div className="space-y-4 text-center">
          <BrandMark size="lg" className="mx-auto" />
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-balance">{BRAND.name}</h1>
            <p className="text-pretty text-muted-foreground">Träning som följs upp – för dig som tränar och för dig som coachar.</p>
          </div>
          <ul className="mx-auto w-fit space-y-1.5 text-left text-sm">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-primary" /> {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <SocialButtons />
          <OrDivider />
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link href="/registrera">Registrera dig</Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Har du redan ett konto?{" "}
            <Link href="/logga-in" className="font-medium text-foreground underline underline-offset-4">
              Logga in
            </Link>
          </p>
        </div>

        {!isSupabaseEnabled && (
          <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            Demoläge: inga riktiga konton skapas. Välj valfri metod för att prova flödet med påhittad data.
          </p>
        )}
      </section>
      <footer className="pt-6 text-center text-xs text-muted-foreground">
        <Link href="/integritet" className="underline-offset-4 hover:underline">
          Integritet och hälsodata
        </Link>
      </footer>
    </main>
  )
}
