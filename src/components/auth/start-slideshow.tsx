"use client"

/**
 * Bildspelet på Kom igång (v79): samma animerade kort som PT-introt – boka pass,
 * kost och progress, chatt och video med PT:n – som byter själva.
 */
import { motion } from "framer-motion"
import * as React from "react"

import { EASE } from "@/components/flow/motion"
import { Slideshow, type Slide } from "@/components/flow/slideshow"
import { ChatVisual, ProgressVisual, ScheduleVisual } from "@/components/flow/visuals"

const SLIDES: Slide[] = [
  {
    id: "book",
    title: "Boka pass med din PT",
    text: "Boka och flytta pass direkt i appen – din PT ser det på en gång.",
    visual: (a) => <ScheduleVisual active={a} badge="Pass bokat" />,
  },
  {
    id: "progress",
    title: "Program, kost och progress",
    text: "Allt på ett ställe, med ett kalorimål som följer dig.",
    visual: (a) => <ProgressVisual active={a} />,
  },
  {
    id: "coach",
    title: "Nära din coach",
    text: "Chatt och videosamtal med din PT – utan att byta app.",
    visual: (a) => <ChatVisual active={a} />,
  },
]

export function StartSlideshow() {
  const [index, setIndex] = React.useState(0)
  return (
    <div className="relative" data-testid="start-slideshow">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-2rem] -top-24 -z-10 h-[130%]"
        animate={{ background: `radial-gradient(60% 55% at ${20 + index * 30}% 35%, rgba(132,204,22,0.16), transparent 70%)` }}
        transition={{ duration: 0.9, ease: EASE }}
      />
      <Slideshow
        slides={SLIDES}
        ariaLabel="Det här är Coavira"
        slideLabel={(n, total) => `Kort ${n} av ${total}`}
        titleAs="h2"
        visualClassName="h-44"
        titleClassName="text-2xl leading-tight"
        textClassName="text-[0.95rem]"
        testIdPrefix="start"
        onIndexChange={setIndex}
      />
    </div>
  )
}
