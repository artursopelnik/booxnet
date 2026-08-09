/**
 * Herkunft der onnxruntime WASM-Laufzeitdateien.
 *
 * Die Dateien (WASM-Binärdateien + .mjs-Loader) werden beim Build aus
 * dem npm-Paket nach public/ort/ kopiert (scripts/copy-ort-wasm.mjs) und
 * ausschließlich same-origin geladen: immer passend zur gebündelten
 * JS-Version, vom Service Worker cachebar und damit offline-fähig.
 *
 * Bewusst OHNE CDN-Rückfall. Früher stand hier jsDelivr für den Fall,
 * dass der Kopierschritt nicht gelaufen ist – dieselbe Art fremder
 * Quelle, die bei den Sprachmodellen abgeschafft wurde: Sie kann
 * abgeschaltet, blockiert oder gesperrt werden, und zwar genau dann,
 * wenn man sie braucht. Ein Rückfall verdeckt außerdem den eigentlichen
 * Fehler: Fehlt /ort/, ist der Build kaputt und gehört repariert, nicht
 * über einen Fremdserver notdürftig am Leben gehalten.
 *
 * Läuft im Worker wie im Fenster (nur navigator/fetch, kein DOM).
 */

/** Zur Build-Zeit injizierte onnxruntime-Version (vite.config.ts). */
declare const __ORT_VERSION__: string

/**
 * Versionierter Pfad: macht die Dateien unveränderlich (immutable
 * cachebar) und lässt Upgrades nie auf veraltete Cache-Einträge treffen.
 */
export function ortWasmPrefix(): string {
  return `${import.meta.env.BASE_URL}ort/${__ORT_VERSION__}/`
}

/** Laufzeitdateien, die der Worker tatsächlich anfordert (reines WASM). */
export function ortWasmFiles(): string[] {
  return ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']
}

/**
 * Lädt die benötigten Laufzeitdateien einmal an, damit der Service Worker
 * sie cacht und die Sprachausgabe danach offline startet. Best-effort:
 * Online-Wiedergabe funktioniert auch ohne.
 */
export async function warmOrtWasmCache(): Promise<void> {
  const prefix = ortWasmPrefix()
  await Promise.all(
    ortWasmFiles().map(async (file) => {
      try {
        const response = await fetch(prefix + file)
        if (response.ok) await response.blob()
      } catch {
        // Offline oder blockiert – beim ersten Online-Abspielen nachgeholt.
      }
    }),
  )
}
