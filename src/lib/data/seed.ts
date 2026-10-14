/**
 * Mockdata. Allt genereras relativt dagens datum så att demon alltid har
 * "idag", historik och kommande pass. Slumpen är seedad för stabila värden.
 */
import { addDays, todayISO } from "@/lib/date"
import exerciseLibrary from "@/lib/exercise-library.json"
import type {
  AppData,
  Client,
  Exercise,
  FoodEntry,
  Message,
  NutritionPlan,
  ScheduledWorkout,
  SetLog,
  SleepLog,
  Trainer,
  WaterLog,
  WorkoutExercise,
  WorkoutTemplate,
} from "@/types/domain"

/** Inloggade demoanvändare (ersätts av auth-session senare). */
export const DEMO_TRAINER_ID = "t1"
export const DEMO_CLIENT_ID = "c1"

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

// Gemensamt övningsbibliotek (samma som databasen, se scripts/gen-exercise-sql.mjs).
const exercises: Exercise[] = exerciseLibrary as Exercise[]

const we = (
  id: string,
  exerciseId: string,
  sets: number,
  reps: string,
  restSec: number,
  extra: Partial<WorkoutExercise> = {}
): WorkoutExercise => ({ id, exerciseId, sets, reps, restSec, ...extra })

const templates: WorkoutTemplate[] = [
  {
    id: "tpl-lower",
    trainerId: DEMO_TRAINER_ID,
    name: "Underkropp A",
    description: "Tung knäböj, höftdominant assistans och bål.",
    exercises: [
      we("tl1", "e-squat", 4, "5", 180, { rpe: 8, targetKg: 80, notes: "Paus 1 s i botten på första setet." }),
      we("tl2", "e-rdl", 3, "8", 120, { rpe: 7, targetKg: 70 }),
      we("tl3", "e-bss", 3, "10", 90, { targetKg: 14, notes: "Per ben." }),
      we("tl4", "e-pallof", 3, "12", 60),
    ],
  },
  {
    id: "tpl-upper",
    trainerId: DEMO_TRAINER_ID,
    name: "Överkropp A",
    description: "Press och drag i balans.",
    exercises: [
      we("tu1", "e-bench", 4, "6", 150, { rpe: 8, targetKg: 50 }),
      we("tu2", "e-row", 4, "8", 120, { targetKg: 45 }),
      we("tu3", "e-ohp", 3, "8", 120, { targetKg: 30 }),
      we("tu4", "e-latpull", 3, "10–12", 90, { targetKg: 40 }),
      we("tu5", "e-facepull", 3, "15", 60, { targetKg: 15 }),
    ],
  },
  {
    id: "tpl-pull",
    trainerId: DEMO_TRAINER_ID,
    name: "Marklyft & drag",
    description: "Marklyft som huvudlyft, därefter ryggvolym.",
    exercises: [
      we("tp1", "e-deadlift", 4, "4", 180, { rpe: 8, targetKg: 100 }),
      we("tp2", "e-pullup", 4, "6–8", 120),
      we("tp3", "e-hipthrust", 3, "10", 90, { targetKg: 80 }),
      we("tp4", "e-farmers", 3, "40 m", 90, { targetKg: 24 }),
    ],
  },
  {
    id: "tpl-hyrox",
    trainerId: DEMO_TRAINER_ID,
    name: "Hyrox-intervaller",
    description: "Stationer + löpning, 4 varv.",
    exercises: [
      we("th1", "e-run", 4, "1 km", 60, { notes: "Tävlingsfart minus 10 s/km." }),
      we("th2", "e-skierg", 4, "500 m", 60),
      we("th3", "e-sledpush", 4, "25 m", 60, { targetKg: 102 }),
      we("th4", "e-wallball", 4, "25", 60, { targetKg: 6 }),
    ],
  },
]

function addHours(dateISO: string, hour: number) {
  const d = new Date(`${dateISO}T00:00:00`)
  d.setHours(hour)
  return d.toISOString()
}

function makeTrainers(today: string): Trainer[] {
  const slots = (offsets: [number, number][]) => offsets.map(([day, h]) => addHours(addDays(today, day), h))
  return [
    {
      id: "t1",
      name: "Elin Söderberg",
      city: "Stockholm",
      specialties: ["styrkelyft", "hyrox", "viktminskning"],
      bio: "Licensierad PT och tidigare SM-lyftare. Jag bygger program som går att leva med – tunga baslyft, smart volym och kost utan pekpinnar.",
      yearsExperience: 9,
      pricePerSession: 850,
      rating: 4.9,
      coachingMode: "both",
      certifications: ["Licensierad PT (SCA)", "Kostrådgivare", "Hyrox-tränare"],
      isPublished: true,
      reviews: [
        { id: "r1", author: "Sara L.", rating: 5, text: "Gick från 60 till 95 kg i knäböj på ett halvår. Tydliga program och snabb feedback.", date: addDays(today, -20) },
        { id: "r2", author: "Jonas P.", rating: 5, text: "Perfekt inför min första Hyrox. Visste exakt vad jag skulle göra varje dag.", date: addDays(today, -64) },
        { id: "r3", author: "Mira K.", rating: 4, text: "Väldigt kunnig. Ibland lite långa svarstider i helgerna.", date: addDays(today, -120) },
      ],
      availability: slots([[1, 7], [1, 17], [2, 12], [3, 18], [5, 9], [6, 10]]),
    },
    {
      id: "t2",
      name: "Ahmed Rashid",
      city: "Göteborg",
      specialties: ["hyrox", "lopning"],
      bio: "Hyrox Elite-atlet och löpcoach. Specialiserad på kondition och tävlingsförberedelser.",
      yearsExperience: 6,
      pricePerSession: 750,
      rating: 4.8,
      coachingMode: "remote",
      certifications: ["Hyrox Elite", "Löpcoach nivå 2"],
      isPublished: true,
      reviews: [
        { id: "r4", author: "Linnea", rating: 5, text: "Sänkte min Hyrox-tid med 11 minuter.", date: addDays(today, -15) },
        { id: "r5", author: "Erik", rating: 5, text: "Grym på löpteknik.", date: addDays(today, -40) },
      ],
      availability: slots([[1, 6], [2, 6], [4, 17]]),
    },
    {
      id: "t3",
      name: "Johanna Berg",
      city: "Stockholm",
      specialties: ["postnatal", "rehab"],
      bio: "Fysioterapeut och PT. Hjälper dig tillbaka efter graviditet eller skada, steg för steg.",
      yearsExperience: 12,
      pricePerSession: 950,
      rating: 5,
      coachingMode: "onsite",
      certifications: ["Leg. fysioterapeut", "Pre- & postnatal coach"],
      isPublished: true,
      reviews: [
        { id: "r6", author: "Anna", rating: 5, text: "Tryggaste PT jag haft efter förlossningen.", date: addDays(today, -30) },
      ],
      availability: slots([[2, 10], [3, 10], [3, 14]]),
    },
    {
      id: "t4",
      name: "Viktor Lund",
      city: "Malmö",
      specialties: ["kalisthenics", "bodybuilding"],
      bio: "Från första chinsen till muscle-up. Kroppsviktsträning med progression du kan mäta.",
      yearsExperience: 5,
      pricePerSession: 600,
      rating: 4.6,
      coachingMode: "both",
      certifications: ["Kalisthenics-instruktör"],
      isPublished: true,
      reviews: [
        { id: "r7", author: "Oskar", rating: 5, text: "Fick min första muscle-up efter 10 veckor!", date: addDays(today, -22) },
        { id: "r8", author: "Ida", rating: 4, text: "Bra upplägg, appen gjorde det lätt att följa.", date: addDays(today, -80) },
      ],
      availability: slots([[1, 12], [4, 12], [5, 12], [6, 12]]),
    },
    {
      id: "t5",
      name: "Maria Nilsson",
      city: "Uppsala",
      specialties: ["viktminskning", "lopning"],
      bio: "Hållbar viktnedgång genom vanor, styrka och löpning. Kostrådgivare med fokus på vardagsmat.",
      yearsExperience: 8,
      pricePerSession: 700,
      rating: 4.7,
      coachingMode: "both",
      certifications: ["Licensierad PT", "Kostrådgivare"],
      isPublished: true,
      reviews: [
        { id: "r9", author: "Peter", rating: 5, text: "-14 kg på ett år utan att svälta.", date: addDays(today, -50) },
      ],
      availability: slots([[1, 8], [2, 18], [3, 8]]),
    },
    {
      id: "t6",
      name: "David Ek",
      city: "Stockholm",
      specialties: ["styrkelyft", "bodybuilding", "rehab"],
      bio: "Styrka för livet. Jobbar mycket med lyftare som vill komma tillbaka efter rygg- och axelskador.",
      yearsExperience: 15,
      pricePerSession: 1100,
      rating: 4.9,
      coachingMode: "onsite",
      certifications: ["Licensierad PT", "Rehabtränare"],
      isPublished: true,
      reviews: [
        { id: "r10", author: "Kalle", rating: 5, text: "Ryggen håller och marken går upp. Bästa investeringen.", date: addDays(today, -9) },
      ],
      availability: slots([[3, 7], [5, 15]]),
    },
  ]
}

function makeClients(today: string): Client[] {
  const rand = rng(42)
  const weights = (start: number, delta: number, weeks: number) =>
    Array.from({ length: weeks }, (_, i) => ({
      date: addDays(today, -7 * (weeks - 1 - i)),
      kg: Math.round((start + (delta * i) / (weeks - 1) + (rand() - 0.5) * 0.8) * 10) / 10,
    }))

  return [
    { id: "c1", name: "Sara Lindqvist", trainerId: "t1", goal: "Bli starkare – 100 kg knäböj", status: "active", startDate: addDays(today, -84), weightLog: weights(68, 1.5, 12) },
    { id: "c2", name: "Jonas Pettersson", trainerId: "t1", goal: "Hyrox Stockholm under 1:20", status: "active", startDate: addDays(today, -60), weightLog: weights(86, -3, 9) },
    { id: "c3", name: "Mira Karlsson", trainerId: "t1", goal: "Gå ner 8 kg", status: "active", startDate: addDays(today, -120), weightLog: weights(79, -6.5, 12) },
    { id: "c4", name: "Emil Holm", trainerId: "t1", goal: "Första styrkelyftstävlingen", status: "active", startDate: addDays(today, -40), weightLog: weights(92, 0.5, 6) },
    { id: "c5", name: "Fatima Ali", trainerId: "t1", goal: "Komma tillbaka efter knäoperation", status: "paused", startDate: addDays(today, -150), weightLog: weights(64, -1, 10) },
    { id: "c6", name: "Lukas Berg", trainerId: "t1", goal: "Allmän styrka och rörlighet", status: "pending", startDate: today, weightLog: [] },
  ]
}

/** Klona mallens övningar med nya id:n så att varje pass har egna set-loggar. */
function snapshot(tpl: WorkoutTemplate, workoutId: string): WorkoutExercise[] {
  return tpl.exercises.map((e) => ({ ...e, id: `${workoutId}-${e.id}` }))
}

function makeWorkouts(today: string): ScheduledWorkout[] {
  const rand = rng(7)
  const tpl = Object.fromEntries(templates.map((t) => [t.id, t]))
  const rotation = ["tpl-lower", "tpl-upper", "tpl-pull"] as const
  const workouts: ScheduledWorkout[] = []

  // Sara: 3 pass/vecka i 12 veckor med linjär progression. Pass 0 = idag.
  const totalSessions = 36
  for (let i = 0; i < totalSessions + 6; i++) {
    const offset = Math.round((i - totalSessions) * (7 / 3))
    const date = addDays(today, offset)
    const t = tpl[rotation[i % 3]]
    const id = `w-c1-${i}`
    const exercisesSnap = snapshot(t, id)
    const isPast = offset < 0
    const skipped = isPast && rand() < 0.06
    const progress = i / totalSessions // 0 → 1 över perioden

    const logs: SetLog[] = []
    if (isPast && !skipped) {
      for (const e of exercisesSnap) {
        const base = e.targetKg ?? 0
        // Startar ~25 % under mål och passerar det mot slutet.
        const kg = base ? Math.round((base * (0.75 + 0.35 * progress)) / 2.5) * 2.5 : 0
        const reps = parseInt(e.reps) || 10
        for (let s = 0; s < e.sets; s++) {
          logs.push({ workoutExerciseId: e.id, setIndex: s, kg, reps: reps - (s === e.sets - 1 && rand() < 0.3 ? 1 : 0), done: true })
        }
      }
    }

    workouts.push({
      id,
      clientId: "c1",
      templateId: t.id,
      name: t.name,
      date,
      exercises: exercisesSnap,
      status: isPast ? (skipped ? "skipped" : "completed") : "planned",
      logs,
      completedAt: isPast && !skipped ? new Date(`${date}T18:30:00`).toISOString() : undefined,
      clientComment: i === totalSessions - 1 ? "Knäböjen kändes tung idag, sov dåligt. Rumänsk gick bra!" : undefined,
    })
  }

  // Övriga klienter: ett par senaste pass så att PT-översikten har något att visa.
  const others: [string, string, number, boolean?][] = [
    ["c2", "tpl-hyrox", -1],
    ["c2", "tpl-upper", -5, true],
    ["c2", "tpl-lower", -3],
    ["c2", "tpl-hyrox", -8],
    ["c3", "tpl-upper", -2],
    ["c3", "tpl-lower", -6],
    ["c3", "tpl-upper", -9, true],
    ["c3", "tpl-lower", -13, true],
    ["c3", "tpl-upper", -16],
    ["c4", "tpl-pull", 0],
    ["c4", "tpl-lower", -4],
    ["c4", "tpl-upper", -7],
    ["c5", "tpl-lower", -19],
    ["c5", "tpl-upper", -12, true],
  ]
  others.forEach(([clientId, tplId, offset, skipped], idx) => {
    const t = tpl[tplId]
    const id = `w-${clientId}-${idx}`
    const ex = snapshot(t, id)
    const done = offset < 0 && !skipped
    workouts.push({
      id,
      clientId,
      templateId: t.id,
      name: t.name,
      date: addDays(today, offset),
      exercises: ex,
      status: skipped ? "skipped" : done ? "completed" : "planned",
      logs: done
        ? ex.flatMap((e) =>
            Array.from({ length: e.sets }, (_, s) => ({
              workoutExerciseId: e.id,
              setIndex: s,
              kg: e.targetKg ?? 0,
              reps: parseInt(e.reps) || 10,
              done: true,
            }))
          )
        : [],
      completedAt: done ? new Date(`${addDays(today, offset)}T07:15:00`).toISOString() : undefined,
    })
  })

  return workouts
}

function makeNutrition(): NutritionPlan[] {
  return [
    {
      id: "np-c1",
      trainerId: "t1",
      clientId: "c1",
      name: "Uppbyggnad – 2 400 kcal",
      targets: { kcal: 2400, protein: 140, carbs: 280, fat: 80 },
      meals: [
        {
          id: "m1",
          name: "Frukost",
          time: "07:00",
          items: [
            { name: "Havregryn", grams: 80, kcal: 300, protein: 10, carbs: 50, fat: 6 },
            { name: "Kvarg naturell", grams: 250, kcal: 160, protein: 28, carbs: 10, fat: 1 },
            { name: "Blåbär", grams: 100, kcal: 57, protein: 1, carbs: 14, fat: 0 },
          ],
        },
        {
          id: "m2",
          name: "Lunch",
          time: "12:00",
          items: [
            { name: "Kycklingfilé", grams: 150, kcal: 165, protein: 35, carbs: 0, fat: 2 },
            { name: "Jasminris (kokt)", grams: 250, kcal: 325, protein: 6, carbs: 70, fat: 1 },
            { name: "Grönsaker + olivolja", grams: 200, kcal: 160, protein: 3, carbs: 12, fat: 11 },
          ],
        },
        {
          id: "m3",
          name: "Mellanmål före pass",
          time: "16:00",
          items: [
            { name: "Banan", grams: 120, kcal: 107, protein: 1, carbs: 27, fat: 0 },
            { name: "Fullkornsmacka med ost", grams: 80, kcal: 230, protein: 11, carbs: 25, fat: 9 },
          ],
        },
        {
          id: "m4",
          name: "Middag",
          time: "19:00",
          items: [
            { name: "Lax", grams: 150, kcal: 310, protein: 30, carbs: 0, fat: 21 },
            { name: "Potatis", grams: 300, kcal: 231, protein: 6, carbs: 51, fat: 0 },
            { name: "Sallad + fetaost", grams: 150, kcal: 150, protein: 6, carbs: 6, fat: 11 },
          ],
        },
      ],
    },
  ]
}

function makeTrackers(today: string) {
  const rand = rng(99)
  const waterLogs: WaterLog[] = Array.from({ length: 7 }, (_, i) => ({
    clientId: "c1",
    date: addDays(today, -i - 1),
    ml: 1500 + Math.round(rand() * 6) * 250,
  }))
  // Två veckors sömn; de senaste nätterna "från klockan" med steg och score.
  const sleepLogs: SleepLog[] = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, -i)
    const hours = Math.round((6 + rand() * 2.5) * 10) / 10
    const fromWatch = i < 5
    const total = hours * 60
    const deep = Math.round(total * (0.13 + rand() * 0.07))
    const rem = Math.round(total * (0.18 + rand() * 0.06))
    const awake = Math.round(20 + rand() * 25)
    return {
      clientId: "c1",
      date,
      hours,
      quality: fromWatch ? undefined : 2 + Math.round(rand() * 3),
      sleepScore: fromWatch ? Math.round(62 + hours * 3 + rand() * 6) : undefined,
      stages: fromWatch ? { deep, rem, awake, light: Math.max(0, Math.round(total - deep - rem)) } : undefined,
      source: fromWatch ? ("mock" as const) : ("manual" as const),
    }
  })
  const foodEntries: FoodEntry[] = [
    { id: "f-demo-1", clientId: "c1", date: today, name: "Proteinbar", kcal: 210, protein: 20, carbs: 18, fat: 7 },
  ]
  return { waterLogs, sleepLogs, foodEntries }
}

function makeMessages(today: string): Message[] {
  const at = (day: number, h: number, m = 0) => {
    const d = new Date(`${addDays(today, day)}T00:00:00`)
    d.setHours(h, m)
    return d.toISOString()
  }
  return [
    { id: "msg1", threadId: "c1", senderId: "t1", body: "Hej Sara! Nytt block från måndag – vi höjer knäböjen till 4×5. Kör på känsla, RPE 8.", sentAt: at(-8, 9, 12) },
    { id: "msg2", threadId: "c1", senderId: "c1", body: "Låter bra! Ska jag fortsätta med pausböjen på första setet?", sentAt: at(-8, 12, 40) },
    { id: "msg3", threadId: "c1", senderId: "t1", body: "Ja, bara första setet. Filma gärna det sista setet nästa gång så tittar jag på djupet.", sentAt: at(-8, 13, 2) },
    { id: "msg4", threadId: "c1", senderId: "c1", body: "Knäböjen kändes tung idag, sov dåligt. Rumänsk gick bra!", sentAt: at(-2, 19, 5) },
    { id: "msg5", threadId: "c2", senderId: "c2", body: "Wall balls är min svagaste station. Kan vi lägga in mer?", sentAt: at(-1, 8, 30) },
    { id: "msg7", threadId: "c3", senderId: "c3", body: "Vågen visade -0,8 kg den här veckan 🎉", sentAt: at(-2, 7, 50) },
    { id: "msg8", threadId: "c4", senderId: "t1", body: "Grym marklyft igår. Vila från tunga drag till fredag.", sentAt: at(-3, 10) },
  ]
}

export function createSeedData(today = todayISO()): AppData {
  return {
    trainers: makeTrainers(today),
    clients: makeClients(today),
    exercises,
    templates,
    workouts: makeWorkouts(today),
    nutritionPlans: makeNutrition(),
    mealChecks: [],
    messages: makeMessages(today),
    bookings: [],
    ...makeTrackers(today),
    wearables: [],
    // Exempel: Elin har döpt om en övning för Sara.
    exerciseAliases: [{ clientId: "c1", exerciseId: "e-bss", name: "Bulgarisk utfallsböj (bakre fot på låg bänk)" }],
    customFoods: [],
  }
}
