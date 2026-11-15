import type { Metadata } from "next"
import { Suspense } from "react"

import { UnsubscribeCard } from "@/components/crm/unsubscribe-card"

export const metadata: Metadata = { title: "Avregistrera", robots: { index: false, follow: false } }

/**
 * /avregistrera/[token] (v47) – länken i sidfoten på våra B2B-mejl. Ingenting
 * händer förrän personen trycker på knappen: mejlprogram och säkerhetsfilter
 * öppnar ofta länkar i förväg, och det får inte avregistrera någon av misstag.
 */
export default function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense>
      <Route params={params} />
    </Suspense>
  )
}

async function Route({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <UnsubscribeCard token={token} />
}
