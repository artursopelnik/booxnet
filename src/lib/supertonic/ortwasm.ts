/**
 * Herkunft der onnxruntime WASM-Laufzeitdateien.
 *
 * Die Dateien (WASM-Binärdateien + .mjs-Loader) werden beim Build nach
 * public/ort/ kopiert (scripts/copy-ort-wasm.mjs) und same-origin geladen:
 * immer passend zur gebündelten JS-Version, vom Service Worker cachebar
 * und damit offline-fähig. Das CDN bleibt nur als Fallback für Builds,
 * in denen der Kopierschritt nicht gelaufen ist.
 *
 * Läuft im Worker wie im Fenster (nur navigator/fetch, kein DOM).
 */

/** Muss zur installierten onnxruntime-web-Version passen (package.json). */
export const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/'

function localPrefix(): string {
  return `${import.meta.env.BASE_URL}ort/`
}

/** Laufzeitdateien, die der Worker tatsächlich anfordert (reines WASM). */
export function ortWasmFiles(): string[] {
  return ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']
}

/**
 * Liefert das lokale Verzeichnis, wenn die Laufzeitdateien mit ausgeliefert
 * wurden, sonst das CDN. Der Probe-GET läuft durch den Service Worker und
 * wird von dessen Cache beantwortet – so funktioniert die Auflösung auch
 * offline. (Auf SPA-Hosts liefert eine fehlende Datei index.html zurück,
 * daher der Content-Type-Check.)
 */
export async function resolveOrtWasmPrefix(): Promise<string> {
  try {
    const probe = await fetch(`${localPrefix()}ort-wasm-simd-threaded.wasm`)
    const type = probe.headers.get('Content-Type') ?? ''
    if (probe.ok && !type.includes('text/html')) return localPrefix()
  } catch {
    // Lokale Kopie nicht erreichbar – CDN versuchen.
  }
  return ORT_CDN
}

/**
 * Lädt die benötigten Laufzeitdateien einmal an, damit der Service Worker
 * sie cacht und die Sprachausgabe danach offline startet. Best-effort:
 * Online-Wiedergabe funktioniert auch ohne.
 */
export async function warmOrtWasmCache(): Promise<void> {
  const prefix = await resolveOrtWasmPrefix()
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
