"use client"

import { MotionConfig } from "framer-motion"
import * as React from "react"

import { AppDownloadProvider } from "@/components/landing/store-badges"

/**
 * Ram för landningssidan: alltid mörkt tema (.landing i globals.css) och
 * framer-motion som följer användarens "minska rörelse"-inställning. Delar
 * "Släpps snart"-rutan mellan alla butiksbrickor.
 */
export function LandingShell({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AppDownloadProvider>
        <div className="landing relative min-h-svh overflow-x-clip font-sans antialiased">{children}</div>
      </AppDownloadProvider>
    </MotionConfig>
  )
}
