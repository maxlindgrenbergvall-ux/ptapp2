/**
 * Övningslistan grupperad efter muskelgrupp (v38) i stället för alfabetiskt.
 *
 * Övningsbanken har grova grupper (ben, bröst, rygg, axlar, armar, bål,
 * helkropp, kondition). För att listan ska vara lätt att skumma på mobilen delas
 * de i de grupper man faktiskt tänker i:
 *   armar → Biceps, Triceps, Underarmar
 *   ben   → Ben (knäböj, utfall, press), Baksida lår, Säte, Vader
 *   bål   → Mage
 * Uppdelningen görs på övningens namn (engelska och svenska) – egna övningar
 * följer samma regler. Ingen ändring i databasen.
 *
 * Ren TypeScript – enhetstestad i e2e/exercise-groups.unit.ts.
 */
import type { Exercise, MuscleGroup } from "@/types/domain"

export type DisplayGroup =
  | "brost"
  | "rygg"
  | "axlar"
  | "biceps"
  | "triceps"
  | "underarmar"
  | "ben"
  | "baksida"
  | "sate"
  | "vader"
  | "mage"
  | "helkropp"
  | "kondition"

/** Ordningen i listan: överkropp, armar, underkropp, mage, helkropp, kondition. */
export const DISPLAY_GROUPS: { key: DisplayGroup; label: string }[] = [
  { key: "brost", label: "Bröst" },
  { key: "rygg", label: "Rygg" },
  { key: "axlar", label: "Axlar" },
  { key: "biceps", label: "Biceps" },
  { key: "triceps", label: "Triceps" },
  { key: "underarmar", label: "Underarmar" },
  { key: "ben", label: "Ben" },
  { key: "baksida", label: "Baksida lår" },
  { key: "sate", label: "Säte" },
  { key: "vader", label: "Vader" },
  { key: "mage", label: "Mage" },
  { key: "helkropp", label: "Helkropp" },
  { key: "kondition", label: "Kondition" },
]
export const GROUP_LABEL = Object.fromEntries(DISPLAY_GROUPS.map((g) => [g.key, g.label])) as Record<DisplayGroup, string>

const TRICEPS = /tricep|push-?down|skull|dip|close-?grip|french press|kickback.*(arm|tricep)|smal bänk/i
const FOREARM = /wrist|forearm|underarm|handled|farmer/i
const CALF = /calf|vad(er|press)?\b|tåhäv/i
const GLUTE = /hip thrust|glute|bridge|abduct|kickback|säte|höftlyft|clamshell/i
const HAMSTRING = /leg curl|nordic|romanian|stiff-?leg|good ?morning|hamstring|lårcurl|raka ben|rdl/i

/** Visningsgruppen för en övning. */
export function displayGroup(e: Pick<Exercise, "name" | "muscleGroup"> & { sv?: string }): DisplayGroup {
  const name = `${e.name} ${e.sv ?? ""}`
  const g: MuscleGroup = e.muscleGroup
  switch (g) {
    case "bröst":
      return "brost"
    case "rygg":
      return "rygg"
    case "axlar":
      return "axlar"
    case "armar":
      return TRICEPS.test(name) ? "triceps" : FOREARM.test(name) ? "underarmar" : "biceps"
    case "ben":
      return CALF.test(name) ? "vader" : GLUTE.test(name) ? "sate" : HAMSTRING.test(name) ? "baksida" : "ben"
    case "bål":
      return "mage"
    case "helkropp":
      return "helkropp"
    case "kondition":
      return "kondition"
  }
}

export interface ExerciseGroup<T> {
  key: DisplayGroup
  label: string
  exercises: T[]
}

/**
 * Övningarna i muskelgrupper (i DISPLAY_GROUPS-ordning). Inom en grupp: egna
 * övningar först, sedan i bankens ordning (vanligaste/baslyften först) – inte
 * alfabetiskt. Tomma grupper tas bort.
 */
export function groupExercises<T extends Pick<Exercise, "name" | "muscleGroup"> & { custom?: unknown; sv?: string }>(list: T[]): ExerciseGroup<T>[] {
  const buckets = new Map<DisplayGroup, T[]>()
  for (const e of list) {
    const k = displayGroup(e)
    const arr = buckets.get(k) ?? []
    arr.push(e)
    buckets.set(k, arr)
  }
  return DISPLAY_GROUPS.filter((g) => buckets.has(g.key)).map((g) => {
    const items = buckets.get(g.key)!
    // Stabil sortering: egna övningar först, annars ursprunglig ordning.
    const sorted = items.map((e, i) => ({ e, i })).sort((a, b) => Number(Boolean(b.e.custom)) - Number(Boolean(a.e.custom)) || a.i - b.i)
    return { key: g.key, label: g.label, exercises: sorted.map((x) => x.e) }
  })
}
