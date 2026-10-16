import type { Metadata } from "next"

import { PtCalendar } from "@/components/calendar/pt-calendar"

export const metadata: Metadata = { title: "Kalender" }

export default function CalendarPage() {
  return <PtCalendar />
}
