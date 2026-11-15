/** Tolkning av Bolagsverkets svar (v54) – ren funktion, enhetstestad. Se bolagsverket.ts. */

export interface RegistryAnswer {
  /** Organisationsformens kod/text som den stod i svaret, t.ex. "AB" eller "Aktiebolag". */
  form: string | null
  isAktiebolag: boolean
  /** Avregistrerat, likviderat, i konkurs … */
  inactive: boolean
  name: string | null
}

/** Letar rekursivt efter första värdet vars nyckel matchar. */
function find(node: unknown, key: RegExp, depth = 0): unknown {
  if (!node || typeof node !== "object" || depth > 6) return undefined
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (key.test(k) && v !== null && v !== undefined && v !== "") return v
  }
  for (const v of Object.values(node as Record<string, unknown>)) {
    const hit = find(v, key, depth + 1)
    if (hit !== undefined) return hit
  }
  return undefined
}
const text = (v: unknown): string | null => {
  if (typeof v === "string") return v
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    return (typeof o.klartext === "string" && o.klartext) || (typeof o.kod === "string" && o.kod) || (typeof o.beskrivning === "string" && o.beskrivning) || null
  }
  return null
}

/** Tolkar Bolagsverkets svar (exporteras för enhetstest). */
export function parseRegistry(json: unknown): RegistryAnswer | null {
  const formRaw = find(json, /^organisationsform$/i) ?? find(json, /organisationsform/i) ?? find(json, /^juridiskform$|juridisk_?form/i)
  const form = text(formRaw)
  if (!form) return null
  const kod = formRaw && typeof formRaw === "object" ? String((formRaw as Record<string, unknown>).kod ?? "") : ""
  const isAktiebolag = /^ab$/i.test(kod) || /^(ab|aktiebolag)$/i.test(form.trim()) || /\baktiebolag\b/i.test(form)
  const avreg = find(json, /avregistrer|avforing|avförd/i)
  const status = text(find(json, /^(status|organisationsstatus|verksamhetsstatus)$/i))
  const inactive = Boolean(avreg && avreg !== false && !(typeof avreg === "object" && Object.keys(avreg as object).length === 0)) || /avregistrer|likvidat|konkurs|avförd|upplöst/i.test(status ?? "")
  const name = text(find(json, /^(namn|organisationsnamn|firma)$/i))
  return { form, isAktiebolag, inactive, name: typeof name === "string" ? name : null }
}

