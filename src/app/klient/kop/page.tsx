import type { Metadata } from "next"

import { PurchaseReturn } from "@/components/services/purchase-return"

export const metadata: Metadata = { title: "Betalning" }

export default function PurchaseReturnPage() {
  return <PurchaseReturn />
}
