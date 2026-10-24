"use client"

import { ErrorFallback } from "@/components/error-fallback"

/** Fel i en sida i klientappen: menyn ligger kvar, bara innehållet byts ut. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorFallback retry={retry} digest={error.digest} homeHref="/klient" />
}
