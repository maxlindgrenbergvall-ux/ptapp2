import { BRAND } from "@/lib/brand"

/**
 * Communityreglerna (v65, utkast) – visas på /communityregler och som en del av
 * användaravtalet (/avtal och /avtal/pt). Gäller klienter och PT:er. Grunden för
 * att ta bort innehåll, varna, stänga av och avsluta konton, med motivering och
 * rätt att överklaga (jfr EU:s förordning om digitala tjänster, DSA).
 */
export function CommunityContent() {
  const strong = "text-foreground"
  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      <p>
        {BRAND.name} ska vara en trygg plats för träning och kost. Reglerna gäller alla – klienter och PT:er – och allt du
        delar i appen: meddelanden, bilder, videor, filer, samtal, profiler och recensioner.
      </p>
      <div>
        <p className={`font-semibold ${strong}`}>Det här är inte tillåtet</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>Sexuellt innehåll, nakenhet eller sexuella närmanden.</li>
          <li>Trakasserier, hot, mobbning eller kränkningar.</li>
          <li>Hets, hat eller diskriminering, till exempel på grund av kön, etnicitet, religion, funktionsnedsättning, sexuell läggning eller kroppsform.</li>
          <li>Våld, eller att uppmuntra till självskada, ätstörningar eller farliga metoder för viktnedgång.</li>
          <li>Olagligt innehåll, till exempel försäljning av dopningspreparat eller narkotika.</li>
          <li>Bedrägerier, spam, falsk identitet, eller att be om betalning eller kortuppgifter utanför appen för tjänster som köps i {BRAND.name}.</li>
          <li>Andras personuppgifter, bilder eller videor utan deras samtycke.</li>
          <li>Medicinska diagnoser eller löften om behandling. PT:er coachar träning och kost, inte sjukdomar.</li>
        </ul>
      </div>
      <p>
        <strong className={strong}>Bilder, videor och filer:</strong> skicka bara sådant som hör till träningen och kosten,
        till exempel teknikvideor, framstegsbilder eller program. Bilder granskas automatiskt innan de skickas. Allt du
        skickar ska du ha rätt att dela.
      </p>
      <p>
        <strong className={strong}>Rapportera:</strong> ser du något som bryter mot reglerna, tryck på Rapportera vid
        meddelandet i chatten eller kontakta{" "}
        <a href={`mailto:${BRAND.contactEmail}`} className="font-medium text-foreground underline underline-offset-4">
          {BRAND.contactEmail}
        </a>
        . Vi granskar varje rapport manuellt. Den du rapporterar får inte veta vem som rapporterade.
      </p>
      <div>
        <p className={`font-semibold ${strong}`}>Om reglerna bryts</p>
        <p className="mt-1">
          Vi väljer en åtgärd som står i proportion till överträdelsen. Allvarliga eller upprepade överträdelser kan leda
          till avstängning direkt:
        </p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5">
          <li>innehållet tas bort,</li>
          <li>en varning,</li>
          <li>tillfällig avstängning (till ett visst datum),</li>
          <li>avstängning tills vidare eller att kontot avslutas.</li>
        </ul>
        <p className="mt-1.5">
          Under en avstängning kan du inte skicka meddelanden, ladda upp filer, boka, köpa eller recensera. En avstängd PT
          visas inte i Hitta PT och kan inte sälja tjänster. Du kan fortfarande logga in, se och ladda ner din data och
          radera ditt konto. Misstänkta brott kan polisanmälas.
        </p>
      </div>
      <p>
        <strong className={strong}>Motivering och överklagande:</strong> när vi vidtar en åtgärd ser du skälet i appen. Du kan
        överklaga beslutet inom sex månader genom att mejla{" "}
        <a href={`mailto:${BRAND.contactEmail}`} className="font-medium text-foreground underline underline-offset-4">
          {BRAND.contactEmail}
        </a>
        . En person som inte fattade beslutet granskar ärendet. Du har också rätt att vända dig till ett certifierat
        tvistlösningsorgan eller till domstol.
      </p>
    </div>
  )
}
