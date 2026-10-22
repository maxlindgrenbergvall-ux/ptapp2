import type { Metadata } from "next"
import Link from "next/link"

import { AuthCard } from "@/components/auth/auth-card"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = { title: "Support", description: `Hjälp med ${BRAND.name}-appen för iPhone och Android.` }

const FAQ = [
  {
    q: "Var laddar jag ned appen?",
    a: `${BRAND.name} finns för iPhone (App Store) och Android (Google Play). Appen är gratis att ladda ned – du betalar bara för tjänsterna du köper av din PT.`,
  },
  { q: "Hur skapar jag ett konto?", a: "I appen, med Apple, Google eller e-post. Du väljer dina mål och intressen i välkomststeget." },
  {
    q: "Hur blir jag PT på Coavira?",
    a: `PT-konton skapas av ${BRAND.name} efter att dina certifikat granskats manuellt. Skicka en ansökan till ${BRAND.certificationEmail}.`,
  },
  { q: "Hur betalar jag?", a: "Med kort via Stripe, direkt i appen. Priset du ser är priset du betalar, och ett avbokat pass ger tillbaka passet." },
  { q: "Hur raderar jag mitt konto och min data?", a: "I appen: tryck på Coavira-loggan → Min data och sekretess. Där kan du också ladda ned all din data." },
]

/** Supportsidan (krävs av App Store och Google Play som "Support URL"). */
export default function SupportPage() {
  return (
    <AuthCard title="Support" description={`Hjälp med ${BRAND.name}-appen.`}>
      <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">
        <p>
          Hittar du inte svaret här? Mejla oss på{" "}
          <a href={`mailto:${BRAND.supportEmail}`} className="font-medium text-foreground underline underline-offset-4">
            {BRAND.supportEmail}
          </a>{" "}
          så svarar vi så snart vi kan.
        </p>
        <dl className="space-y-4">
          {FAQ.map(({ q, a }) => (
            <div key={q}>
              <dt className="font-medium text-foreground">{q}</dt>
              <dd className="mt-1">{a}</dd>
            </div>
          ))}
        </dl>
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-4">
          <Link href="/integritet" className="font-medium text-foreground underline underline-offset-4">
            Sekretesspolicy
          </Link>
          <Link href="/villkor" className="font-medium text-foreground underline underline-offset-4">
            Användarvillkor
          </Link>
        </p>
      </div>
    </AuthCard>
  )
}
