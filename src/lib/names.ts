/**
 * Förnamn ur ett fullständigt namn från profilen ("Elin Söderberg" → "Elin").
 * Används överallt där appen tilltalar någon – aldrig hårdkodade namn.
 */
export function firstName(fullName: string | null | undefined, fallback = ""): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0]
  return first || fallback
}
