import {
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  useIonRouter,
  useIonToast,
} from '@ionic/react'
import {
  cloudDownloadOutline,
  phonePortraitOutline,
  sparklesOutline,
} from 'ionicons/icons'
import { useEffect, useState } from 'react'
import {
  DOWNLOAD_ERRORS,
  downloadStudioEngine,
  isStudioEngineInstalled,
  STUDIO_ENGINE_SIZE_MB,
  StudioDownloadError,
} from '../lib/supertonic/assets'
import { isStorageAvailable } from '../lib/supertonic/opfs'
import { warmVoicePreviews } from '../lib/tts'
import { STUDIO_VOICES } from '../lib/voices'

/** Einmal gesehen? Dann startet die App künftig direkt in der Bibliothek. */
export const WELCOME_SEEN_KEY = 'booxnet.welcomeSeen'

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, '1')
  } catch {
    // Ohne Speicher erscheint die Seite ggf. erneut – verschmerzbar.
  }
}

/**
 * Erststart-Seite: erklärt das Angebot und führt direkt zum Download des
 * Sprachpakets – ohne das die App nutzlos wäre. Wer das Paket schon hat
 * (Bestandsinstallation), wird gar nicht erst hierher geleitet.
 */
export default function WelcomePage() {
  const [progress, setProgress] = useState<{
    percent: number
    mb: number
  } | null>(null)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const router = useIonRouter()
  const [presentToast] = useIonToast()

  const finish = () => {
    markWelcomeSeen()
    router.push('/library', 'root', 'replace')
  }

  useEffect(() => {
    isStorageAvailable().then((available) => setStorageBlocked(!available))
    // Paket schon da (z. B. zweites Gerät im Sync, erneuter Besuch nach
    // Skip): direkt weiter in die Bibliothek.
    isStudioEngineInstalled().then((ok) => {
      if (ok) finish()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startDownload = async () => {
    setProgress({ percent: 0, mb: 0 })
    // Bildschirm anlassen: Sperrt sich das Gerät, unterbricht iOS den
    // Download mitten in der Datei. Best-effort.
    let wakeLock: WakeLockSentinel | null = null
    try {
      wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      // Ohne Wake Lock bittet der Hinweistext darum, die App offen zu lassen.
    }
    try {
      await downloadStudioEngine((percent, mb) => setProgress({ percent, mb }))
      // Begrüßungen im Hintergrund vorrendern – das Probehören spielt
      // dann sofort. Läuft weiter, während der Nutzer schon importiert.
      warmVoicePreviews(STUDIO_VOICES)
      finish()
    } catch (error) {
      const reason =
        error instanceof StudioDownloadError ? error.reason : 'network'
      presentToast({
        message: DOWNLOAD_ERRORS[reason],
        duration: 5000,
        color: 'danger',
      })
    } finally {
      void wakeLock?.release().catch(() => {})
      setProgress(null)
    }
  }

  return (
    <IonPage>
      <IonContent fullscreen className="ion-padding">
        <div className="welcome">
          <img
            className="welcome__logo"
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="Booxnet"
            width={72}
            height={72}
          />
          <h1>Willkommen bei Booxnet</h1>
          <p>
            Deine kostenlose Vorlese-App: Lade ein Buch als PDF, EPUB oder
            Textdatei hoch und lass es dir mit natürlichen Stimmen vorlesen –
            ohne Konto, ohne Cloud. Alles bleibt auf deinem Gerät.
          </p>

          <IonList inset>
            <IonItem>
              <IonSelect
                label="Bevorzugte Sprache"
                value="de"
                disabled
                interface="popover"
              >
                <IonSelectOption value="de">Deutsch</IonSelectOption>
              </IonSelect>
            </IonItem>
            <IonItem>
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={phonePortraitOutline}
                color="primary"
              />
              <IonLabel>
                <h2>Als App aufs Handy</h2>
                <IonNote>
                  Booxnet ist eine Web-App (PWA): zum Home-Bildschirm
                  hinzugefügt lässt sie sich bequem aktualisieren, und alle
                  Funktionen sind zu 100 % offline nutzbar.
                </IonNote>
              </IonLabel>
            </IonItem>
            <IonItem>
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={sparklesOutline}
                color="primary"
              />
              <IonLabel>
                <h2>Einmaliger Download</h2>
                <IonNote>
                  {storageBlocked
                    ? 'Hier nicht möglich: Dein Browser blockiert den Speicher dafür (z. B. im privaten Fenster). Bitte in einem normalen Fenster öffnen.'
                    : progress === null
                      ? `Sprachmodelle, Rechen-Engine und Stimmen-Vorstellungen (ca. ${STUDIO_ENGINE_SIZE_MB} MB) – danach liest Booxnet komplett offline vor.`
                      : `Wird geladen … ${progress.mb} von ca. ${STUDIO_ENGINE_SIZE_MB} MB. Lass die App dabei geöffnet.`}
                </IonNote>
                {progress !== null && (
                  <IonProgressBar
                    value={progress.percent / 100}
                    style={{ marginTop: 6 }}
                  />
                )}
              </IonLabel>
            </IonItem>
          </IonList>

          <IonButton
            expand="block"
            size="large"
            disabled={progress !== null || storageBlocked}
            onClick={() => void startDownload()}
          >
            <IonIcon aria-hidden="true" slot="start" icon={cloudDownloadOutline} />
            {progress === null ? 'Weiter: Dateien laden' : 'Wird geladen …'}
          </IonButton>
          <IonButton fill="clear" expand="block" onClick={finish}>
            Später – erst mal umschauen
          </IonButton>
        </div>
      </IonContent>
    </IonPage>
  )
}
