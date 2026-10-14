// Skapar en Y4M-video med en EAN-13-streckkod, för Chromiums falska kamera
// (--use-file-for-fake-video-capture). Testar hela kedjan kamera → zxing → uppslag.
//   node e2e/make-barcode-video.mjs 7310865004703 out.y4m
import fs from "node:fs"

const [code = "7310865004703", out = "barcode.y4m"] = process.argv.slice(2)
const W = 640, H = 480
// EAN-13: startmarkör, 6 siffror (L/G efter paritet från första siffran), mitt, 6 siffror (R), stopp.
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"]
const G = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).reverse().join(""))
const R = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""))
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"]
const d = code.split("").map(Number)
let bits = "000000000" + "101" // tyst zon + start
for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === "L" ? L : G)[d[i]]
bits += "01010"
for (let i = 7; i <= 12; i++) bits += R[d[i]]
bits += "101" + "000000000"
const matrix = { getWidth: () => bits.length, get: (x) => bits[x] === "1" }
const scale = Math.floor((W * 0.8) / matrix.getWidth())
const bw = matrix.getWidth() * scale, bh = 180
const x0 = Math.floor((W - bw) / 2), y0 = Math.floor((H - bh) / 2)

const Y = Buffer.alloc(W * H, 235) // nästan vit bakgrund
for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
  if (matrix.get(Math.floor(x / scale))) Y[(y0 + y) * W + x0 + x] = 16
}
const UV = Buffer.alloc((W / 2) * (H / 2), 128)
const frames = 30
const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`)]
for (let i = 0; i < frames; i++) parts.push(Buffer.from("FRAME\n"), Y, UV, UV)
fs.writeFileSync(out, Buffer.concat(parts))
console.log(`wrote ${out} (${code})`)
