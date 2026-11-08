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
 * Två adresser i samma projekt (se src/lib/site.ts och proxy.ts):
 *  - SITE_URL: landningssidan, https://coavira.fit (metadata, Open Graph, sitemap).
 *  - APP_URL: appen/webbportalen, https://ptapp2.vercel.app (även mobilapparna).
 * Båda kan skrivas över i Vercel (NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL).
 */
const origin = (name: string, value: string) => {
  const url = value.replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/.test(url)) {
    throw new Error(`${name} ska vara en adress utan sökväg, t.ex. https://coavira.fit (fick "${value}")`);
  }
  return url;
};
const siteUrl = origin("SITE_URL/NEXT_PUBLIC_SITE_URL", pick("NEXT_PUBLIC_SITE_URL", "SITE_URL") || "https://coavira.fit");
const appUrl = origin("APP_URL/NEXT_PUBLIC_APP_URL", pick("NEXT_PUBLIC_APP_URL", "APP_URL") || "https://ptapp2.vercel.app");

/**
 * Säkerhetsheaders (v44, säkerhetsgranskningen):
 *  - Clickjacking: sidan får aldrig visas i en iframe på en annan sajt
 *    (frame-ancestors + X-Frame-Options för äldre webbläsare). Capacitor laddar
 *    appen som toppsida och Stripe används via omdirigering – inget påverkas.
 *  - nosniff: webbläsaren gissar inte filtyper (t.ex. en uppladdad fil som skript).
 *  - Referrer-Policy: fullständiga adresser (med t.ex. ?session_id=) läcker inte till andra sajter.
 *  - Permissions-Policy: kamera och mikrofon bara för appen själv (streckkodsläsaren,
 *    videosamtal); position, USB m.m. av.
 *  - HSTS: bara HTTPS i två år (webbläsare ignorerar den över http, t.ex. localhost).
 * En fullständig CSP för skript kräver nonce-hantering för Next.js och Google
 * Analytics – därför här bara de direktiv som inte kan bryta sidan.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), usb=(), serial=(), hid=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
    NEXT_PUBLIC_SITE_URL: siteUrl,
    NEXT_PUBLIC_APP_URL: appUrl,
  },
  // App Store, Google Play och appen länkar till coavira.fit/privacy och /terms.
  async redirects() {
    return [
      { source: "/privacy", destination: "/integritet", permanent: true },
      { source: "/terms", destination: "/villkor", permanent: true },
    ];
  },
  async headers() {
    // v44 (säkerhetsgranskningen): säkerhetsheaders på alla svar.
    const security = [{ source: "/:path*", headers: SECURITY_HEADERS }];
    // Appens domän ska inte synas i sökmotorer – den publika sidan är coavira.fit.
    if (new URL(appUrl).host === new URL(siteUrl).host) return security;
    return [
      ...security,
      {
        source: "/:path*",
        // value tolkas som reguljärt uttryck: punkterna escapas.
        has: [{ type: "host", value: new URL(appUrl).hostname.replace(/\./g, "\\.") }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  // Bildfiltret (v29): TensorFlow.js och nsfwjs körs som vanliga Node-paket på
  // servern, och modellfilerna följer med till serverfunktionen.
  serverExternalPackages: ["@tensorflow/tfjs", "nsfwjs"],
  outputFileTracingIncludes: {
    "/api/uploads/image": ["./node_modules/nsfwjs/dist/models/mobilenet_v2/**"],
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
