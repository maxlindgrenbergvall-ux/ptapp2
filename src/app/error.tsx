"use client"

import { ErrorFallback } from "@/components/error-fallback"

/** Fel i en sida (inte i rotlayouten – se global-error.tsx). */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorFallback retry={retry} digest={error.digest} fullScreen />
}
