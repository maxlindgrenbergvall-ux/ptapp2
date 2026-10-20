/**
 * Push-notiser i Coavira-appen (@capacitor/push-notifications).
 *
 * Grundstöd: appen ber om lov (först när användaren slår på det i
 * Inställningar), hämtar enhetens push-token från Firebase (Android) eller
 * APNs (iOS) och sparar den i Supabase (push_tokens, via register_push_token).
 * Tryck på en notis öppnar sidan i notisens data.url. Själva utskicket görs
 * på servern i ett senare steg (Firebase Cloud Messaging).
 *
 * Bara aktivt i app-byggen där push är konfigurerat (nativePushAvailable).
 */
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { appUrlToPath, nativePlatform, nativePushAvailable } from "@/lib/native/app"

const ENABLED_KEY = "coavira:push:enabled"
const TOKEN_KEY = "coavira:push:token"

export type PushState = "unavailable" | "off" | "on" | "denied"

const store = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) window.localStorage.removeItem(k)
      else window.localStorage.setItem(k, v)
    } catch {}
  },
}

type Push = typeof import("@capacitor/push-notifications").PushNotifications

/**
 * Kör fn med push-pluginen. Pluginen är en Proxy som svarar på alla egenskaper,
 * även "then" – den får därför aldrig returneras från en async-funktion (då
 * försöker JavaScript vänta på den och anropar PushNotifications.then()).
 */
const withPush = async <T>(fn: (push: Push) => Promise<T>): Promise<T> => fn((await import("@capacitor/push-notifications")).PushNotifications)

/** Sparar enhetens token hos den inloggade användaren (en token tillhör alltid bara en användare). */
async function saveToken(token: string) {
  store.set(TOKEN_KEY, token)
  const platform = nativePlatform()
  if (!isSupabaseEnabled || !platform) return
  const { error } = await getSupabase().rpc("register_push_token", { p_token: token, p_platform: platform })
  if (error) console.warn("[coavira] push-token kunde inte sparas", error.message)
}

export async function pushState(): Promise<PushState> {
  if (!nativePushAvailable()) return "unavailable"
  const { receive } = await withPush((push) => push.checkPermissions())
  if (receive === "denied") return "denied"
  return receive === "granted" && store.get(ENABLED_KEY) === "1" ? "on" : "off"
}

/** Slå på push: be om lov, registrera enheten och spara token. */
export async function enablePush(): Promise<PushState> {
  if (!nativePushAvailable()) return "unavailable"
  return withPush(async (push) => {
    let { receive } = await push.checkPermissions()
    if (receive === "prompt" || receive === "prompt-with-rationale") receive = (await push.requestPermissions()).receive
    if (receive !== "granted") return "denied"
    store.set(ENABLED_KEY, "1")
    await push.register()
    return "on"
  })
}

/** Stäng av push för den här enheten (och ta bort token från servern). */
export async function disablePush(): Promise<void> {
  store.set(ENABLED_KEY, null)
  await forgetPushToken()
  if (nativePushAvailable()) await withPush((push) => push.unregister()).catch(() => {})
}

/** Vid utloggning: enheten ska inte längre få notiser för kontot. */
export async function forgetPushToken(): Promise<void> {
  const token = store.get(TOKEN_KEY)
  store.set(TOKEN_KEY, null)
  if (!token || !isSupabaseEnabled) return
  await getSupabase().rpc("unregister_push_token", { p_token: token })
}

/**
 * Lyssnare som ska finnas så länge appen är öppen: ny/ändrad token sparas och
 * tryck på en notis öppnar rätt sida. Registrerar om enheten vid start om push
 * är påslaget (token kan bytas av systemet). Returnerar en städfunktion.
 */
export async function handlePushTap(): Promise<() => void> {
  if (!nativePushAvailable()) return () => {}
  return withPush(async (push) => {
    const subs = await Promise.all([
      push.addListener("registration", ({ value }) => void saveToken(value)),
      push.addListener("registrationError", ({ error }) => console.warn("[coavira] push-registrering misslyckades", error)),
      push.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const url = typeof notification.data?.url === "string" ? notification.data.url : null
        const path = url ? appUrlToPath(new URL(url, window.location.origin).href, window.location.origin) : null
        if (path) window.location.assign(path)
      }),
    ])
    if (store.get(ENABLED_KEY) === "1" && (await push.checkPermissions()).receive === "granted") await push.register()
    return () => subs.forEach((s) => void s.remove())
  })
}
