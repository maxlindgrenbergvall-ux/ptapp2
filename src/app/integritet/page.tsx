import type { Metadata } from "next"

import { AuthCard } from "@/components/auth/auth-card"

export const metadata: Metadata = { title: "Integritet" }

// OBS: Utkast. Ska granskas juridiskt och kompletteras med personuppgiftsansvarig,
// kontaktuppgifter och lagringstider innan lansering.
export default function PrivacyPage() {
  return (
    <AuthCard title="Så hanterar vi din data" description="Kortversion – utkast inför lansering.">
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">Vad vi sparar:</strong> namn, e-post, dina träningspass och loggade set, vikt,
          kostschema, avbockade måltider, meddelanden med din PT och bokningar.
        </p>
        <p>
          <strong className="text-foreground">Varför:</strong> för att din PT ska kunna lägga upp program och följa din
          utveckling. Uppgifter om träning, vikt och kost räknas som hälsouppgifter och behandlas bara med ditt uttryckliga
          samtycke.
        </p>
        <p>
          <strong className="text-foreground">Vem ser det:</strong> bara du och den PT du aktivt tränar med. En PT som du
          bara skickat en förfrågan till ser ditt namn men ingen hälsodata.
        </p>
        <p>
          <strong className="text-foreground">Var:</strong> i en databas inom EU. På din enhet sparas en kopia så att appen
          fungerar utan uppkoppling; den rensas när du loggar ut.
        </p>
        <p>
          <strong className="text-foreground">Dina rättigheter:</strong> du kan ladda ner all din data och radera ditt konto
          i appen under Coavira-loggan → Min data och sekretess. Radering tar bort all data om dig permanent.
        </p>
      </div>
    </AuthCard>
  )
}
