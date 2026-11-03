"use client"

import * as React from "react"

import { AvatarPicker } from "@/components/avatar-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NAME_MAX, nameError, splitName } from "@/lib/onboarding"
import { cn } from "@/lib/utils"

export interface ProfileDraft {
  firstName: string
  lastName: string
  avatarUrl: string
}

export function profileDraft(fullName: string | null | undefined, avatarUrl?: string | null, first?: string | null, last?: string | null): ProfileDraft {
  const split = splitName(fullName)
  return { firstName: first ?? split.first, lastName: last ?? split.last, avatarUrl: avatarUrl ?? "" }
}

/** Fel per fält. PT:er måste ha en profilbild (klienterna ser den), klienter kan lägga till den senare. */
export function profileErrors(d: ProfileDraft, requireAvatar: boolean): Partial<Record<keyof ProfileDraft, string>> {
  const e: Partial<Record<keyof ProfileDraft, string>> = {}
  const first = nameError(d.firstName, "förnamn")
  const last = nameError(d.lastName, "efternamn")
  if (first) e.firstName = first
  if (last) e.lastName = last
  if (requireAvatar && !d.avatarUrl) e.avatarUrl = "Lägg till en profilbild – klienterna ser den när de hittar dig"
  return e
}

/**
 * Steg 1 för alla (v31): förnamn, efternamn och profilbild. Bilden laddas upp
 * via servern och granskas av bildfiltret (nsfwjs, v29) innan den sparas –
 * olämpliga bilder stoppas med ett tydligt besked vid bilden.
 */
export function ProfileStepFields({
  value,
  onChange,
  userId,
  errors = {},
  requireAvatar,
  className,
}: {
  value: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
  userId: string
  errors?: Partial<Record<keyof ProfileDraft, string>>
  requireAvatar: boolean
  className?: string
}) {
  const fullName = `${value.firstName} ${value.lastName}`.trim()
  const field = (key: "firstName" | "lastName", label: string, autoComplete: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`profile-${key}`}>{label}</Label>
      <Input
        id={`profile-${key}`}
        value={value[key]}
        maxLength={NAME_MAX}
        autoComplete={autoComplete}
        autoCapitalize="words"
        enterKeyHint="next"
        onChange={(e) => onChange({ [key]: e.target.value })}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `profile-${key}-error` : undefined}
        className="h-12 text-base"
      />
      {errors[key] && (
        <p id={`profile-${key}-error`} className="text-xs text-destructive" role="alert">
          {errors[key]}
        </p>
      )}
    </div>
  )
  return (
    <div className={cn("space-y-6", className)} data-testid="profile-step">
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
        <AvatarPicker name={fullName || "?"} value={value.avatarUrl} userId={userId} onChange={(avatarUrl) => onChange({ avatarUrl })} size="lg" className="sm:flex-col" />
        <p className="text-center text-xs text-muted-foreground">
          {requireAvatar ? "Profilbild (krävs för PT:er)" : "Profilbild (valfri – dina PT:er ser den)"}
        </p>
        {errors.avatarUrl && (
          <p className="text-center text-xs text-destructive" role="alert">
            {errors.avatarUrl}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("firstName", "Förnamn", "given-name")}
        {field("lastName", "Efternamn", "family-name")}
      </div>
    </div>
  )
}
