// Skapar appens lokala reservsidor i mobile/www (körs före `cap sync`).
// Själva appen laddas från CAPACITOR_SERVER_URL; de här sidorna visas bara
// en kort stund vid start eller när telefonen saknar nätverk.
import fs from "node:fs"

const url = (process.env.CAPACITOR_SERVER_URL?.trim() || "https://coavira.fit").replace(/\/+$/, "")
const dir = new URL("../mobile/www/", import.meta.url)
fs.mkdirSync(dir, { recursive: true })

const page = (title, body) => `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Coavira</title>
<style>
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #111827; --muted: #6b7280; --brand: #16a34a; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0b0f0d; --fg: #f3f4f6; --muted: #9ca3af; --brand: #4ade80; } }
  html, body { height: 100%; margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)); text-align: center; box-sizing: border-box; }
  .logo { width: 56px; height: 56px; border-radius: 16px; background: var(--brand); color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; }
  h1 { font-size: 20px; margin: 4px 0 0; }
  p { margin: 0; color: var(--muted); max-width: 320px; }
  button { margin-top: 8px; border: 0; border-radius: 12px; padding: 12px 20px; font: inherit; font-weight: 600;
    background: var(--brand); color: #fff; }
</style>
</head>
<body><main><div class="logo">C</div><h1>${title}</h1>${body}</main></body>
</html>
`

const retry = `<script>
  const url = ${JSON.stringify(url)};
  document.querySelector("button").addEventListener("click", () => location.replace(url));
  window.addEventListener("online", () => location.replace(url));
</script>`

fs.writeFileSync(new URL("index.html", dir), page("Coavira", `<p>Startar…</p><script>location.replace(${JSON.stringify(url)})</script>`))
fs.writeFileSync(
  new URL("offline.html", dir),
  page("Ingen anslutning", `<p>Coavira behöver internet. Kontrollera wifi eller mobildata och försök igen.</p><button type="button">Försök igen</button>${retry}`)
)
console.log(`[coavira] mobile/www skapad för ${url}`)
