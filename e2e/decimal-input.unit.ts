// Enhetstest för decimalinmatningen i passet (src/lib/decimal-input.ts, hotfix v63).
//   npx tsx --tsconfig tsconfig.json e2e/decimal-input.unit.ts
import { cleanDecimal, parseDecimal } from "@/lib/decimal-input"

let failed = 0
const check = (cond: boolean, msg: string, extra?: unknown) => {
  console.log(cond ? "ok  " : "FAIL", msg, cond || extra === undefined ? "" : JSON.stringify(extra))
  if (!cond) failed++
}

check(parseDecimal("62.5") === 62.5 && parseDecimal("62,5") === 62.5, "punkt och komma: 62.5 = 62,5")
check(parseDecimal("") === undefined && parseDecimal("  ") === undefined, "tomt fält = blankt (undefined), aldrig 0 eller 1")
check(parseDecimal(",") === undefined && parseDecimal(".") === undefined, "bara ett decimaltecken = blankt")
check(parseDecimal("62,") === 62 && parseDecimal(",5") === 0.5, "62, → 62 och ,5 → 0,5 medan man skriver")
check(parseDecimal("141,25") === 141.25, "141,25 (förra passet + 1,25 kg)")
check(cleanDecimal("62,5,1") === "62,51" && cleanDecimal("62.5.") === "62.5", "bara ett decimaltecken behålls", [cleanDecimal("62,5,1"), cleanDecimal("62.5.")])
check(cleanDecimal("6a2 kg") === "62", "bokstäver och mellanslag tas bort")
check(cleanDecimal("62,555") === "62,55", "max två decimaler")
check(cleanDecimal("") === "", "radering ger tom sträng")

if (failed) {
  console.log(`${failed} fel`)
  process.exit(1)
}
console.log("DECIMALINMATNINGEN GODKÄND")
