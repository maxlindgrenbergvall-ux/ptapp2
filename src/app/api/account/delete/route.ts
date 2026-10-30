import { NextResponse, type NextRequest } from "next/server"

import { DELETE_CONFIRM_WORD } from "@/lib/account"
import { deleteSubscriber, isRevenueCatEnabled } from "@/lib/payments/revenuecat-server"
import { getStripe, isStripeEnabled } from "@/lib/payments/stripe"
import { rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { deleteAccountBody } from "@/lib/validation"

/** Mappar i Storage som är användarens: <bucket>/<användar-id>/… */
const USER_FOLDERS = ["avatars", "chat-attachments", "exercise-videos"] as const

/**
 * Radera inloggat konto (Apple 5.1.1(v), Google Play och GDPR art. 17).
 *
 *  1. Användaren identifieras med sessionen (cookien) – aldrig med ett id från
 *     webbläsaren. Body: { confirm: "RADERA" }.
 *  2. Användarens filer i Storage tas bort (profilbild, chattbilagor i den egna
 *     klienttråden, övningsvideor).
 *  3. Kopplingar hos tredje part tas bort (bästa försök, loggas vid fel):
 *     PT:ns Stripe Connect-konto och kunden hos RevenueCat.
 *  4. Kontot raderas med Supabase Auth admin-API:t (service role, bara på
 *     servern). Databasen raderar resten via `on delete cascade` och
 *     avidentifierar det andra behåller (omdömen, aviseringar) – se v20.
 *  5. Sessionen loggas ut.
 *
 * Utan service role (t.ex. lokalt) raderas kontot med delete_my_account() i
 * databasen i stället – samma radering, men filerna ligger kvar.
 */
export async function POST(request: NextRequest) {
  if (!deleteAccountBody.safeParse(await request.json().catch(() => null)).success) {
    return NextResponse.json({ error: `Skriv ${DELETE_CONFIRM_WORD} för att bekräfta.` }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return NextResponse.json({ error: "Logga in igen för att radera kontot." }, { status: 401 })
  if (await rateLimited(`account-delete:${user.id}`, 5, 3600)) return tooManyRequests(3600)

  if (!hasServiceRole()) {
    const { error } = await supabase.rpc("delete_my_account")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.auth.signOut().catch(() => {})
    return NextResponse.json({ deleted: true, files: "kept" })
  }

  const admin = createSupabaseAdmin()
  let filesFailed = 0
  for (const bucket of USER_FOLDERS) {
    try {
      const paths = await listFolder(admin, bucket, user.id)
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
        if (error) filesFailed += 1
      }
    } catch {
      filesFailed += 1
    }
  }

  // Id:t till Stripe-kontot försvinner med kaskaden – läs det innan.
  const { data: payout } = await admin
    .from("trainer_payout_accounts")
    .select("stripe_account_id")
    .eq("trainer_id", user.id)
    .maybeSingle()
  const stripeAccount = (payout as { stripe_account_id: string | null } | null)?.stripe_account_id

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error("account delete", { userId: user.id, message: error.message })
    return NextResponse.json({ error: "Kontot kunde inte raderas. Försök igen eller kontakta support." }, { status: 500 })
  }
  if (filesFailed) console.error("account delete: files left", { userId: user.id, buckets: filesFailed })

  // Efter att kontot är borta, så att ett fel här aldrig lämnar kvar ett halvt
  // raderat konto. Stripe nekar radering av konton med saldo – då loggas det
  // och hanteras manuellt (utbetalningen till PT:n ska ändå gå ut).
  if (stripeAccount && isStripeEnabled()) {
    await getStripe()
      .accounts.del(stripeAccount)
      .catch((e: unknown) => console.error("account delete: stripe account left", { userId: user.id, stripeAccount, message: String(e) }))
  }
  if (isRevenueCatEnabled()) {
    await deleteSubscriber(user.id).catch((e: unknown) =>
      console.error("account delete: revenuecat subscriber left", { userId: user.id, message: String(e) })
    )
  }
  await supabase.auth.signOut().catch(() => {})
  return NextResponse.json({ deleted: true })
}

/** Alla filer under <mapp>/ (rekursivt, högst fyra nivåer). */
async function listFolder(admin: ReturnType<typeof createSupabaseAdmin>, bucket: string, folder: string, depth = 0): Promise<string[]> {
  if (depth > 3) return []
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset })
    if (error) throw error
    for (const item of data ?? []) {
      const path = `${folder}/${item.name}`
      // Mappar saknar id i Storage-listningen.
      if (item.id) out.push(path)
      else out.push(...(await listFolder(admin, bucket, path, depth + 1)))
    }
    if (!data || data.length < 1000) break
  }
  return out
}
