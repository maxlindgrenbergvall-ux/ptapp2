/**
 * Uppskatta makron ur ingredienserna när receptsidan saknar näringsvärden (v25).
 * Varje ingrediens matchas mot livsmedelsbasen (engelska namn översätts först),
 * och makrona räknas ur vikten. Kryddor, salt och vatten räknas som 0 kcal.
 */
import { FOOD_LIBRARY } from "@/lib/food-library"
import { normalize, searchLibrary } from "@/lib/food-search"
import { macrosFor } from "@/lib/nutrition/meal-items"
import type { MealItem, Per100 } from "@/types/domain"

type LibraryFood = (typeof FOOD_LIBRARY)[number]

/** Engelska ingredienser → livsmedelsbasens namn. Mer specifika först. */
const EN_SV: [RegExp, string][] = [
  [/egg whites?/, "Äggvita"],
  [/\beggs?\b/, "Ägg"],
  [/buttermilk/, "Filmjölk 3 %"],
  [/skim milk|fat[- ]free milk|nonfat milk/, "Lättmjölk 0,5 %"],
  [/low[- ]fat milk|2 ?% milk|semi[- ]skimmed milk/, "Mellanmjölk 1,5 %"],
  [/coconut milk/, "Kokosmjölk"],
  [/oat milk|almond milk/, "Havredryck"],
  [/soy milk/, "Sojadryck"],
  [/(^|\s)milk\b(?! chocolate)/, "Mjölk 3 %"],
  [/greek yog(h)?urt/, "Grekisk yoghurt 10 %"],
  [/yog(h)?urt/, "Naturell yoghurt 3 %"],
  [/skyr/, "Skyr naturell"],
  [/quark/, "Kvarg naturell"],
  [/cottage cheese/, "Keso 4 %"],
  [/cream cheese/, "Färskost"],
  [/parmesan|parmigiano/, "Parmesan"],
  [/mozzarella/, "Mozzarella"],
  [/feta/, "Fetaost"],
  [/halloumi/, "Halloumi"],
  [/cheddar|cheese/, "Hårdost 28 %"],
  [/sour cream/, "Gräddfil 12 %"],
  [/cr[eè]me fra[iî]che/, "Crème fraiche 34 %"],
  [/heavy cream|whipping cream|double cream/, "Vispgrädde 40 %"],
  [/(^|\s)cream\b/, "Matlagningsgrädde 15 %"],
  [/peanut butter/, "Jordnötssmör"],
  [/almond butter/, "Mandelsmör"],
  [/(^|\s)butter\b/, "Smör"],
  [/ground chicken|chicken mince/, "Kycklingfärs"],
  [/chicken thighs?/, "Kycklinglårfilé"],
  [/chicken/, "Kycklingfilé"],
  [/turkey/, "Kalkonfilé"],
  [/lean ground beef|extra[- ]lean/, "Nötfärs 5 %"],
  [/ground beef|minced beef|beef mince/, "Nötfärs 10 %"],
  [/steak|sirloin|rib ?eye|beef/, "Ryggbiff / entrecôte"],
  [/pork tenderloin/, "Fläskfilé"],
  [/pork chops?/, "Fläskkotlett"],
  [/bacon/, "Bacon"],
  [/ground lamb|lamb mince/, "Lammfärs"],
  [/salmon/, "Lax"],
  [/(^|\s)cod\b/, "Torsk"],
  [/tuna/, "Tonfisk i vatten (konserv)"],
  [/shrimps?|prawns?/, "Räkor (skalade)"],
  [/tofu/, "Tofu"],
  [/tempeh/, "Tempeh"],
  [/chickpeas?|garbanzo/, "Kikärtor (kokta)"],
  [/black beans?/, "Svarta bönor (kokta)"],
  [/kidney beans?/, "Kidneybönor (kokta)"],
  [/lentils?/, "Röda linser (kokta)"],
  [/edamame/, "Edamamebönor"],
  [/(^|\s)peas\b/, "Gröna ärtor"],
  [/rolled oats|(^|\s)oats\b|oatmeal/, "Havregryn"],
  [/granola/, "Granola"],
  [/whole ?(wheat|grain) bread/, "Fullkornsbröd"],
  [/(^|\s)bread\b/, "Vitt formbröd"],
  [/tortillas?|wraps?/, "Tortillabröd"],
  [/bagels?/, "Bagel"],
  [/flour/, "Mjöl (vetemjöl)"],
  [/cooked (brown )?rice/, "Jasminris (kokt)"],
  [/(^|\s)rice\b/, "Jasminris (okokt)"],
  [/cooked (pasta|spaghetti|penne|macaroni)/, "Pasta (kokt)"],
  [/pasta|spaghetti|penne|macaroni|fusilli|linguine/, "Pasta (okokt)"],
  [/cooked quinoa/, "Quinoa (kokt)"],
  [/cooked couscous/, "Couscous (kokt)"],
  [/noodles/, "Äggnudlar (kokta)"],
  [/sweet potato/, "Sötpotatis (kokt)"],
  [/potato/, "Potatis (kokt)"],
  [/broccoli/, "Broccoli"],
  [/cauliflower/, "Blomkål"],
  [/spinach/, "Spenat"],
  [/lettuce|romaine/, "Sallad (isberg)"],
  [/arugula|rocket/, "Ruccola"],
  [/cucumber/, "Gurka"],
  [/cherry tomato/, "Körsbärstomater"],
  [/crushed tomato|diced tomato|canned tomato/, "Krossade tomater"],
  [/tomato sauce|marinara|passata/, "Tomatsås (pastasås)"],
  [/tomato/, "Tomat"],
  [/bell peppers?|sweet peppers?|red peppers?|green peppers?/, "Paprika"],
  [/carrots?/, "Morot"],
  [/red onion/, "Rödlök"],
  [/onion|shallot/, "Lök (gul)"],
  [/garlic/, "Vitlök"],
  [/zucchini|courgette/, "Zucchini"],
  [/eggplant|aubergine/, "Aubergine"],
  [/mushrooms?/, "Champinjoner"],
  [/green beans?/, "Haricots verts"],
  [/(^|\s)corn\b/, "Majs (konserv)"],
  [/cabbage/, "Vitkål"],
  [/kale/, "Grönkål"],
  [/avocado/, "Avokado"],
  [/asparagus/, "Sparris"],
  [/celery/, "Selleri (blek)"],
  [/bananas?/, "Banan"],
  [/apples?/, "Äpple"],
  [/pears?/, "Päron"],
  [/orange juice/, "Apelsinjuice"],
  [/oranges?/, "Apelsin"],
  [/kiwi/, "Kiwi"],
  [/grapes/, "Vindruvor"],
  [/mango/, "Mango"],
  [/pineapple/, "Ananas"],
  [/blueberr/, "Blåbär"],
  [/raspberr/, "Hallon"],
  [/strawberr/, "Jordgubbar"],
  [/berries/, "Frysta bär (blandade)"],
  [/dates?\b/, "Dadlar (torkade)"],
  [/raisins/, "Russin"],
  [/almonds?/, "Mandlar"],
  [/cashews?/, "Cashewnötter"],
  [/walnuts?|pecans?/, "Valnötter"],
  [/peanuts?/, "Jordnötter (rostade, saltade)"],
  [/chia/, "Chiafrön"],
  [/flax/, "Linfrö"],
  [/sesame/, "Sesamfrön"],
  [/pumpkin seeds?|pepitas/, "Pumpakärnor"],
  [/sunflower seeds?/, "Solroskärnor"],
  [/olive oil/, "Olivolja"],
  [/coconut oil/, "Kokosolja"],
  [/(vegetable|canola|rapeseed|sunflower|avocado) oil|(^|\s)oil\b/, "Rapsolja"],
  [/mayo(nnaise)?/, "Majonnäs"],
  [/ketchup/, "Ketchup"],
  [/mustard/, "Senap"],
  [/pesto/, "Pesto"],
  [/hummus/, "Hummus"],
  [/honey|maple syrup|agave/, "Honung"],
  [/sugar/, "Socker"],
  [/jam|preserves/, "Sylt"],
  [/dark chocolate/, "Mörk choklad 70 %"],
  [/chocolate/, "Mjölkchoklad"],
  [/protein powder|whey/, "Proteinpulver (vassle)"],
]

/** Ingredienser utan nämnvärd energi (räknas som matchade med 0 kcal). */
const NEGLIGIBLE =
  /(^|\s)(salt|black pepper|white pepper|ground pepper|pepper to taste|peppar|svartpeppar|vitpeppar|water|vatten|ice|spices?|kryddor|herbs?|örter|basil|basilika|oregano|thyme|timjan|rosemary|rosmarin|parsley|persilja|cilantro|koriander|dill|cumin|spiskummin|paprika powder|smoked paprika|paprikapulver|chili flakes|red pepper flakes|chiliflakes|chili powder|cayenne|cinnamon|kanel|nutmeg|muskot|ginger|ingefära|bay leaf|bay leaves|lagerblad|vanilla|vanilj|baking powder|baking soda|bakpulver|bikarbonat|yeast|jäst|vinegar|vinäger|ättika|lemon juice|lime juice|citronsaft|limesaft|zest|skal|broth|stock|buljong|fond|garlic powder|onion powder|soy sauce|sojasås|fish sauce|hot sauce|worcestershire|cooking spray)\b/i

export function isNegligible(name: string): boolean {
  const n = name.toLowerCase()
  if (/bell pepper|sweet pepper|red pepper(?! flakes)|green pepper|peppers\b/.test(n)) return false
  return NEGLIGIBLE.test(n)
}

const BY_NAME = new Map(FOOD_LIBRARY.map((f) => [f.name, f]))
const DESCRIPTORS =
  /\b(fresh|freshly|chopped|finely|roughly|diced|minced|sliced|thinly|shredded|grated|large|medium|small|boneless|skinless|organic|raw|uncooked|dry|dried|frozen|canned|packed|lightly|divided|optional|to taste|plus more|for serving|for garnish|about|approximately|hackad|finhackad|grovhackad|skivad|riven|strimlad|färsk|färska|fryst|frysta|ca|cirka)\b/gi

/** Rensat namn för sökning: utan parenteser, beskrivningar och skiljetecken. */
export function searchName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .split(/,| – | - /)[0]
    .replace(DESCRIPTORS, " ")
    .replace(/[^\p{L}\s%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Matcha en ingrediens mot livsmedelsbasen. */
export function matchFood(name: string): LibraryFood | undefined {
  const clean = searchName(name).toLowerCase()
  // Kryddor, salt och vatten matchas aldrig (annars kan "salt" bli "saltade jordnötter").
  if (!clean || isNegligible(clean)) return undefined
  for (const [re, sv] of EN_SV) if (re.test(clean)) return BY_NAME.get(sv)
  const direct = searchLibrary(clean, 1)[0]
  if (direct) return direct
  // Varje ord för sig (längst först), sedan svenska sammansättningar:
  // "vitlöksklyftor" → Vitlök, "kycklingbröstfilé" → Kycklingfilé.
  const words = clean.split(" ").filter((w) => w.length >= 3).sort((a, b) => b.length - a.length)
  for (const w of words) {
    const hit = searchLibrary(w, 1)[0]
    if (hit) return hit
  }
  let best: LibraryFood | undefined
  let bestLen = 0
  for (const w of words.map(normalize)) {
    for (const f of FOOD_LIBRARY) {
      const first = normalize(f.name).split(" ")[0]
      if (first.length >= 4 && first.length > bestLen && w.startsWith(first)) {
        best = f
        bestLen = first.length
      }
    }
  }
  return best
}

export interface Estimate {
  items: MealItem[]
  /** Totalt för hela receptet. */
  total: { kcal: number; protein: number; carbs: number; fat: number }
  /** Andel av ingrediensvikten (utan kryddor) som kunde matchas, 0–1. */
  coverage: number
  matched: number
  quantified: number
}

/**
 * Lägg på makron (och värden per 100 g, så att raden kan ändras i
 * receptredigeraren) för alla ingredienser som går att matcha.
 */
export function estimateMacros(items: MealItem[]): Estimate {
  let weighed = 0
  let matchedWeight = 0
  let matched = 0
  let quantified = 0
  const out = items.map((item) => {
    if (!item.grams || isNegligible(item.name)) return item
    quantified += 1
    weighed += item.grams
    const food = matchFood(item.name)
    if (!food) return item
    matched += 1
    matchedWeight += item.grams
    const per100: Per100 = food.per100
    return { ...item, per100, ...macrosFor(per100, item.grams) }
  })
  const total = out.reduce((s, i) => ({ kcal: s.kcal + i.kcal, protein: s.protein + i.protein, carbs: s.carbs + i.carbs, fat: s.fat + i.fat }), {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  })
  return { items: out, total, coverage: weighed ? matchedWeight / weighed : 0, matched, quantified }
}

/** Räcker matchningen för att lita på uppskattningen? */
export const isReliable = (e: Estimate) => e.matched > 0 && e.total.kcal > 50 && e.coverage >= 0.7 && e.matched / Math.max(1, e.quantified) >= 0.5
