import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Coavira som native app (iOS/Android) via Capacitor.
 *
 * Appen använder SSR, API-routes (Stripe, livsmedel), auth-callbacks och
 * proxy.ts – den kan inte exporteras statiskt. Därför laddar appen den
 * driftsatta webbtjänsten (Vercel) i en native WebView. Webben byggs och
 * driftsätts exakt som förut; Capacitor påverkar inte Next.js-bygget.
 *
 * Adressen styrs av CAPACITOR_SERVER_URL när man kör `npx cap sync`:
 *  - produktion:  CAPACITOR_SERVER_URL=https://<er-produktionsdomän>
 *  - lokalt:      CAPACITOR_SERVER_URL=http://<datorns-ip>:3000  (telefon/emulator mot `npm run dev`)
 *
 * Utan nätverk visas reservsidan mobile/www/offline.html.
 */
const DEFAULT_SERVER_URL = "https://ptapp2.vercel.app"

const serverUrl = (process.env.CAPACITOR_SERVER_URL?.trim() || DEFAULT_SERVER_URL).replace(/\/+$/, "")
const isLocal = serverUrl.startsWith("http://")

if (!/^https?:\/\/[^/\s]+/.test(serverUrl)) {
  throw new Error(`CAPACITOR_SERVER_URL är ogiltig: "${serverUrl}"`)
}

const config: CapacitorConfig = {
  appId: "com.coavira.app",
  appName: "Coavira",
  // Lokala filer i appen: bara reserv-/offlinesidan. Själva appen laddas från serverUrl.
  webDir: "mobile/www",
  // Låter webbappen känna igen att den körs i native-appen (t.ex. för push och inloggning senare).
  appendUserAgent: "CoaviraApp",
  backgroundColor: "#ffffff",
  server: {
    url: serverUrl,
    // Klartext (http) bara mot en lokal utvecklingsserver, aldrig i produktion.
    cleartext: isLocal,
    errorPath: "offline.html",
  },
  ios: {
    contentInset: "never",
    // Inga länkförhandsvisningar som "läcker" ut ur appen vid långtryck.
    allowsLinkPreview: false,
  },
  android: {
    // Felsökning av WebView via chrome://inspect bara i debug-byggen.
    webContentsDebuggingEnabled: isLocal,
  },
}

export default config
