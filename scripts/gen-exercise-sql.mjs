// Genererar SQL för den globala övningsbanken från src/lib/exercise-library.json
// (samma källa som appen och demoläget använder).
//   node scripts/gen-exercise-sql.mjs > /tmp/exercises.sql
import fs from "node:fs"

const lib = JSON.parse(fs.readFileSync(new URL("../src/lib/exercise-library.json", import.meta.url), "utf8"))
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const rows = lib.map((e) => `  (${q(e.id)}, ${q(e.name)}, ${q(e.muscleGroup)}, ${q(e.equipment)})`).join(",\n")
process.stdout.write(`insert into exercises (id, name, muscle_group, equipment) values
${rows}
on conflict (id) do update
  set name = excluded.name, muscle_group = excluded.muscle_group, equipment = excluded.equipment
  where exercises.owner_id is null;
`)
