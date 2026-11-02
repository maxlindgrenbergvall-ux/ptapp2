import { NextResponse, type NextRequest } from "next/server"

import { clientIp, rateLimited, tooManyRequests } from "@/lib/rate-limit"
import { extractRecipe } from "@/lib/recipes/extract"
import { fetchRecipePage, RecipeImportError } from "@/lib/recipes/fetch-page"
import { importRecipe } from "@/lib/recipes/import"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { recipeImportBody } from "@/lib/validation"

/**
 * Hämta ett recept från en webbadress (v25).
 * POST { url } → { recipe } med metriska mått, makron per portion och
 * träningsmål. Receptet sparas inte här – klienten förhandsgranskar och sparar
 * det i sin receptsamling (client_recipes, RLS).
 *
 * Svar: 400 ogiltig adress · 401 ej inloggad · 404 sidan finns inte ·
 * 422 inget recept / saknar makron · 429 för många försök · 502/504 sidan svarar inte.
 */
export async function POST(request: NextRequest) {
  // Med Supabase krävs inloggning; i demoläget begränsas anropen per IP.
  let key = `recipe-import:ip:${clientIp(request)}`
  if (isSupabaseEnabled) {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: "Logga in för att hämta recept." }, { status: 401 })
    key = `recipe-import:${data.user.id}`
  }
  if (await rateLimited(key, 10, 600)) return tooManyRequests(600)

  const body = recipeImportBody.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "Klistra in en webbadress till ett recept." }, { status: 400 })

  try {
    const page = await fetchRecipePage(body.data.url)
    const raw = extractRecipe(page.html, page.url)
    if (!raw) return NextResponse.json({ error: "Hittade inget recept på sidan." }, { status: 422 })
    const result = importRecipe(raw, page.url)
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.reason === "no_macros"
              ? "Receptet saknar näringsvärden och de gick inte att räkna ut ur ingredienserna, så det hämtades inte."
              : "Receptet saknar ingredienser.",
          reason: result.reason,
        },
        { status: 422 }
      )
    }
    return NextResponse.json({ recipe: result.recipe }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    if (e instanceof RecipeImportError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("recipe import", { message: (e as Error).message })
    return NextResponse.json({ error: "Receptet kunde inte hämtas just nu." }, { status: 502 })
  }
}
