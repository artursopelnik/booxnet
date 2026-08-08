import {
  IonAlert,
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
  volumeHighOutline,
} from 'ionicons/icons'
import { useEffect, useState } from 'react'
import {
  DOWNLOAD_ERRORS,
  downloadStudioEngine,
  isStudioEngineInstalled,
  STUDIO_ENGINE_SIZE_MB,
  StudioDownloadError,
} from '../lib/supertonic/assets'
import {
  getInstallMethod,
  onInstallChange,
  promptInstall,
  type InstallMethod,
} from '../lib/pwa'
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
  const [installMethod, setInstallMethod] = useState<InstallMethod>(() =>
    getInstallMethod(),
  )
  const [showIosHelp, setShowIosHelp] = useState(false)
  const router = useIonRouter()
  const [presentToast] = useIonToast()

  useEffect(
    () => onInstallChange(() => setInstallMethod(getInstallMethod())),
    [],
  )

  // Wie in der Bibliothek: nativer Install-Dialog, auf iOS die Anleitung.
  const install = async () => {
    if (installMethod === 'ios-instructions') {
      setShowIosHelp(true)
      return
    }
    await promptInstall()
  }

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
            Textdatei hoch und lass es dir mit natürlichen Stimmen vorlesen.
            Ohne Konto, ohne Cloud. Alles bleibt auf deinem Gerät.
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
            <IonItem
              button={installMethod !== null}
              onClick={installMethod !== null ? () => void install() : undefined}
            >
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={phonePortraitOutline}
                color="primary"
              />
              <IonLabel>
                <h2>
                  {installMethod !== null
                    ? 'Zum Home-Bildschirm hinzufügen'
                    : 'Als App aufs Handy'}
                </h2>
                <IonNote>Aktualisiert sich selbst, läuft 100 % offline.</IonNote>
              </IonLabel>
            </IonItem>
            <IonItem>
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={volumeHighOutline}
                color="primary"
              />
              <IonLabel>
                <h2>Ton an!</h2>
                <IonNote>
                  Stummschaltung aus oder Kopfhörer verbinden – sonst bleibt
                  die Stimme lautlos.
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
                    ? 'Im privaten Fenster nicht möglich – bitte normales Fenster nutzen.'
                    : progress === null
                      ? `Ca. ${STUDIO_ENGINE_SIZE_MB} MB – alle Stimmen, für immer offline.`
                      : `${progress.mb} von ca. ${STUDIO_ENGINE_SIZE_MB} MB … App geöffnet lassen.`}
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
        <IonAlert
          isOpen={showIosHelp}
          onDidDismiss={() => setShowIosHelp(false)}
          header="Zum Home-Bildschirm"
          message={
            'Auf dem iPhone/iPad geht das nur über Safari selbst: Tippe unten auf das Teilen-Symbol (Quadrat mit Pfeil nach oben) und wähle dann „Zum Home-Bildschirm". Danach startet Booxnet wie eine App.'
          }
          buttons={['Verstanden']}
        />
      </IonContent>
    </IonPage>
  )
}
