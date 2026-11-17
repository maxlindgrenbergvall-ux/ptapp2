// Enhetstest för AI-videopipelinen (v60) mot en lokal mock av fal.ai och Supabase –
// inga riktiga anrop, ingen kostnad.
//   npx tsx --tsconfig tsconfig.json e2e/ai-videos.unit.ts
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

let failed = 0
const check = (cond: boolean, msg: string, extra?: unknown) => {
  console.log(cond ? "ok  " : "FAIL", msg, cond || extra === undefined ? "" : JSON.stringify(extra).slice(0, 300))
  if (!cond) failed++
}

const calls: { method: string; url: string; headers: Record<string, string | string[] | undefined>; body: string }[] = []
const server = createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    const url = req.url ?? ""
    calls.push({ method: req.method ?? "", url, headers: req.headers, body })
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const send = (code: number, data: unknown, type = "application/json") => {
      res.writeHead(code, { "content-type": type })
      res.end(typeof data === "string" || data instanceof Uint8Array ? data : JSON.stringify(data))
    }
    if (req.method === "POST" && url.startsWith("/fal/")) return send(200, { request_id: "r1", status_url: `${base}/q/status`, response_url: `${base}/q/result` })
    if (url === "/q/status") return send(200, { status: "COMPLETED" })
    if (url === "/q/result") return send(200, { video: { url: `${base}/files/out.mp4` } })
    if (url === "/files/out.mp4") return send(200, new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), "video/mp4")
    if (url.startsWith("/rest/v1/exercises?select=")) return send(200, [{ id: "e-bench", video_url: "https://x/storage/v1/object/public/exercise-guides/e-bench.mp4" }])
    if (req.method === "POST" && url.startsWith("/storage/v1/object/exercise-guides/")) return send(200, { Key: url })
    if (req.method === "PATCH" && url.startsWith("/rest/v1/exercises?id=eq.")) return send(204, "")
    send(404, { error: url })
  })
})
void (async () => {
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
Object.assign(process.env, {
  SUPABASE_URL: base,
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  FAL_KEY: "fal-test",
  FAL_API_BASE: `${base}/fal`,
  FAL_POLL_MS: "1",
  GUIDE_REFERENCE_IMAGE_URL: "https://cdn.example/coavira-model.png",
})
const { main, CHARACTER_PROMPT, LOCKED_SEED, parseArgs, promptFor } = await import("../scripts/generate-ai-exercise-videos")

// Torrkörning: inga anrop.
const dry = await main(["--only", "e-squat"])
check(calls.length === 0 && dry.generated.length === 0, "utan --yes görs inga anrop (gratis torrkörning)")
check(parseArgs(["--yes", "--limit", "5", "--only", "a,b"]).limit === 5 && parseArgs(["--yes"]).only === null, "argumenten tolkas")

// Riktig körning mot mocken: två nya, en som redan har video hoppas över.
const res = await main(["--yes", "--only", "e-squat,e-sledpush,e-bench"])
check(res.generated.join() === "e-squat,e-sledpush" && res.skipped.join() === "e-bench" && res.failed.length === 0, "två videor genereras, övningen med video hoppas över", res)
const falCalls = calls.filter((c) => c.method === "POST" && c.url.startsWith("/fal/"))
const bodies = falCalls.map((c) => JSON.parse(c.body))
check(falCalls.length === 2 && falCalls.every((c) => c.headers.authorization === "Key fal-test"), "fal.ai anropas med nyckeln")
check(bodies.every((b) => b.image_url === "https://cdn.example/coavira-model.png" && b.seed === LOCKED_SEED), "samma låsta referensbild och seed för alla övningar")
check(bodies.every((b) => b.prompt.startsWith(CHARACTER_PROMPT)), "samma karaktärsprompt för alla övningar")
check(bodies[1].prompt.includes("Sled Push") && bodies[1].prompt.includes("short, powerful steps"), "prompten beskriver övningens rörelse")
const uploads = calls.filter((c) => c.method === "POST" && c.url.startsWith("/storage/"))
check(uploads.map((u) => u.url).join() === "/storage/v1/object/exercise-guides/e-squat.mp4,/storage/v1/object/exercise-guides/e-sledpush.mp4", "MP4 laddas upp till exercise-guides/<id>.mp4", uploads.map((u) => u.url))
check(uploads.every((u) => u.headers["content-type"] === "video/mp4" && u.headers.authorization === "Bearer service-test"), "uppladdningen görs med service role (inte en användarnyckel)")
const patches = calls.filter((c) => c.method === "PATCH")
check(patches.length === 2 && JSON.parse(patches[0].body).video_url === `${base}/storage/v1/object/public/exercise-guides/e-squat.mp4`, "exercises.video_url sätts till den publika guide-URL:en")
check(!promptFor({ id: "e-run", name: "Running", equipment: "—" }).includes("undefined"), "prompten för löpning är komplett")

server.close()
if (failed) {
  console.log(`${failed} fel`)
  process.exit(1)
}
console.log("AI-PIPELINEN GODKÄND")
})()
