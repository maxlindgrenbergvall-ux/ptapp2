// Enhetstest för muskelgrupperna i övningslistan (src/lib/exercises/groups.ts).
//   npx tsx --tsconfig tsconfig.json e2e/exercise-groups.unit.ts
import library from "@/lib/exercise-library.json"
import { displayGroup, DISPLAY_GROUPS, groupExercises } from "@/lib/exercises/groups"
import type { Exercise } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string) => {
  console.log(cond ? "ok  " : "FAIL", msg)
  if (!cond) failed++
}
const lib = library as (Exercise & { sv?: string })[]
const g = (name: string) => displayGroup(lib.find((e) => e.name === name)!)

check(g("Barbell Curl") === "biceps" && g("Hammer Curl") === "biceps", "curls → Biceps")
check(g("Triceps Pushdown") === "triceps" && g("Skull Crusher") === "triceps" && g("Close-Grip Bench Press") === "triceps" && g("Bench Dip") === "triceps", "pushdown, skull crusher, smal bänk, dips → Triceps")
check(g("Wrist Curl") === "underarmar", "wrist curl → Underarmar (inte Biceps)")
check(g("Back Squat") === "ben" && g("Leg Press") === "ben" && g("Walking Lunge") === "ben", "knäböj, benpress, utfall → Ben")
check(g("Romanian Deadlift") === "baksida" && g("Lying Leg Curl") === "baksida" && g("Nordic Hamstring Curl") === "baksida", "RDL och lårcurl → Baksida lår")
check(g("Barbell Hip Thrust") === "sate" && g("Glute Bridge") === "sate" && g("Hip Abduction Machine") === "sate", "hip thrust, glute bridge, abduktion → Säte")
check(g("Standing Calf Raise") === "vader", "vadpress → Vader")
check(g("Plank") === "mage" && g("Cable Crunch") === "mage", "bål → Mage")
check(g("Bench Press") === "brost" || displayGroup({ name: "X", muscleGroup: "bröst" }) === "brost", "bröst → Bröst")

const groups = groupExercises(lib)
check(groups.reduce((s, x) => s + x.exercises.length, 0) === lib.length, `alla ${lib.length} övningar finns kvar i grupperna`)
check(groups.map((x) => x.key).join(",") === DISPLAY_GROUPS.map((x) => x.key).filter((k) => groups.some((y) => y.key === k)).join(","), "grupperna i fast ordning (inte alfabetiskt)")
check(groups[0].label === "Bröst" && groups.some((x) => x.label === "Biceps") && groups.some((x) => x.label === "Mage"), `grupper: ${groups.map((x) => `${x.label} (${x.exercises.length})`).join(", ")}`)
const legs = groups.find((x) => x.key === "ben")!.exercises.map((e) => e.name)
check(legs[0] === "Back Squat", "inom en grupp: bankens ordning (baslyften först), inte alfabetiskt")
const custom = groupExercises([...lib, { id: "c-1", name: "Min curl", muscleGroup: "armar", equipment: "Hantlar", custom: { ownerId: "u", weightUnit: "kg", defaultSets: 3, defaultReps: "10", createdAt: "" } } as Exercise])
check(custom.find((x) => x.key === "biceps")!.exercises[0].name === "Min curl", "egna övningar först i sin grupp")
check(groupExercises([]).length === 0, "tom lista → inga grupper")

console.log(failed ? `\n${failed} fel` : "\nMUSKELGRUPPERNA GODKÄNDA")
process.exit(failed ? 1 : 0)
