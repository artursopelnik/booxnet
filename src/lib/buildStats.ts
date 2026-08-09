/**
 * Messwerte der letzten Buch-Aufbereitung, für die Diagnose in der App.
 *
 * Die Frage, die diese Zahlen beantworten sollen: Wenn „Das Buch wird
 * aufbereitet" lange steht – rechnet die App dann wirklich so lange,
 * oder kommt sie schlicht nicht dran?
 *
 * Der Aufbau läuft portionsweise auf dem Hauptthread und gibt zwischen
 * den Portionen ab, damit die Oberfläche bedienbar bleibt. Genau deshalb
 * genügt eine Gesamtdauer nicht: Lädt der Worker nebenher die ~400 MB
 * Sprachmodelle aus OPFS, kehren diese Unterbrechungen erst spät zurück.
 * Die Aufbereitung sieht dann zäh aus, ohne selbst mehr zu tun.
 *
 * Deshalb zwei getrennte Werte. Liegen sie nah beieinander, ist die
 * Rechenarbeit selbst das Problem. Klaffen sie auseinander, war das
 * Gerät mit anderem beschäftigt – und dort muss man ansetzen.
 *
 * Wie bei den Engine-Messwerten in supertonic/client.ts: Am Handy gibt
 * es keine Browser-Konsole, also gehören die Zahlen in die App.
 */

export interface BuildStats {
  sentences: number
  /** Tatsächlich vergangene Zeit von Anfang bis Ende. */
  totalSeconds: number
  /** Davon in der eigenen Rechenarbeit verbracht. */
  busySeconds: number
  /** Zahl der Unterbrechungen, an denen abgegeben wurde. */
  yields: number
}

let lastBuild: BuildStats | null = null
const listeners = new Set<(stats: BuildStats | null) => void>()

export function setBuildStats(stats: BuildStats): void {
  lastBuild = stats
  for (const listener of listeners) listener(lastBuild)
}

/** Meldet sich sofort mit dem aktuellen Stand und dann bei jedem neuen. */
export function subscribeBuildStats(
  listener: (stats: BuildStats | null) => void,
): () => void {
  listener(lastBuild)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
