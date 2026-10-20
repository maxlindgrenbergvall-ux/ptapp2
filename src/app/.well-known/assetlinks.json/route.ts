import { connection } from "next/server"

/**
 * Android App Links: bevisar att Coavira-appen får öppna länkar till den här
 * domänen (t.ex. e-postlänkar direkt i appen). Kräver signeringscertifikatets
 * SHA-256-fingeravtryck, som finns först när appen signeras för Google Play:
 * ANDROID_APP_SHA256 (ett eller flera, kommaseparerade). Utan det: 404.
 */
export async function GET() {
  // Läses vid varje anrop (inte vid bygget), så att en ny miljövariabel gäller direkt.
  await connection()
  const fingerprints = (process.env.ANDROID_APP_SHA256 ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f))
  if (!fingerprints.length) return new Response("Not found", { status: 404 })
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.coavira.app", sha256_cert_fingerprints: fingerprints },
    },
  ])
}
