import { NextResponse, type NextRequest } from "next/server"

import { DELETE_CONFIRM_WORD } from "@/lib/account"
import { createSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/** Mappar i Storage som är användarens: <bucket>/<användar-id>/… */
const USER_FOLDERS = ["avatars", "chat-attachments", "exercise-videos"] as const

/**
 * Radera inloggat konto (Apple 5.1.1(v), Google Play och GDPR art. 17).
 *
 *  1. Användaren identifieras med sessionen (cookien) – aldrig med ett id från
 *     webbläsaren. Body: { confirm: "RADERA" }.
 *  2. Användarens filer i Storage tas bort (profilbild, chattbilagor i den egna
 *     klienttråden, övningsvideor).
 *  3. Kontot raderas med Supabase Auth admin-API:t (service role, bara på
 *     servern). Databasen raderar resten via `on delete cascade` och
 *     avidentifierar det andra behåller (omdömen, aviseringar) – se v20.
 *  4. Sessionen loggas ut.
 *
 * Utan service role (t.ex. lokalt) raderas kontot med delete_my_account() i
 * databasen i stället – samma radering, men filerna ligger kvar.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null
  if (body?.confirm !== DELETE_CONFIRM_WORD) {
    return NextResponse.json({ error: `Skriv ${DELETE_CONFIRM_WORD} för att bekräfta.` }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return NextResponse.json({ error: "Logga in igen för att radera kontot." }, { status: 401 })

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

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error("account delete", { userId: user.id, message: error.message })
    return NextResponse.json({ error: "Kontot kunde inte raderas. Försök igen eller kontakta support." }, { status: 500 })
  }
  if (filesFailed) console.error("account delete: files left", { userId: user.id, buckets: filesFailed })
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
