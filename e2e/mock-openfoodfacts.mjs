// Låtsas-Open Food Facts för e2e: produktuppslag och sökning med fasta fixtures.
//   node e2e/mock-openfoodfacts.mjs   (port 54400)
// Starta appen med OPENFOODFACTS_BASE_URL=http://localhost:54400
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
    nutriments: { energy_100g: 314, proteins_100g: 10, carbohydrates_100g: 6.5, fat_100g: 1.3 },
  },
  // Utan näringsvärden: ska behandlas som "saknas".
  "7300400481588": { code: "7300400481588", product_name: "Okänd produkt", nutriments: {} },
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(body))
    }
    const m = url.pathname.match(/^\/api\/v2\/product\/(\d+)\.json$/)
    if (m) {
      const p = products[m[1]]
      return p ? send(200, { status: 1, product: p }) : send(404, { status: 0, status_verbose: "product not found" })
    }
    if (url.pathname === "/cgi/search.pl") {
      const q = (url.searchParams.get("search_terms") ?? "").toLowerCase()
      const hits = Object.values(products).filter((p) => `${p.product_name ?? p.product_name_sv} ${p.brands}`.toLowerCase().includes(q))
      return send(200, { count: hits.length, products: hits })
    }
    send(404, {})
  })
  .listen(54400, () => console.log("mock openfoodfacts :54400"))
