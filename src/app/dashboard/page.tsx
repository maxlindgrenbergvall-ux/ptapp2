import { redirect } from "next/navigation"

/**
 * Gemensam ingång efter inloggning och e-postbekräftelse. Med Supabase skickar
 * proxy.ts vidare till rollens startsida (eller välkomststeget) innan sidan
 * renderas; i demoläget går vi till startsidan.
 */
export default function DashboardPage() {
  redirect("/")
}
