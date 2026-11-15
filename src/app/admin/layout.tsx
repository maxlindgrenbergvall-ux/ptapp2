import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { AdminShell } from "@/components/crm/admin-shell"
import { getAdminContext } from "@/lib/crm/auth"

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } }

/**
 * /admin (v47) – internt. Sidan finns bara för administratörer: alla andra
 * (utloggade, klienter, PT:er) får 404, så att panelen inte ens syns.
 * Behörigheten avgörs av databasen (is_admin). Varje API-anrop kontrollerar
 * samma sak igen, och RLS stoppar allt annat.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="admin-dark min-h-svh bg-background" />}>
      <Gate>{children}</Gate>
    </Suspense>
  )
}

async function Gate({ children }: { children: React.ReactNode }) {
  // Avgörs alltid per förfrågan – aldrig förrenderat vid bygget (inte heller i demoläge).
  await connection()
  const ctx = await getAdminContext()
  if (!ctx) notFound()
  return <AdminShell demo={ctx.demo}>{children}</AdminShell>
}
