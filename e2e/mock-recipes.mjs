// Låtsas-receptsajter för e2e (v25): http://localhost:54700
//   /us-chicken-bowl   JSON-LD i @graph, amerikanska mått, näringsvärden per portion
//   /svensk-gryta      JSON-LD, svenska mått, utan näringsvärden (makron uppskattas)
//   /no-macros         recept utan näringsvärden och med okända ingredienser (avvisas)
//   /microdata         bara HTML-microdata (itemprop), med näringsvärden
//   /no-recipe         vanlig sida utan recept
//   /redirect-internal omdirigerar till en intern adress (SSRF-skyddet ska stoppa)
//   /img/*.svg         receptbilder
import http from "node:http"

const page = (title, head, body = "") =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${head}</head><body><h1>${title}</h1>${body}</body></html>`
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`

const PAGES = {
  "/us-chicken-bowl": page(
    "High-Protein Chicken &amp; Rice Bowl",
    ld({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Bowl" },
        {
          "@type": ["Recipe"],
          name: "High-Protein Chicken &amp; Rice Bowl",
          image: [{ "@type": "ImageObject", url: "/img/bowl.svg" }],
          recipeYield: ["4", "4 servings"],
          prepTime: "PT10M",
          cookTime: "PT15M",
          recipeIngredient: [
            "1 1/2 cups uncooked white rice",
            "1 lb boneless skinless chicken breast",
            "2 tbsp olive oil",
            "1 cup low-sodium chicken broth",
            "2 cups broccoli florets",
            "½ tsp salt",
          ],
          recipeInstructions: [
            { "@type": "HowToSection", name: "Rice", itemListElement: [{ "@type": "HowToStep", text: "Cook the rice according to the package." }] },
            { "@type": "HowToStep", text: "Preheat the oven to 400°F and line a 9x13-inch pan." },
            { "@type": "HowToStep", text: "Roast the chicken for 20 minutes, then slice into strips." },
          ],
          nutrition: { "@type": "NutritionInformation", calories: "520 calories", proteinContent: "45 g", carbohydrateContent: "55g", fatContent: "12 g" },
        },
      ],
    })
  ),
  "/svensk-gryta": page(
    "Snabb kycklinggryta",
    ld({
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Snabb kycklinggryta",
      image: "http://localhost:54700/img/gryta.svg",
      recipeYield: "4 portioner",
      totalTime: "PT15M",
      recipeIngredient: ["600 g kycklingfilé", "1 gul lök", "2 vitlöksklyftor", "1 burk krossade tomater (400 g)", "2 dl matlagningsgrädde", "1 msk rapsolja", "1 tsk salt"],
      recipeInstructions: "1. Hacka löken och vitlöken.\n2. Bryn kycklingen i oljan.\n3. Häll på tomater och grädde och låt koka 10 minuter.",
    })
  ),
  "/no-macros": page(
    "Galaktisk gryta",
    ld({
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Galaktisk gryta",
      recipeYield: "2",
      recipeIngredient: ["2 cups zorblax", "1 lb quuxberry paste", "3 tbsp flurp"],
      recipeInstructions: ["Mix everything."],
    })
  ),
  "/microdata": page(
    "Overnight Oats",
    '<meta property="og:image" content="/img/oats.svg">',
    `<div itemscope itemtype="https://schema.org/Recipe">
      <span itemprop="name">Protein Overnight Oats</span>
      <meta itemprop="recipeYield" content="1">
      <meta itemprop="totalTime" content="PT5M">
      <ul><li itemprop="recipeIngredient">1/2 cup rolled oats</li><li itemprop="recipeIngredient">3/4 cup Greek yogurt</li><li itemprop="recipeIngredient">1/2 cup blueberries</li></ul>
      <div itemprop="recipeInstructions"><ol><li>Mix oats and yogurt.</li><li>Top with blueberries and chill overnight.</li></ol></div>
      <div itemprop="nutrition" itemscope itemtype="https://schema.org/NutritionInformation">
        <span itemprop="calories">410 kcal</span><span itemprop="proteinContent">28 g</span>
        <span itemprop="carbohydrateContent">52 g</span><span itemprop="fatContent">9 g</span>
      </div>
    </div>`
  ),
  "/no-recipe": page("Om oss", "", "<p>Ingen mat här.</p>"),
}

const svg = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${color}"/><circle cx="400" cy="300" r="180" fill="#fff" opacity=".6"/></svg>`

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    if (url.pathname === "/redirect-internal") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" })
      return res.end()
    }
    if (url.pathname.startsWith("/img/")) {
      res.writeHead(200, { "content-type": "image/svg+xml" })
      return res.end(svg(url.pathname.includes("bowl") ? "#e8a24a" : url.pathname.includes("gryta") ? "#c0533a" : "#8fb0d8"))
    }
    const html = PAGES[url.pathname]
    if (!html) {
      res.writeHead(404, { "content-type": "text/html" })
      return res.end("<h1>404</h1>")
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(html)
  })
  .listen(54700, () => console.log("mock-recipes på http://localhost:54700"))
