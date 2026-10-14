import Link from "next/link"

import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"

export default function AccountDeletedPage() {
  return (
    <AuthCard title="Ditt konto är raderat" description="All data om dig har tagits bort permanent. Tack för tiden hos oss!">
      <Button asChild variant="outline" className="w-full">
        <Link href="/">Till startsidan</Link>
      </Button>
    </AuthCard>
  )
}
