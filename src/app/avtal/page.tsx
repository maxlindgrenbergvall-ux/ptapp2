import type { Metadata } from "next"

import { AgreementDocument } from "@/components/legal/agreement-document"

export const metadata: Metadata = { title: "Användaravtal" }

/** Coaviras användaravtal för klienter (v34): användarvillkor + integritetspolicy. */
export default function AgreementPage() {
  return <AgreementDocument pt={false} />
}
