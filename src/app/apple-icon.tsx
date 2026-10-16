import { ImageResponse } from "next/og"

import { BRAND } from "@/lib/brand"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

/** Hemskärmsikon för iPhone (Lägg till på hemskärmen). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND.color }}>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
          <path d="M17.2 7.2A7 7 0 1 0 17.2 16.8" stroke={BRAND.ink} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="18.6" cy="12" r="2" fill={BRAND.ink} />
        </svg>
      </div>
    ),
    size
  )
}
