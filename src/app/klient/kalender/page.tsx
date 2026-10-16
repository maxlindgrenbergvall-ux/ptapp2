import type { Metadata } from "next"

import { ClientCalendar } from "@/components/calendar/client-calendar"

export const metadata: Metadata = { title: "Mina pass" }

export default function ClientCalendarPage() {
  return <ClientCalendar />
}
