import { NextResponse, type NextRequest } from "next/server"

import { normalizeReferralCode, REFERRAL_CODE } from "@/lib/plus"
import { START_PATH } from "@/lib/site"

/**
 * Inbjudningslänken coavira.fit/ref/KOD (landningsdomänen skickar den vidare
 * till appen, se hostRoute). Koden följer med till registreringen, som sparar
 * den tills kontot skapats. Den löses in – och belöningarna delas ut – av
 * databasen (redeem_referral), aldrig här.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await params).code)
  const url = request.nextUrl.clone()
  url.pathname = START_PATH
  url.search = REFERRAL_CODE.test(code) ? `?ref=${code}` : ""
  return NextResponse.redirect(url)
}
