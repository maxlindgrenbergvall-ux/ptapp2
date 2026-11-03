import type { Metadata } from "next"

import { AgreementDocument } from "@/components/legal/agreement-document"

export const metadata: Metadata = { title: "Användaravtal för PT:er" }

/** Coaviras användaravtal för PT:er (v34): användarvillkor, integritetspolicy, PT-avtal och GDPR-åtagande. */
export default function PtAgreementDocumentPage() {
  return <AgreementDocument pt />
}
