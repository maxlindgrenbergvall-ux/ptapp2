import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

/** Supabase-klient för route handlers och serverkomponenter. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Anrop från en serverkomponent kan inte sätta cookies; proxy.ts förnyar sessionen.
        }
      },
    },
  })
}
