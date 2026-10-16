import type { MetadataRoute } from "next"

import { BRAND } from "@/lib/brand"

/** Webbappsmanifest: namn och färger på hemskärmen och i startskärmen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} – ${BRAND.tagline}`,
    short_name: BRAND.name,
    description: BRAND.description,
    lang: "sv",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fbf8",
    theme_color: "#f9fbf8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  }
}
