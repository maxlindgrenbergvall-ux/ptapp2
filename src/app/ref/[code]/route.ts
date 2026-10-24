import { NextResponse, type NextRequest } from "next/server"

import { normalizeReferralCode, REFERRAL_CODE } from "@/lib/plus"
import { looksLikePtInvite, normalizePtInviteCode } from "@/lib/pt-invites"
import { START_PATH } from "@/lib/site"

/**
 * Inbjudningslänkarna coavira.fit/ref/KOD (en väns kod) och coavira.fit/ref/EX-XXXXXX
 * (PT:ns kod till en befintlig klient). Landningsdomänen skickar dem vidare
 * till appen, se hostRoute). Koden följer med till registreringen, som sparar
 * den tills kontot skapats. Den löses in – och belöningarna delas ut – av
 * databasen (redeem_referral), aldrig här.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const raw = decodeURIComponent((await params).code)
  const url = request.nextUrl.clone()
  url.pathname = START_PATH
  if (looksLikePtInvite(raw)) {
    url.search = `?ptkod=${normalizePtInviteCode(raw)}`
  } else {
    const code = normalizeReferralCode(raw)
    url.search = REFERRAL_CODE.test(code) ? `?ref=${code}` : ""
  }
  return NextResponse.redirect(url)
}
