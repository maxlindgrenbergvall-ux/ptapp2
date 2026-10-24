"use client"

import { ErrorFallback } from "@/components/error-fallback"

import "./globals.css"

/**
 * Fel i rotlayouten. Ersätter hela dokumentet, så <html>, <body> och
 * stilarna måste finnas här (rotlayoutens metadata gäller inte).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="sv">
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        <title>Något gick fel – Coavira</title>
        <ErrorFallback retry={retry} digest={error.digest} fullScreen />
      </body>
    </html>
  )
}
