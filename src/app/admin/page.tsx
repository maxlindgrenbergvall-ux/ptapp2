import { redirect } from "next/navigation"

import { CRM_HOME } from "@/lib/deployment"

/** /admin → Statistik (v82), adminpanelens första flik. */
export default function AdminIndex() {
  redirect(CRM_HOME)
}
