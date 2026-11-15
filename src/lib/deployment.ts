/**
 * Två driftsättningar från samma kodbas (v48):
 *
 *   app (standard) – Coavira-appen, PT-portalen och landningssidan.
 *   crm            – bara det interna CRM:et, på en egen adress (t.ex.
 *                    coavira-crm.vercel.app). Sätts med COAVIRA_DEPLOYMENT=crm
 *                    i ett eget Vercel-projekt kopplat till samma repo.
 *
 * Båda delar databas och inloggning (samma Supabase-projekt), så behörigheten
 * är densamma: bara konton i app_admins kommer åt CRM:et. Skillnaden är var det
 * nås – i CRM-driftsättningen finns ingenting av appen, och i appen kan /admin
 * skickas vidare till CRM-adressen (CRM_URL).
 *
 * Läses bara på servern (proxy.ts, serverkomponenter, next.config.ts).
 */
export const isCrmDeployment = () => process.env.COAVIRA_DEPLOYMENT?.trim().toLowerCase() === "crm"

/** På appens driftsättning: CRM:ets adress. /admin skickas då dit i stället för att visas i appen. */
export const crmUrl = () => {
  const raw = process.env.CRM_URL?.trim().replace(/\/+$/, "")
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

/** Inloggningen för administratörer (på båda driftsättningarna). */
export const CRM_LOGIN_PATH = "/logga-in/admin"
export const CRM_HOME = "/admin/leads"

/**
 * Det enda som finns i CRM-driftsättningen. Allt annat – appen, PT-portalen,
 * landningssidan och appens API – svarar 404 där.
 */
const CRM_PREFIXES = ["/admin/", "/api/admin/", "/api/crm/", "/avregistrera/", "/auth/"]
const CRM_EXACT = ["/admin", CRM_LOGIN_PATH, "/api/resend/webhook"]

export const crmAllows = (path: string) => CRM_EXACT.includes(path) || CRM_PREFIXES.some((p) => path.startsWith(p))

export const isAdminPath = (path: string) => path === "/admin" || path.startsWith("/admin/")
