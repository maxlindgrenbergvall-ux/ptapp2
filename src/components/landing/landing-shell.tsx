"use client"

import { MotionConfig } from "framer-motion"
import * as React from "react"

/**
 * Ram för landningssidan: alltid mörkt tema (.landing i globals.css) och
 * framer-motion som följer användarens "minska rörelse"-inställning.
 */
export function LandingShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative min-h-svh overflow-x-clip font-sans antialiased">{children}</div>
    </MotionConfig>
  )
}
