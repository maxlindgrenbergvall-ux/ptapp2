// Låtsas-Open Food Facts för e2e: produktuppslag och sökning med fasta fixtures.
//   node e2e/mock-openfoodfacts.mjs   (port 54400)
// Starta appen med OPENFOODFACTS_BASE_URL=http://localhost:54400
//
// Fixturerna är TESTDATA (påhittade streckkoder och avrundade värden), inte
// riktiga produktdata. Sökningen stöder samma filter som appen använder:
// countries (sweden) och brands, och alla anrop loggas på /__log.
import http from "node:http"

const products = {
  "7310865004703": {
    code: "7310865004703",
    product_name: "Mellanmjölk 1,5 %",
    brands: "Arla",
    serving_quantity: 250,
    nutriments: { "energy-kcal_100g": 46, proteins_100g: 3.5, carbohydrates_100g: 4.8, fat_100g: 1.5 },
  },
  "7311070347394": {
    code: "7311070347394",
    product_name_sv: "Proteinpudding Choklad",
    brands: "Gainomax",
    serving_quantity: 200,
    countries_tags: ["en:sweden"],
    nutriments: { energy_100g: 314, proteins_100g: 10, carbohydrates_100g: 6.5, fat_100g: 1.3 },
  },
  // Svenska butiksvaror (testdata)
  "7350000000016": {
    code: "7350000000016",
    product_name: "Protein Bar Cookies & Cream",
    brands: "Barebells",
    quantity: "55 g",
    countries_tags: ["en:sweden", "en:norway"],
    image_front_small_url: "https://images.example.test/barebells.jpg",
    nutriments: { "energy-kcal_100g": 360, proteins_100g: 36, carbohydrates_100g: 33, fat_100g: 13 },
  },
  "7350000000023": {
    code: "7350000000023",
    product_name: "BCAA Caribbean",
    brands: "Nocco",
    quantity: "33 cl",
    categories_tags: ["en:beverages", "en:energy-drinks"],
    countries_tags: ["en:sweden"],
    nutriments: { "energy-kcal_100g": 1, proteins_100g: 0.5, carbohydrates_100g: 0, fat_100g: 0 },
  },
  "7350000000030": {
    code: "7350000000030",
    product_name_sv: "Coca-Cola Zero",
    brands: "Coca-Cola",
    quantity: "330 ml",
    product_quantity_unit: "ml",
    countries_tags: ["en:sweden"],
    nutriments: { "energy-kj_100g": 1, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 },
  },
  "5000000000012": {
    code: "5000000000012",
    product_name: "Cola Classic (import)",
    brands: "Coca-Cola",
    quantity: "355 ml",
    countries_tags: ["en:united-states"],
    nutriments: { "energy-kcal_100g": 42, carbohydrates_100g: 10.6 },
  },
  "7350000000047": {
    code: "7350000000047",
    product_name: "Pommes Frites",
    brands: "Felix",
    quantity: "750 g",
    countries_tags: ["en:sweden"],
    nutriments: { "energy-kcal_100g": 150, proteins_100g: 2.4, carbohydrates_100g: 23, fat_100g: 5 },
  },
  // Lagrad som EAN-13 med inledande nolla; skannas som UPC-A 036000291452.
  "0036000291452": {
    code: "0036000291452",
    product_name: "Jordnötssmör (import)",
    brands: "Importvaror",
    nutriments: { "energy-kcal_100g": 590, proteins_100g: 24, carbohydrates_100g: 16, fat_100g: 49 },
  },
  // Utan näringsvärden: ska behandlas som "saknas".
  "7300400481588": { code: "7300400481588", product_name: "Okänd produkt", nutriments: {} },
}

const slug = (s = "") =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const log = []

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(body))
    }
    if (url.pathname === "/__log") return send(200, log)
    if (url.pathname === "/__reset") {
      log.length = 0
      return send(200, {})
    }
    log.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), ua: req.headers["user-agent"] })
    const m = url.pathname.match(/^\/api\/v2\/product\/(\d+)\.json$/)
    if (m) {
      const p = products[m[1]]
      return p ? send(200, { status: 1, product: p }) : send(404, { status: 0, status_verbose: "product not found" })
    }
    if (url.pathname === "/cgi/search.pl") {
      const q = (url.searchParams.get("search_terms") ?? "").toLowerCase().trim()
      const filters = []
      for (let i = 0; i < 3; i++) {
        const type = url.searchParams.get(`tagtype_${i}`)
        if (type) filters.push({ type, tag: url.searchParams.get(`tag_${i}`) })
      }
      const hits = Object.values(products).filter((p) => {
        const text = `${p.product_name ?? ""} ${p.product_name_sv ?? ""} ${p.brands ?? ""}`.toLowerCase()
        if (q && !q.split(/\s+/).every((w) => text.includes(w))) return false
        return filters.every((f) =>
          f.type === "countries" ? (p.countries_tags ?? []).includes(`en:${f.tag}`) : f.type === "brands" ? slug(p.brands) === f.tag : true
        )
      })
      return send(200, { count: hits.length, products: hits })
    }
    send(404, {})
  })
  .listen(54400, () => console.log("mock openfoodfacts :54400"))
