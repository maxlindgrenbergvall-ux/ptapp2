// Enhetstest för v58: träningsformer, tider, block, intressen och i18n.
//   npx tsx --tsconfig tsconfig.json e2e/training-modes.unit.ts
import library from "@/lib/exercise-library.json"
import { detectLocale, LOCALES } from "@/lib/i18n/config"
import de from "@/lib/i18n/dictionaries/de"
import en from "@/lib/i18n/dictionaries/en"
import es from "@/lib/i18n/dictionaries/es"
import fr from "@/lib/i18n/dictionaries/fr"
import sv from "@/lib/i18n/dictionaries/sv"
import { translate } from "@/lib/i18n/translate"
import { finalizeExercises } from "@/lib/exercises/draft"
import { displayGroup } from "@/lib/exercises/groups"
import { splitByKey, splitCategories } from "@/lib/splits"
import {
  blocks,
  defaultCategory,
  exerciseCategory,
  favouredCategories,
  formatDistance,
  formatPace,
  linkToPrevious,
  missingForType,
  newExerciseEntry,
  paceOf,
  parseTime,
  setBlockRounds,
  trackingTypeOf,
  unlink,
} from "@/lib/training-modes"
import type { Exercise } from "@/types/domain"

let failed = 0
const check = (cond: boolean, msg: string, extra?: unknown) => {
  console.log(cond ? "ok  " : "FAIL", msg, cond || extra === undefined ? "" : JSON.stringify(extra))
  if (!cond) failed++
}
const bank = library as unknown as Exercise[]
const ex = (id: string) => bank.find((e) => e.id === id)!

// ------------------------------------------------------------- övningar ---
const hyrox = ["e-skierg", "e-sledpush", "e-sledpull", "e-burpee-bj", "e-row-erg", "e-farmers", "e-sandbag", "e-wallball"]
check(hyrox.map((id) => ex(id).name).join() === "SkiErg,Sled Push,Sled Pull,Burpee Broad Jumps,Rowing,Farmers Carry,Sandbag Lunges,Wall Balls", "Hyrox-stationerna med internationella namn")
check(hyrox.every((id) => ex(id).modality === "hyrox" && ex(id).trackingType === "conditioning"), "stationerna: Hyrox, loggas som kondition")
check(["e-intervals", "e-tempo-run", "e-long-run", "e-hill-reps", "e-hyrox-run"].every((id) => ex(id)?.trackingType === "running"), "löpövningarna: intervaller, tempo, långpass zon 2, backar, Hyrox 1 km")
check(new Set(bank.map((e) => e.id)).size === bank.length, "inga dubbletter i övningsbanken")
check(displayGroup(ex("e-sledpush")) === "hyrox" && displayGroup(ex("e-long-run")) === "lopning" && displayGroup(ex("e-squat")) === "ben", "egna grupper för Hyrox och Löpning i övningslistan")
check(trackingTypeOf(undefined, ex("e-squat")) === "strength" && trackingTypeOf({ trackingType: "running" }, ex("e-squat")) === "running", "passets kopia vinner över övningsbanken")

const sled = newExerciseEntry(ex("e-sledpush"))
check(sled.distanceM === 50 && sled.sets === 1 && sled.trackingType === "conditioning", "Sled Push läggs till som 50 m", sled)
check(newExerciseEntry(ex("e-skierg")).distanceM === 1000 && newExerciseEntry(ex("e-row-erg")).distanceM === 1000, "SkiErg och Rowing 1000 m")
check(newExerciseEntry(ex("e-burpee-bj")).distanceM === 80 && newExerciseEntry(ex("e-farmers")).distanceM === 200 && newExerciseEntry(ex("e-sandbag")).distanceM === 100, "BBJ 80 m, Farmers Carry 200 m, Sandbag Lunges 100 m")
check(newExerciseEntry(ex("e-wallball")).reps === "100", "Wall Balls 100 reps")
const iv = newExerciseEntry(ex("e-intervals"))
check(iv.trackingType === "running" && iv.sets === 5 && iv.distanceM === 1000 && iv.paceSecPerKm === 270 && iv.restSec === 90, "intervaller: 5 × 1000 m i 4:30/km, 90 s vila", iv)
check(newExerciseEntry(ex("e-squat")).trackingType === undefined, "styrka får inget trackingType-fält (som förut)")

// ---------------------------------------------------------------- tider ---
check(parseTime("4:30") === 270 && parseTime("4.30") === 270 && parseTime("4,30") === 270, "4:30 / 4.30 / 4,30 = 270 s")
check(parseTime("1:02:05") === 3725 && parseTime("45") === 2700, "1:02:05 och 45 (minuter)")
check(parseTime("") === undefined && parseTime("4:75") === undefined && parseTime("abc") === undefined, "tomt eller ogiltigt = blankt (aldrig ett påhittat värde)")
check(formatPace(270) === "4:30" && formatPace(3725) === "1:02:05" && formatPace(undefined) === "", "formatering")
check(paceOf(1000, 291) === 291 && paceOf(5000, 1500) === 300 && paceOf(0, 100) === undefined, "tempo ur distans och tid")
check(formatDistance(5000) === "5 km" && formatDistance(800) === "800 m" && formatDistance(12500, "de-DE") === "12,5 km", "distans i km/m med språkets decimaltecken")

// -------------------------------------------------- vad saknas vid avbock ---
check(missingForType("strength", { reps: 10 }, true) === "kg" && missingForType("strength", { reps: 10, kg: 60 }, true) === null, "styrka: reps och vikt")
check(missingForType("running", { distanceM: 1000 }, false) === "time" && missingForType("running", { distanceM: 1000, durationSec: 280 }, false) === null, "löpning: distans och tid")
check(missingForType("conditioning", { reps: 100 }, false) === null && missingForType("conditioning", {}, false) === "distance", "kondition: distans eller reps")

// ---------------------------------------------------------------- block ---
const items = [
  { id: "a", sets: 4, blockId: "x" },
  { id: "b", sets: 4, blockId: "x" },
  { id: "c", sets: 3 },
  { id: "d", sets: 2, blockId: "y" },
]
const bl = blocks(items)
check(bl.length === 3 && bl[0].name === "A" && bl[0].items.length === 2 && bl[0].rounds === 4, "två övningar i följd med samma block = Block A, 4 varv", bl)
check(bl[1].id === null && bl[2].id === null, "ensamt blockId räknas som fristående")
const linked = linkToPrevious(items, 3, () => "new")
check(linked[2].blockId === "new" && linked[3].blockId === "new" && linked[3].sets === 3, "koppla till övningen ovan: nytt block, samma varv", linked)
check(blocks(linked).filter((b) => b.name).length === 2, "två block efter kopplingen")
check(unlink(items, 1)[1].blockId === undefined, "ta ur blocket")
check(setBlockRounds(items, "x", 6).filter((i) => i.blockId === "x").every((i) => i.sets === 6), "varven gäller hela blocket")
check(setBlockRounds(items, "x", undefined)[0].sets === undefined, "varv kan tömmas (blankt, inte 1)")

// ------------------------------------------------- utkast och validering ---
const fin = finalizeExercises(
  [
    { id: "1", exerciseId: "e-intervals", trackingType: "running", sets: 5, reps: "", restSec: 90, distanceM: 1000 },
    { id: "2", exerciseId: "e-wallball", trackingType: "conditioning", sets: 1, reps: "100", restSec: 0 },
  ],
  (id) => id
)
check("exercises" in fin, "löpning utan reps och Wall Balls utan distans godkänns", fin)
const bad = finalizeExercises([{ id: "1", exerciseId: "e-run", trackingType: "running", sets: 1, reps: "", restSec: 0 }], (id) => id)
check("error" in bad && /distans/.test(bad.error), "löpning utan distans stoppas", bad)
const blank = finalizeExercises([{ id: "1", exerciseId: "e-squat", sets: undefined, reps: "10", restSec: 90 }], (id) => id)
check("error" in blank && /set/.test(blank.error), "tomt set-fält stoppas vid sparning (fylls aldrig i med 1)")

// --------------------------------------------------- intressen och filter ---
check(defaultCategory(["running"]) === "running" && defaultCategory(["hyrox", "running"]) === "hyrox" && defaultCategory(["strength"]) === "strength", "förvalt filter efter intressena")
check(defaultCategory([]) === "all" && defaultCategory(["hybrid"]) === "all" && defaultCategory(["health"]) === "all", "hybrid/hälsa/inget = Alla")
check([...favouredCategories(["hybrid"])].sort().join() === "hyrox,strength", "hybrid lyfter fram styrka och Hyrox")
check(exerciseCategory(ex("e-bikeerg")) === "hyrox" && exerciseCategory(ex("e-run")) === "running" && exerciseCategory(ex("e-bench")) === "strength", "övningarnas kategori i filtret")
check(splitCategories(splitByKey("hyrox_prep")).join() === "hyrox" && splitCategories(splitByKey("ppl")).join() === "strength", "uppläggens kategorier")
const sim = splitByKey("hyrox_prep").days[0]
check(blocks(sim.exercises).filter((b) => b.name).map((b) => `${b.name}:${b.rounds}:${b.items.length}`).join() === "A:4:2,B:4:2", "Hyrox Race Prep: 4 varv 1000 m + Sled Push, 4 varv 1000 m + Wall Balls")

// ------------------------------------------------------------------ i18n ---
check(detectLocale(["de-AT", "en"]) === "de" && detectLocale(["en-US"]) === "en" && detectLocale(["nb-NO"]) === "sv", "enhetens språk: de-AT → de, en-US → en, norska → sv")
check(detectLocale(["it-IT", "pt"]) === "en" && detectLocale([]) === "sv" && detectLocale(undefined) === "sv", "okänt språk → engelska; ingen lista → svenska")
const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [`${p}${k}`] : keys(v, `${p}${k}.`)))
const svKeys = keys(sv).sort().join()
check([en, es, fr, de].every((d) => keys(d).sort().join() === svKeys), `alla fem språk har samma ${keys(sv).length} nycklar`)
check(LOCALES.every((l) => keys(sv).every((k) => translate(l, k).trim() !== "")), "inga tomma texter")
const g = (l: "sv" | "en" | "es" | "fr" | "de", k: string) => translate(l, k)
// Gymlingo – exakt som i specen.
check(["sv", "en", "es", "fr", "de"].map((l) => g(l as "sv", "fields.reps")).join() === "Reps,Reps,Repes,Reps,Wdh.", "reps: Reps / Reps / Repes / Reps / Wdh.")
check(["sv", "en", "es", "fr", "de"].map((l) => g(l as "sv", "fields.set")).join() === "Set,Sets,Series,Séries,Sätze", "set: Set / Sets / Series / Séries / Sätze")
check(["sv", "en", "es", "fr", "de"].map((l) => g(l as "sv", "fields.weight")).join() === "Vikt,Weight,Peso,Charge,Gewicht", "vikt: Vikt / Weight / Peso / Charge / Gewicht")
check(g("sv", "fields.pace") === "Tempo (min/km)" && g("es", "fields.pace") === "Ritmo (min/km)" && g("fr", "fields.pace") === "Allure (min/km)" && g("de", "fields.pace") === "Pace (min/km)", "tempo: Tempo / Ritmo / Allure / Pace")
check(g("fr", "fields.intervals") === "Fractionné" && g("fr", "fields.zone2") === "Endurance fondamentale (Z2)" && g("de", "fields.zone2") === "Grundlagenausdauer (Z2)", "Fractionné, Endurance fondamentale, Grundlagenausdauer")
check(g("es", "fields.zone2") === "Zona 2 / Tirada larga" && g("es", "fields.stations") === "Estaciones" && g("fr", "fields.stations") === "Ateliers" && g("de", "fields.rounds") === "Runden", "Tirada larga, Estaciones, Ateliers, Runden")
check(["sv", "en", "es", "fr", "de"].map((l) => g(l as "sv", "fields.restDay")).join() === "Vilodag,Rest Day,Día de descanso,Jour de repos,Ruhetag".replace("Rest Day", "Rest day"), "vilodag på alla språk")
check(g("sv", "plans.title") === "Upplägg / Tips" && g("en", "plans.title") === "Programs / Tips", "Upplägg / Tips")
check(g("de", "fields.roundsN").replace("{n}", "4") === "4 Runden" && translate("es", "fields.blockRounds", { name: "A", n: 4 }) === "Bloque A · 4 rondas", "variabler i texterna")
check(["sv", "en", "es", "fr", "de"].every((l) => /Sled Push/.test(g(l as "sv", "tips.hyrox2")) && /Wall Balls/.test(g(l as "sv", "tips.hyrox2"))), "Hyrox-namnen behålls i tipsen på alla språk")
check(["sv", "en", "es", "fr", "de"].every((l) => g(l as "sv", "hyrox.e-wallball").includes("100") && g(l as "sv", "hyrox.e-sledpush").includes("50 m")), "lokala hjälptexter per station på alla språk")
check(translate("de", "finns.inte") === "finns.inte", "okänd nyckel visar nyckeln (kraschar inte)")

if (failed) {
  console.log(`${failed} fel`)
  process.exit(1)
}
console.log("TRÄNINGSFORMER OCH I18N GODKÄNDA")
