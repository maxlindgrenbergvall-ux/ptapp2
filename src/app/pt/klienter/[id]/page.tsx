import { ClientDetail } from "@/components/pt/client-detail"

// Demo-klienterna är kända vid bygget; riktiga id:n kommer från databasen.
export function generateStaticParams() {
  return ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => ({ id }))
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ClientDetail clientId={id} />
}
