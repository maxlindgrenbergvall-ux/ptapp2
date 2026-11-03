import Link from "next/link"

import { BRAND } from "@/lib/brand"
import { EXISTING_CLIENT_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "@/lib/payments/fees"

const H = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <h2 id={id} className="scroll-mt-24 pt-2 text-base font-semibold text-foreground">
    {children}
  </h2>
)

/** PT-avtalet och GDPR-åtagandet (utkast) – visas på /villkor/pt och som del 3 i /avtal för PT:er. */
export function PtAgreementContent() {
  return (
    <>
    <article className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      <H>1. Parter och roller</H>
      <p>
        Avtalet gäller mellan {BRAND.name} och dig som personlig tränare (PT). Du driver din verksamhet självständigt och är inte anställd av {BRAND.name}.
        Du ansvarar för din coachning, dina tjänster och att du har de utbildningar och försäkringar som krävs.
      </p>

      <H>2. Konto och granskning</H>
      <p>
        PT-konton skapas av {BRAND.name} efter att dina certifikat granskats ({BRAND.certificationEmail}). Uppgifterna i din profil ska vara sanna. Profilbilden granskas
        automatiskt av vårt bildfilter. Vi kan stänga av ett konto vid brott mot avtalet, användarvillkoren eller lag.
      </p>

      <H>3. Priser, betalning och serviceavgift</H>
      <p>
        Du sätter själv dina priser. Klienten betalar med kort via Stripe och betalningen delas automatiskt i kassan (Stripe Connect): du får hela ditt pris och{" "}
        {BRAND.name}s serviceavgift – {EXISTING_CLIENT_FEE_PERCENT} % för klienter du bjuder in med din kod, {PLATFORM_FEE_PERCENT} % för klienter som hittar dig i appen –
        läggs på klientens pris och dras som avgift i samma betalning. Utbetalningar sker till ditt bankkonto enligt Stripes schema.
      </p>
      <p>
        Du måste ha ett godkänt Stripe-konto för att ta emot betalningar och ansvarar för din egen bokföring, moms och skatt. Återbetalningar görs i Stripe och tas tillbaka
        från ditt konto.
      </p>

      <H>4. Pass, avbokning och kvalitet</H>
      <p>
        Köpta pass dras från klientens saldo när de bokas eller schemaläggs. Ett pass du ställer in ger klienten passet tillbaka. Du klarmarkerar genomförda pass och
        svarar på klienters meddelanden inom rimlig tid.
      </p>

      <H>5. Uppförande</H>
      <p>
        Du behandlar klienter respektfullt, ger inte medicinska diagnoser och hänvisar till vården vid skador, sjukdom eller ätstörningar. Kontakt och betalning med klienter
        du fått via {BRAND.name} sker i appen.
      </p>

      <H id="gdpr">6. GDPR, hälsodata och tystnadsplikt</H>
      <p>
        Klienternas uppgifter i appen – träning, kost, vikt, mål, sömn och meddelanden – är personuppgifter och delvis hälsodata (särskilda kategorier enligt GDPR art. 9).
        Klienten har samtyckt till att {BRAND.name} behandlar dem för coachningen. Du åtar dig att:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>bara använda uppgifterna för att coacha klienten, aldrig för marknadsföring eller annat syfte,</li>
        <li>inte kopiera eller exportera uppgifterna ur appen, eller dela dem med någon annan, utan klientens uttryckliga samtycke,</li>
        <li>hålla tystnad om allt du får veta om klienten, även efter att samarbetet upphört,</li>
        <li>skydda ditt konto: starkt lösenord, inte dela inloggningen och logga ut på delade enheter,</li>
        <li>
          genast meddela {BRAND.name} ({BRAND.contactEmail}) om du misstänker att någon obehörig kommit åt uppgifter (personuppgiftsincident), så att vi kan agera inom 72
          timmar,
        </li>
        <li>hänvisa klienter som vill se, rätta eller radera sina uppgifter till appen eller till {BRAND.name}.</li>
      </ul>
      <p>
        När samarbetet avslutas eller klienten raderar sitt konto försvinner din åtkomst till uppgifterna. Läs mer i{" "}
        <Link href="/integritet" className="font-medium text-foreground underline underline-offset-4">
          integritetspolicyn
        </Link>
        .
      </p>

      <H>7. Ändringar och uppsägning</H>
      <p>
        Vi meddelar ändringar i avtalet i appen; du godkänner den nya versionen innan du kan fortsätta använda PT-portalen. Du kan när som helst avsluta ditt konto under
        Inställningar. Pågående köp hanteras enligt användarvillkoren.
      </p>
      <p>
        Frågor:{" "}
        <a href={`mailto:${BRAND.contactEmail}`} className="font-medium text-foreground underline underline-offset-4">
          {BRAND.contactEmail}
        </a>
      </p>
    </article>
  </>
  )
}
