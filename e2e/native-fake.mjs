// Låtsas-brygga för Capacitor i Playwright: samma gränssnitt som den riktiga
// native-bryggan i appen (window.Capacitor.PluginHeaders + nativePromise /
// nativeCallback), så att webbkoden körs exakt som i iOS/Android-appen.
// Anrop loggas i window.__native.calls; händelser skickas med __native.emit().
export const APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CoaviraApp CoaviraPush"

export function installNativeFake({ launchUrl = null } = {}) {
  const calls = []
  const listeners = {}
  let id = 0
  const header = (name, promises) => ({
    name,
    methods: [...promises.map((n) => ({ name: n, rtype: "promise" })), { name: "addListener", rtype: "callback" }],
  })
  const state = { perm: sessionStorage.getItem("fake:perm") ?? "prompt" }
  window.__native = {
    calls,
    emit(plugin, event, data) {
      for (const cb of listeners[`${plugin}:${event}`] ?? []) cb(data)
    },
    count: (plugin, method) => calls.filter((c) => c.plugin === plugin && c.method === method).length,
  }
  window.CapacitorCustomPlatform = { name: "ios" }
  window.Capacitor = {
    PluginHeaders: [
      header("App", ["getLaunchUrl", "removeListener", "removeAllListeners"]),
      header("Browser", ["open", "close", "removeListener", "removeAllListeners"]),
      header("PushNotifications", ["checkPermissions", "requestPermissions", "register", "unregister", "removeListener", "removeAllListeners"]),
    ],
    nativePromise(plugin, method, options) {
      calls.push({ plugin, method, options })
      // Överlever sidbytet som följer (för kontroll i testet).
      if (plugin === "Browser" && method === "close") sessionStorage.setItem("fake:browser-closed", "1")
      if (plugin === "App" && method === "getLaunchUrl") return Promise.resolve(launchUrl ? { url: launchUrl } : {})
      if (plugin === "PushNotifications" && method === "checkPermissions") return Promise.resolve({ receive: state.perm })
      if (plugin === "PushNotifications" && method === "requestPermissions") {
        state.perm = "granted"
        sessionStorage.setItem("fake:perm", "granted")
        return Promise.resolve({ receive: "granted" })
      }
      return Promise.resolve()
    },
    nativeCallback(plugin, method, options, callback) {
      calls.push({ plugin, method, options })
      ;(listeners[`${plugin}:${options.eventName}`] ??= []).push(callback)
      return String(++id)
    },
  }
}
