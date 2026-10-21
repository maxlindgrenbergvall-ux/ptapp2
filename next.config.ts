import type { NextConfig } from "next";

/**
 * Supabase-uppgifterna bakas in i appen när den BYGGS. Därför:
 *  - Efter att variablerna lagts till i Vercel måste projektet byggas om (Redeploy).
 *  - Vi godtar alla namn som Vercels Supabase-integration och Supabase själva
 *    använder (NEXT_PUBLIC_* eller utan prefix, publishable eller anon), och
 *    exponerar dem under ett namn för appen.
 * Den publika nyckeln (publishable/anon) får finnas i webbläsaren – RLS skyddar
 * datan. En hemlig nyckel (service role / sb_secret_) stoppar bygget.
 */
const pick = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find((v) => v) ?? "";

const supabaseUrl = pick("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
const supabaseKey = pick(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY"
);

function isSecretKey(key: string) {
  if (key.startsWith("sb_secret_")) return true;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}
if (supabaseKey && isSecretKey(supabaseKey)) {
  throw new Error("Supabase-nyckeln för webbläsaren är en HEMLIG nyckel (service role). Använd publishable/anon-nyckeln.");
}

if (supabaseUrl && supabaseKey) {
  console.log(`[coavira] Supabase-läge: ${supabaseUrl}`);
} else {
  console.warn(
    `[coavira] DEMOLÄGE – saknas vid bygget: ${[!supabaseUrl && "Supabase-URL", !supabaseKey && "publik Supabase-nyckel"].filter(Boolean).join(" och ")}. ` +
      "Sätt NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (eller ANON_KEY) i Vercel och bygg om."
  );
}

/**
 * Den egna domänen (t.ex. https://coavira.se). SITE_URL eller
 * NEXT_PUBLIC_SITE_URL i Vercel; annars Vercels produktionsadress för projektet.
 */
const explicitSiteUrl = pick("NEXT_PUBLIC_SITE_URL", "SITE_URL");
const siteUrl =
  explicitSiteUrl ||
  (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
if (siteUrl && !/^https?:\/\/[^/\s]+$/.test(siteUrl.replace(/\/+$/, ""))) {
  throw new Error(`SITE_URL/NEXT_PUBLIC_SITE_URL ska vara en adress utan sökväg, t.ex. https://coavira.se (fick "${siteUrl}")`);
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
    NEXT_PUBLIC_SITE_URL: siteUrl.replace(/\/+$/, ""),
    // Omdirigera *.vercel.app → den egna domänen bara när domänen satts uttryckligen.
    NEXT_PUBLIC_CANONICAL_REDIRECT: explicitSiteUrl ? "1" : "",
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
