import type { Metadata } from "next"
import Link from "next/link"

import { AuthCard } from "@/components/auth/auth-card"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = { title: "Villkor" }

// OBS: Utkast. Sammanfattar hur plattformen fungerar idag. Fullständiga
// användarvillkor ska granskas juridiskt innan lansering.
export default function TermsPage() {
  return (
    <AuthCard title="Villkor i korthet" description="Kortversion – utkast inför lansering.">
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">PT:er:</strong> alla PT-konton skapas av {BRAND.name} efter att certifikaten
          granskats manuellt ({BRAND.certificationEmail}). PT:n sätter själv sina priser och ansvarar för sin coachning.
        </p>
        <p>
          <strong className="text-foreground">Köp och betalning:</strong> du betalar PT:ns tjänster med kort via Stripe. Priset
          du ser är priset du betalar. Köpta pass dras från ditt saldo när de bokas eller schemaläggs, och ett avbokat pass
          ger tillbaka passet.
        </p>
        <p>
          <strong className="text-foreground">Kost:</strong> kostschema ingår när du köpt kostcoaching. Du kan ha flera PT:er
          men bara ett aktivt kostschema åt gången.
        </p>
        <p>
          <strong className="text-foreground">Chatt och samtal:</strong> röst- och videosamtal öppnas när du köpt en tjänst
          eller har ett bokat pass med PT:n.
        </p>
        <p>
          <strong className="text-foreground">Ditt konto:</strong> du kan när som helst avsluta samarbetet med en PT, ladda ner
          din data och radera ditt konto. Läs mer under{" "}
          <Link href="/integritet" className="font-medium text-foreground underline underline-offset-4">
            Integritet
          </Link>
          .
        </p>
        <p>
          <strong className="text-foreground">Kontakt:</strong>{" "}
          <a href={`mailto:${BRAND.contactEmail}`} className="font-medium text-foreground underline underline-offset-4">
            {BRAND.contactEmail}
          </a>
        </p>
      </div>
    </AuthCard>
  )
}
