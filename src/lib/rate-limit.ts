import "server-only"

import { NextResponse } from "next/server"

import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"

/**
 * Rate limiting för känsliga API-rutter. Räknaren ligger i databasen
 * (hit_rate_limit, migration v23), så att gränsen gäller oavsett vilken
 * serverinstans på Vercel som svarar. Släpper igenom om databasen inte svarar
 * (eller saknar v23) – hellre en fungerande kassa än en låst.
 *
 * Inloggning, registrering och lösenordsåterställning går direkt till Supabase
 * Auth, som har egna gränser (Authentication → Rate Limits i Supabase).
 */
export async function rateLimited(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!hasServiceRole()) return false
  try {
    const { data, error } = await createSupabaseAdmin().rpc("hit_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds })
    if (error) return false
    return data === false
  } catch {
    return false
  }
}

/** Svar när gränsen är nådd (429 med Retry-After). */
export function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "För många försök. Vänta en stund och försök igen." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  )
}

/** Klientens IP (Vercel sätter x-forwarded-for) – för rutter utan inloggning. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "okänd"
}
