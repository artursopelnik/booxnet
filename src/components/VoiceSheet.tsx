import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonProgressBar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonToast,
} from '@ionic/react'
import {
  checkmark,
  cloudDownloadOutline,
  sparklesOutline,
  trashOutline,
  volumeMediumOutline,
} from 'ionicons/icons'
import { useEffect, useState } from 'react'
import {
  downloadStudioEngine,
  isStudioEngineInstalled,
  removeStudioData,
  STUDIO_ENGINE_SIZE_MB,
  StudioDownloadError,
  type StudioDownloadFailure,
} from '../lib/supertonic/assets'
import { resetStudioEngine } from '../lib/supertonic/client'
import { isStorageAvailable } from '../lib/supertonic/opfs'
import { previewVoice } from '../lib/tts'
import { STUDIO_VOICES, type StudioVoiceMeta } from '../lib/voices'

const DOWNLOAD_ERRORS: Record<StudioDownloadFailure, string> = {
  storage:
    'Dein Browser erlaubt hier keinen Speicher für das Sprachmodell – das passiert vor allem in privaten Fenstern. Öffne Booxnet in einem normalen Fenster und lade es dort herunter.',
  quota:
    `Auf deinem Gerät ist zu wenig Speicherplatz für das Sprachmodell frei (ca. ${STUDIO_ENGINE_SIZE_MB} MB). Schaffe etwas Platz und versuche es dann erneut – bereits geladene Teile bleiben erhalten.`,
  network:
    'Die Sprachdaten sind gerade nicht erreichbar. Prüfe deine Internetverbindung und versuche es in ein paar Minuten noch einmal. Bereits geladene Teile bleiben erhalten.',
}

interface Props {
  isOpen: boolean
  selectedId: string | null
  onSelect: (voice: StudioVoiceMeta) => void
  /** Notifies the reader that the engine was installed or removed. */
  onEngineChange: (installed: boolean) => void
  onDismiss: () => void
}

export default function VoiceSheet({
  isOpen,
  selectedId,
  onSelect,
  onEngineChange,
  onDismiss,
}: Props) {
  const [installed, setInstalled] = useState(false)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [progress, setProgress] = useState<{
    percent: number
    mb: number
  } | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [presentToast] = useIonToast()

  useEffect(() => {
    if (isOpen) {
      isStudioEngineInstalled().then(setInstalled)
      isStorageAvailable().then((available) => setStorageBlocked(!available))
    }
  }, [isOpen])

  const startDownload = async () => {
    setProgress({ percent: 0, mb: 0 })
    // Keep the screen on: if it locks, iOS suspends the tab and the
    // download dies mid-file. Best-effort – not all browsers support it.
    let wakeLock: WakeLockSentinel | null = null
    try {
      wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
    } catch {
      // Wake lock unavailable – the hint text still asks to keep the app open.
    }
    try {
      await downloadStudioEngine((percent, mb) =>
        setProgress({ percent, mb }),
      )
      setInstalled(true)
      onEngineChange(true)
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

  const deleteData = async () => {
    await removeStudioData()
    resetStudioEngine()
    setInstalled(false)
    onEngineChange(false)
  }

  const preview = async (voice: StudioVoiceMeta) => {
    setPreviewing(voice.id)
    try {
      await previewVoice(voice)
    } catch {
      presentToast({
        message: 'Probehören fehlgeschlagen.',
        duration: 2500,
        color: 'danger',
      })
    } finally {
      setPreviewing(null)
    }
  }

  // Selecting a voice makes it introduce itself: "Hallo, ich bin Alex."
  const select = (voice: StudioVoiceMeta) => {
    onSelect(voice)
    if (previewing === null) {
      void preview(voice)
    }
  }

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={0.75}
      breakpoints={[0, 0.75, 1]}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>Stimmen</IonTitle>
          <IonButtons slot="end">
            <IonButton strong onClick={onDismiss}>
              Fertig
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="voice-section-note">
          Nach einem einmaligen Download werden alle Stimmen komplett
          offline auf deinem Gerät vorgelesen.
        </div>
        <IonList inset>
          {!installed && (
            <IonItem
              button={progress === null && !storageBlocked}
              onClick={
                progress === null && !storageBlocked
                  ? () => void startDownload()
                  : undefined
              }
            >
              <IonIcon aria-hidden="true" slot="start" icon={sparklesOutline} color="primary" />
              <IonLabel>
                <h2>Sprachmodell herunterladen</h2>
                <IonNote>
                  {storageBlocked
                    ? 'Hier nicht möglich: Dein Browser blockiert den Speicher dafür (z. B. im privaten Fenster). Bitte in einem normalen Fenster öffnen.'
                    : progress === null
                      ? `Einmalig ca. ${STUDIO_ENGINE_SIZE_MB} MB – schaltet alle 10 Stimmen frei`
                      : `Wird geladen … ${progress.mb} von ca. ${STUDIO_ENGINE_SIZE_MB} MB. Lass die App dabei geöffnet.`}
                </IonNote>
                {progress !== null && (
                  <IonProgressBar
                    value={progress.percent / 100}
                    style={{ marginTop: 6 }}
                  />
                )}
              </IonLabel>
              {progress === null && !storageBlocked && (
                <IonIcon aria-hidden="true" slot="end" icon={cloudDownloadOutline} />
              )}
            </IonItem>
          )}
          {STUDIO_VOICES.map((voice) => (
            <IonItem
              key={voice.id}
              button={installed}
              disabled={!installed}
              onClick={installed ? () => select(voice) : undefined}
            >
              <IonLabel>
                <h2>{voice.name}</h2>
                <IonNote>
                  {voice.gender === 'm' ? 'Männlich' : 'Weiblich'}
                  {!installed && ' · benötigt das Sprachmodell'}
                </IonNote>
              </IonLabel>
              {voice.id === selectedId && (
                <IonIcon aria-hidden="true" slot="end" color="primary" icon={checkmark} />
              )}
              {installed && (
                <IonButton
                  slot="end"
                  fill="clear"
                  disabled={previewing !== null}
                  onClick={(event) => {
                    event.stopPropagation()
                    void preview(voice)
                  }}
                  aria-label={`Stimme ${voice.name} probehören`}
                >
                  {previewing === voice.id ? (
                    <IonSpinner name="crescent" />
                  ) : (
                    <IonIcon aria-hidden="true" slot="icon-only" icon={volumeMediumOutline} />
                  )}
                </IonButton>
              )}
            </IonItem>
          ))}
          {installed && (
            <IonItem button onClick={() => void deleteData()}>
              <IonIcon aria-hidden="true" slot="start" icon={trashOutline} color="medium" />
              <IonLabel color="medium">
                Sprachmodell löschen ({STUDIO_ENGINE_SIZE_MB} MB freigeben)
              </IonLabel>
            </IonItem>
          )}
        </IonList>
      </IonContent>
    </IonModal>
  )
}
