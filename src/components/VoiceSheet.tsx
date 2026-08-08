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
} from '../lib/supertonic/assets'
import { resetStudioEngine } from '../lib/supertonic/client'
import { previewVoice } from '../lib/tts'
import {
  STUDIO_LANGS,
  STUDIO_VOICES,
  type StudioVoiceMeta,
} from '../lib/voices'

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
  const [progress, setProgress] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [presentToast] = useIonToast()

  useEffect(() => {
    if (isOpen) {
      isStudioEngineInstalled().then(setInstalled)
    }
  }, [isOpen])

  const startDownload = async () => {
    setProgress(0)
    try {
      await downloadStudioEngine(setProgress)
      setInstalled(true)
      onEngineChange(true)
    } catch {
      presentToast({
        message:
          'Download des Sprachmodells fehlgeschlagen. Prüfe deine Internetverbindung und versuche es erneut – bereits geladene Teile bleiben erhalten.',
        duration: 4000,
        color: 'danger',
      })
    } finally {
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

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={0.75}
      breakpoints={[0, 0.75, 1]}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>Stimme auswählen</IonTitle>
          <IonButtons slot="end">
            <IonButton strong onClick={onDismiss}>
              Fertig
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="voice-section-note">
          10 Stimmen in Studioqualität (44,1 kHz), jede spricht{' '}
          {STUDIO_LANGS.length} Sprachen. Einmal das Sprachmodell laden,
          danach läuft alles komplett offline auf deinem Gerät.
        </div>
        <IonList inset>
          {!installed && (
            <IonItem
              button={progress === null}
              onClick={progress === null ? () => void startDownload() : undefined}
            >
              <IonIcon slot="start" icon={sparklesOutline} color="primary" />
              <IonLabel>
                <h2>Sprachmodell herunterladen</h2>
                <IonNote>
                  {progress === null
                    ? `Einmalig ca. ${STUDIO_ENGINE_SIZE_MB} MB – schaltet alle 10 Stimmen frei`
                    : `Wird geladen … ${progress} %`}
                </IonNote>
                {progress !== null && (
                  <IonProgressBar
                    value={progress / 100}
                    style={{ marginTop: 6 }}
                  />
                )}
              </IonLabel>
              {progress === null && (
                <IonIcon slot="end" icon={cloudDownloadOutline} />
              )}
            </IonItem>
          )}
          {STUDIO_VOICES.map((voice) => (
            <IonItem
              key={voice.id}
              button={installed}
              disabled={!installed}
              onClick={installed ? () => onSelect(voice) : undefined}
            >
              <IonLabel>
                <h2>{voice.name}</h2>
                <IonNote>
                  {voice.gender === 'm' ? 'Männlich' : 'Weiblich'} · Studio{' '}
                  {voice.id}
                  {installed ? ' · offline' : ' · benötigt das Sprachmodell'}
                </IonNote>
              </IonLabel>
              {voice.id === selectedId && (
                <IonIcon slot="end" color="primary" icon={checkmark} />
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
                    <IonIcon slot="icon-only" icon={volumeMediumOutline} />
                  )}
                </IonButton>
              )}
            </IonItem>
          ))}
          {installed && (
            <IonItem button onClick={() => void deleteData()}>
              <IonIcon slot="start" icon={trashOutline} color="medium" />
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
