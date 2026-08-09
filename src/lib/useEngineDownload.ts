/**
 * Der einmalige Download des ~400-MB-Sprachpakets, an einer Stelle.
 *
 * Zwei Bildschirme bieten ihn an (Willkommensseite und Stimmen-Auswahl)
 * und brauchten dafür exakt dieselben Schritte: Fortschritt mitführen,
 * den Bildschirm wachhalten (sperrt sich das Gerät, bricht iOS den
 * Download mitten in der Datei ab), Fehlerursache in einen erklärenden
 * Text übersetzen und aufräumen. Das lag zweimal fast wortgleich im
 * Quelltext – eine Korrektur an einer Stelle wäre der anderen entgangen.
 */
import { useIonToast } from '@ionic/react'
import { useCallback, useEffect, useState } from 'react'
import {
  DOWNLOAD_ERRORS,
  downloadStudioEngine,
  StudioDownloadError,
} from './supertonic/assets'
import { isStorageAvailable } from './supertonic/opfs'

export interface DownloadProgress {
  percent: number
  mb: number
}

export interface EngineDownload {
  /** Läuft gerade ein Download? Dann der aktuelle Stand, sonst null. */
  progress: DownloadProgress | null
  /** Browser erlaubt hier keinen Speicher (typisch: privates Fenster). */
  storageBlocked: boolean
  /** Startet den Download; löst true auf, wenn er vollständig war. */
  start: () => Promise<boolean>
}

export function useEngineDownload(): EngineDownload {
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [presentToast] = useIonToast()

  useEffect(() => {
    void isStorageAvailable().then((available) =>
      setStorageBlocked(!available),
    )
  }, [])

  const start = useCallback(async () => {
    setProgress({ percent: 0, mb: 0 })
    // Bildschirm anlassen: Sperrt sich das Gerät, unterbricht iOS den
    // Download mitten in der Datei. Best-effort – nicht jeder Browser
    // kann das, der Hinweistext bittet ohnehin darum, die App offen zu
    // lassen.
    let wakeLock: WakeLockSentinel | null = null
    try {
      wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      // Ohne Wake Lock bleibt es beim Hinweistext.
    }
    try {
      await downloadStudioEngine((percent, mb) => setProgress({ percent, mb }))
      return true
    } catch (error) {
      const reason =
        error instanceof StudioDownloadError ? error.reason : 'network'
      presentToast({
        message: DOWNLOAD_ERRORS[reason],
        duration: 5000,
        color: 'danger',
      })
      return false
    } finally {
      void wakeLock?.release().catch(() => {})
      setProgress(null)
    }
  }, [presentToast])

  return { progress, storageBlocked, start }
}
