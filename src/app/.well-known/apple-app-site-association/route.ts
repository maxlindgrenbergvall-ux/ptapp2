import { connection } from "next/server"

/**
 * iOS Universal Links: bevisar att Coavira-appen får öppna länkar till den här
 * domänen. Kräver Apple-utvecklarkontots Team ID (APPLE_TEAM_ID) och att appen
 * har "Associated Domains" (applinks:<domän>) – görs när certifikaten finns.
 * Utan Team ID: 404.
 */
export async function GET() {
  // Läses vid varje anrop (inte vid bygget), så att en ny miljövariabel gäller direkt.
  await connection()
  const teamId = process.env.APPLE_TEAM_ID?.trim() ?? ""
  if (!/^[A-Z0-9]{10}$/.test(teamId)) return new Response("Not found", { status: 404 })
  return Response.json({
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.com.coavira.app`],
          // Inloggnings- och e-postlänkar samt appens sidor; övrigt stannar på webben.
          components: [{ "/": "/auth/*" }, { "/": "/klient/*" }, { "/": "/pt/*" }],
        },
      ],
    },
  })
}
