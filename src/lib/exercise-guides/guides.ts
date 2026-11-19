/**
 * Videoguiden per övning (v60/v61): varje FÖRINLAGD övning i banken har en
 * rörelse för guide-atleten (animationen), övningens redskap och tre
 * utförandesteg i språkfilerna (guide.steps.<steg>.start/move/control).
 * Egna övningar har ingen guide. Inga videor eller externa tjänster – allt
 * ritas i appen med samma modell.
 *
 * Verifieras i e2e/exercise-guides.unit.ts: 100 % av övningsbanken.
 */
import type { Motion } from "@/lib/exercise-guides/figure"
import type { MotionId } from "@/lib/exercise-guides/motions"
import type { Exercise } from "@/types/domain"

export type Hand = NonNullable<Motion["hand"]>

export interface Guide {
  motion: MotionId
  /** Nyckel under guide.steps i ordböckerna. */
  steps: string
  /** Övningens eget redskap när det skiljer sig från rörelsens (t.ex. hantlar i hantelpress). */
  hand?: Hand
}

const g = (motion: MotionId, steps: string = motion, hand?: Hand): Guide => ({ motion, steps, ...(hand ? { hand } : {}) })

export const GUIDES: Record<string, Guide> = {
  // ----------------------------------------------------------- ben ---
  "e-squat": g("squat"),
  "e-frontsquat": g("front_squat"),
  "e-goblet": g("goblet_squat", "goblet", "kettlebell"),
  "e-boxsquat": g("squat"),
  "e-pausesquat": g("squat"),
  "e-hacksquat": g("machine_squat"),
  "e-legpress": g("leg_press"),
  "e-bss": g("split_squat"),
  "e-lunge": g("lunge"),
  "e-walklunge": g("lunge"),
  "e-revlunge": g("lunge"),
  "e-stepup": g("step_up"),
  "e-legext": g("leg_extension", "leg_ext"),
  "e-pistol": g("pistol"),
  "e-wallsit": g("wall_sit"),
  "e-rdl": g("hinge", "rdl"),
  "e-sldl": g("hinge", "rdl"),
  "e-db-rdl": g("hinge", "rdl", "dumbbell"),
  "e-hipthrust": g("hip_thrust"),
  "e-machine-hipthrust": g("hip_thrust", "hip_thrust", "none"),
  "e-glutebridge": g("glute_bridge"),
  "e-legcurl": g("lying_leg_curl", "leg_curl"),
  "e-seatedcurl": g("seated_leg_curl", "leg_curl"),
  "e-nordic": g("nordic"),
  "e-kbswing": g("kb_swing"),
  "e-goodmorning": g("good_morning"),
  "e-calfraise": g("calf_raise", "calf", "none"),
  "e-seatedcalf": g("seated_calf", "calf"),
  "e-abduction": g("seated_machine", "hip_ab"),
  "e-adduction": g("seated_machine", "hip_ad"),
  "e-copenhagen": g("side_plank", "copenhagen"),
  // ----------------------------------------------------------- rygg ---
  "e-deadlift": g("deadlift"),
  "e-sumodl": g("deadlift", "sumo"),
  "e-trapbar": g("deadlift"),
  "e-row": g("bent_row", "row"),
  "e-pendlay": g("bent_row", "row"),
  "e-db-row": g("db_row"),
  "e-cablerow": g("seated_row", "cable_row"),
  "e-tbarrow": g("bent_row", "row"),
  "e-chestrow": g("bent_row", "row", "dumbbell"),
  "e-pullup": g("pull_up"),
  "e-chinup": g("pull_up"),
  "e-assistpull": g("pull_up"),
  "e-latpull": g("pulldown", "lat_pull"),
  "e-straightarm": g("straight_arm"),
  "e-invrow": g("inverted_row", "inv_row"),
  "e-backext": g("back_extension", "back_ext"),
  "e-shrug": g("shrug", "shrug", "barbell"),
  "e-rackpull": g("deadlift"),
  // ---------------------------------------------------------- bröst ---
  "e-bench": g("bench_press", "bench"),
  "e-closegrip": g("bench_press", "bench"),
  "e-inclinebb": g("incline_press", "incline"),
  "e-db-bench": g("bench_press", "bench", "dumbbell"),
  "e-incline": g("incline_press", "incline"),
  "e-declinebench": g("bench_press", "bench"),
  "e-pausebench": g("bench_press", "bench"),
  "e-dbfly": g("fly"),
  "e-cablefly": g("fly", "fly", "handle"),
  "e-pecdeck": g("chest_press", "fly"),
  "e-chestpress": g("chest_press"),
  "e-pushup": g("push_up"),
  "e-dip": g("dip"),
  // ---------------------------------------------------------- axlar ---
  "e-ohp": g("overhead_press", "ohp"),
  "e-db-ohp": g("seated_press", "db_press"),
  "e-machine-ohp": g("seated_press", "db_press", "handle"),
  "e-pushpress": g("push_press"),
  "e-arnold": g("db_press"),
  "e-landmine": g("landmine"),
  "e-lateral": g("raise"),
  "e-cablelateral": g("raise", "raise", "handle"),
  "e-frontraise": g("raise"),
  "e-reardelt": g("reverse_fly", "rear_delt"),
  "e-facepull": g("face_pull"),
  "e-uprightrow": g("upright_row"),
  "e-handstandpu": g("handstand_pu", "hspu"),
  // ---------------------------------------------------------- armar ---
  "e-curl": g("curl"),
  "e-bbcurl": g("barbell_curl", "curl"),
  "e-ezcurl": g("barbell_curl", "curl"),
  "e-hammer": g("curl"),
  "e-preacher": g("barbell_curl", "curl"),
  "e-inclinecurl": g("curl"),
  "e-cablecurl": g("curl", "curl", "handle"),
  "e-pushdown": g("pushdown"),
  "e-ohext": g("overhead_ext", "oh_ext", "handle"),
  "e-skullcrusher": g("skull_crusher", "skull"),
  "e-kickback": g("kickback"),
  "e-benchdip": g("bench_dip"),
  "e-wristcurl": g("curl", "wrist_curl"),
  // ------------------------------------------------------------ bål ---
  "e-plank": g("plank"),
  "e-sideplank": g("side_plank"),
  "e-pallof": g("pallof"),
  "e-deadbug": g("dead_bug"),
  "e-birddog": g("bird_dog"),
  "e-hlr": g("hanging_raise", "leg_raise"),
  "e-kneeraise": g("knee_raise", "leg_raise"),
  "e-abwheel": g("ab_wheel"),
  "e-cablecrunch": g("cable_crunch", "crunch"),
  "e-crunch": g("crunch"),
  "e-russian": g("russian_twist", "russian", "ball"),
  "e-hollow": g("hollow"),
  "e-woodchop": g("woodchop"),
  "e-suitcase": g("carry", "carry", "kettlebell"),
  // ------------------------------------------------------- helkropp ---
  "e-clean": g("clean"),
  "e-hangclean": g("clean"),
  "e-snatch": g("snatch"),
  "e-thruster": g("thruster", "thruster", "barbell"),
  "e-kbcleanpress": g("kb_clean_press"),
  "e-tgu": g("getup", "tgu"),
  "e-burpee": g("burpee"),
  "e-boxjump": g("box_jump"),
  "e-battleropes": g("battle_ropes"),
  "e-mountain": g("mountain_climber", "mountain"),
  "e-musclup": g("pull_up", "muscle_up"),
  // ---------------------------------------------------------- Hyrox ---
  "e-skierg": g("ski_erg", "skierg"),
  "e-sledpush": g("sled_push", "sledpush"),
  "e-sledpull": g("sled_pull", "sledpull"),
  "e-burpee-bj": g("broad_jump", "bbj"),
  "e-row-erg": g("row_erg"),
  "e-farmers": g("carry", "farmers"),
  "e-sandbag": g("sandbag_lunge", "sandbag"),
  "e-wallball": g("wall_ball", "wallball"),
  "e-hyrox-run": g("run", "hyrox_run"),
  // ------------------------------------------------------- kondition ---
  "e-run": g("run"),
  "e-intervals": g("run", "intervals"),
  "e-treadmill": g("run"),
  "e-tempo-run": g("run", "tempo"),
  "e-long-run": g("run", "long_run"),
  "e-hill-reps": g("hill_run", "hill"),
  "e-walk": g("walk"),
  "e-bikeerg": g("bike"),
  "e-airbike": g("bike"),
  "e-crosstrainer": g("walk", "elliptical"),
  "e-stairs": g("stairs"),
  "e-jumprope": g("jump_rope"),
  "e-swim": g("swim"),
}

/** Guiden för en övning – null för egna övningar och okända id:n. */
export function guideFor(exercise: Pick<Exercise, "id" | "custom"> | undefined | null): Guide | null {
  if (!exercise || exercise.custom) return null
  return GUIDES[exercise.id] ?? null
}
