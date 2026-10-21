import { ImageResponse } from "next/og"

import { BRAND } from "@/lib/brand"

export const alt = `${BRAND.name} – Framtidens träning & kost i en plattform`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/** Förhandsbild när landningssidan delas (Open Graph/Twitter): mörk med Coaviras gröna accent. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(900px 500px at 85% 15%, rgba(172,237,55,0.22), transparent 60%), #0a0d12",
          color: "#f4f7f2",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: BRAND.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M17.2 7.2A7 7 0 1 0 17.2 16.8" stroke={BRAND.ink} strokeWidth="2.8" strokeLinecap="round" />
              <circle cx="18.6" cy="12" r="2" fill={BRAND.ink} />
            </svg>
          </div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{BRAND.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>Framtidens träning & kost.</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, color: BRAND.color }}>Allt i en plattform.</div>
          <div style={{ fontSize: 30, color: "#b9c2bb", marginTop: 8 }}>Sömlös coachning för PT:er. Maximal effekt för klienter.</div>
        </div>
      </div>
    ),
    size
  )
}
