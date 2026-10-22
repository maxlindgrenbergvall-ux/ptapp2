import type { CapacitorConfig } from "@capacitor/cli"

/**
 * Coavira som native app (iOS/Android) via Capacitor.
 *
 * Appen använder SSR, API-routes (Stripe, livsmedel), auth-callbacks och
 * proxy.ts – den kan inte exporteras statiskt. Därför laddar appen den
 * driftsatta webbtjänsten (Vercel) i en native WebView. Webben byggs och
 * driftsätts exakt som förut; Capacitor påverkar inte Next.js-bygget.
 *
 * Appen laddar appdomänen (APP_URL, https://ptapp2.vercel.app) – inte
 * coavira.fit, som bara är landningssidan. Adressen styrs av
 * CAPACITOR_SERVER_URL när man kör `npx cap sync`:
 *  - produktion:  CAPACITOR_SERVER_URL=https://<appens-domän>
 *  - lokalt:      CAPACITOR_SERVER_URL=http://<datorns-ip>:3000  (telefon/emulator mot `npm run dev`)
 *
 * Utan nätverk visas reservsidan mobile/www/offline.html.
 */
const DEFAULT_SERVER_URL = "https://ptapp2.vercel.app"

const serverUrl = (process.env.CAPACITOR_SERVER_URL?.trim() || DEFAULT_SERVER_URL).replace(/\/+$/, "")
const isLocal = serverUrl.startsWith("http://")
// Push kräver Firebase (google-services.json) på Android och APNs på iOS.
// Bygget sätter COAVIRA_PUSH=1 bara när de finns; webbappen läser flaggan ur
// user agent ("CoaviraPush") och försöker annars aldrig registrera push.
const pushEnabled = process.env.COAVIRA_PUSH === "1"

if (!/^https?:\/\/[^/\s]+/.test(serverUrl)) {
  throw new Error(`CAPACITOR_SERVER_URL är ogiltig: "${serverUrl}"`)
}

const config: CapacitorConfig = {
  appId: "com.coavira.app",
  appName: "Coavira",
  // Lokala filer i appen: bara reserv-/offlinesidan. Själva appen laddas från serverUrl.
  webDir: "mobile/www",
  // Låter webbappen känna igen att den körs i native-appen (inloggning, push).
  appendUserAgent: pushEnabled ? "CoaviraApp CoaviraPush" : "CoaviraApp",
  backgroundColor: "#ffffff",
  server: {
    url: serverUrl,
    // Klartext (http) bara mot en lokal utvecklingsserver, aldrig i produktion.
    cleartext: isLocal,
    errorPath: "offline.html",
    // Stripe Checkout öppnas i appen (inte i Safari/Chrome), så att man kommer
    // tillbaka till appen efter betalningen. Allt annat externt öppnas i
    // systemets webbläsare.
    allowNavigation: ["checkout.stripe.com", "*.stripe.com"],
  },
  plugins: {
    // Kant till kant: webbappen får rätt safe-area-värden (viewport-fit=cover).
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
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
