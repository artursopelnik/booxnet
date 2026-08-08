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
  IonToggle,
  IonToolbar,
  useIonAlert,
  useIonToast,
} from '@ionic/react'
import {
  checkmark,
  cloudDownloadOutline,
  flaskOutline,
  sparklesOutline,
  trashOutline,
  volumeMediumOutline,
} from 'ionicons/icons'
import { useEffect, useState } from 'react'
import {
  DOWNLOAD_ERRORS,
  downloadInt8VectorEstimator,
  downloadStudioEngine,
  INT8_VECTOR_ESTIMATOR_SIZE_MB,
  isInt8VariantInstalled,
  isStudioEngineInstalled,
  removeInt8VectorEstimator,
  removeStudioData,
  STUDIO_ENGINE_SIZE_MB,
  StudioDownloadError,
} from '../lib/supertonic/assets'
import {
  engineVariantSetting,
  resetStudioEngine,
  setEngineVariantSetting,
  subscribeEngineInfo,
  type EngineInfo,
} from '../lib/supertonic/client'
import { isStorageAvailable } from '../lib/supertonic/opfs'
import { previewVoice, warmVoicePreviews } from '../lib/tts'
import { STUDIO_VOICES, type StudioVoiceMeta } from '../lib/voices'

/** Deutsche Zahl mit einer Nachkommastelle (Komma statt Punkt). */
function num(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/**
 * Klartext-Diagnose für die Anzeige in der App. Wichtigster Wert ist die
 * Thread-Zahl: Läuft die Engine einkernig (Cross-Origin-Isolation greift
 * nicht), ist das die Erklärung für zähe Synthese – hier sofort sichtbar,
 * statt nur in der Browser-Konsole.
 */
function diagnosticLines(info: EngineInfo): string[] {
  const { engine, synth } = info
  if (!engine) {
    return ['Stimme noch nicht vorbereitet – tippe im Buch auf Abspielen.']
  }
  const lines = [
    engine.isolated
      ? `Rechenkerne: ${engine.threads} Threads von ${engine.cores ?? '?'} Kernen`
      : `⚠️ Nur ${engine.threads} Thread: Mehrkern-Modus nicht aktiv (das bremst stark)`,
    `Vorbereitung: ${num(engine.loadSeconds)} s`,
    `Rechenmodell: ${engine.variant === 'int8' ? 'int8 (Experiment)' : 'Standard'}`,
  ]
  if (engine.variantRequested === 'int8' && engine.variant !== 'int8') {
    lines.push('Hinweis: int8 ließ sich nicht laden, Standard wird benutzt.')
  }
  if (synth && synth.audioSeconds > 0) {
    const factor = synth.computeSeconds / synth.audioSeconds
    lines.push(
      `Letzter Satz: ${num(synth.computeSeconds)} s Rechenzeit für ` +
        `${num(synth.audioSeconds)} s Ton (${num(factor)}×)`,
    )
    lines.push(
      factor < 1
        ? 'Unter 1× heißt: schneller als Echtzeit, der Vorrat wächst.'
        : 'Über 1× heißt: langsamer als Echtzeit, der Vorrat schrumpft.',
    )
  }
  return lines
}

interface Props {
  isOpen: boolean
  selectedId: string | null
  onSelect: (voice: StudioVoiceMeta) => void
  /** Notifies the reader that the engine was installed or removed. */
  onEngineChange: (installed: boolean) => void
  onDismiss: () => void
  /**
   * Begrüßungen nur vorrendern, wenn die Wiedergabe ruht – laufende
   * lange Renderings würden sonst jeden Play-Druck blockieren.
   */
  canWarmPreviews?: boolean
}

export default function VoiceSheet({
  isOpen,
  selectedId,
  onSelect,
  onEngineChange,
  onDismiss,
  canWarmPreviews = true,
}: Props) {
  const [installed, setInstalled] = useState(false)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [progress, setProgress] = useState<{
    percent: number
    mb: number
  } | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [presentToast] = useIonToast()
  const [presentAlert] = useIonAlert()
  /** Diagnose: Am Handy gibt es keine Browser-Konsole. */
  const [info, setInfo] = useState<EngineInfo>({ engine: null, synth: null })
  const [int8Installed, setInt8Installed] = useState(false)
  const [int8Enabled, setInt8Enabled] = useState(
    () => engineVariantSetting() === 'int8',
  )
  const [int8Progress, setInt8Progress] = useState<number | null>(null)

  useEffect(() => subscribeEngineInfo(setInfo), [])

  useEffect(() => {
    if (isOpen) {
      void isInt8VariantInstalled().then(setInt8Installed)
      isStudioEngineInstalled().then((ok) => {
        setInstalled(ok)
        // Fehlende Begrüßungen im Hintergrund fertig rendern, damit das
        // Probehören sofort abspielt statt erst zu rechnen – die gerade
        // ausgewählte Stimme zuerst, und nur wenn die Wiedergabe ruht.
        if (ok && canWarmPreviews) {
          warmVoicePreviews([
            ...STUDIO_VOICES.filter((voice) => voice.id === selectedId),
            ...STUDIO_VOICES.filter((voice) => voice.id !== selectedId),
          ])
        }
      })
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
      // Direkt nach dem Download alle Begrüßungen vorrendern – ab dann
      // spielt jede Vorstellung sofort, dauerhaft und offline.
      warmVoicePreviews(STUDIO_VOICES)
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
    setInt8Installed(false)
    onEngineChange(false)
  }

  /**
   * Schaltet das experimentelle int8-Rechenmodell um: Beim ersten
   * Einschalten werden die ~65 MB nachgeladen. Die Engine wird danach
   * zurückgesetzt, damit die neue Variante beim nächsten Abspielen
   * wirklich greift (die Variante steht beim Engine-Aufbau fest).
   */
  const toggleInt8 = async (enabled: boolean) => {
    if (enabled && !int8Installed) {
      setInt8Progress(0)
      try {
        await downloadInt8VectorEstimator((percent) =>
          setInt8Progress(percent),
        )
        setInt8Installed(true)
      } catch (error) {
        const reason =
          error instanceof StudioDownloadError ? error.reason : 'network'
        presentToast({
          message: DOWNLOAD_ERRORS[reason],
          duration: 5000,
          color: 'danger',
        })
        return
      } finally {
        setInt8Progress(null)
      }
    }
    setEngineVariantSetting(enabled ? 'int8' : 'standard')
    setInt8Enabled(enabled)
    resetStudioEngine()
    presentToast({
      message: enabled
        ? 'Experiment aktiv. Die Stimme wird jetzt neu vorbereitet – achte auf Klang und Tempo.'
        : 'Zurück auf Standard. Die Stimme wird neu vorbereitet.',
      duration: 4000,
    })
  }

  // Ein versehentlicher Tipper darf nicht 400 MB wegwerfen – erst fragen.
  const confirmDelete = () => {
    void presentAlert({
      header: 'Sprachmodell löschen?',
      message:
        'Alle Stimmen und Begrüßungen werden von diesem Gerät entfernt. Zum Vorlesen musst du die ca. 400 MB danach erneut herunterladen.',
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Löschen',
          role: 'destructive',
          handler: () => void deleteData(),
        },
      ],
    })
  }

  /** Gibt die 65 MB des abgeschalteten Experiments wieder frei. */
  const discardInt8 = async () => {
    await removeInt8VectorEstimator()
    setInt8Installed(false)
    presentToast({
      message: `${INT8_VECTOR_ESTIMATOR_SIZE_MB} MB freigegeben. Das normale Sprachmodell bleibt erhalten.`,
      duration: 3000,
    })
  }

  const preview = async (voice: StudioVoiceMeta) => {
    setPreviewing(voice.id)
    try {
      await previewVoice(voice)
    } catch (error) {
      // Mit technischem Detail – ohne bleibt "geht nicht" undiagnostizierbar.
      const detail =
        error instanceof Error && error.message ? ` (${error.message})` : ''
      presentToast({
        message: `Probehören fehlgeschlagen.${detail}`,
        duration: 4000,
        color: 'danger',
      })
    } finally {
      setPreviewing(null)
    }
  }

  // Auswählen wechselt NUR die Stimme – die Vorstellung ("Hallo, ich
  // bin Alex.") spielt ausschließlich über das Ton-Icon rechts. Die
  // Auto-Vorstellung nervte beim Wechseln und konnte sich mit der
  // laufenden Wiedergabe gegenseitig aus der Warteschlange werfen.
  const select = (voice: StudioVoiceMeta) => {
    onSelect(voice)
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
                      ? `Einmalig ca. ${STUDIO_ENGINE_SIZE_MB} MB, schaltet alle 10 Stimmen frei`
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
            <IonItem button onClick={confirmDelete}>
              <IonIcon aria-hidden="true" slot="start" icon={trashOutline} color="medium" />
              <IonLabel color="medium">
                Sprachmodell löschen ({STUDIO_ENGINE_SIZE_MB} MB freigeben)
              </IonLabel>
            </IonItem>
          )}
        </IonList>

        {/* Experiment und Messwerte direkt in der App: Am Handy gibt es
            keine Browser-Konsole, in der sich Threads, Ladezeit und
            Rechentempo ablesen liessen. */}
        {installed && (
          <IonList inset>
            <div className="voice-section-note">Experiment</div>
            <IonItem>
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={flaskOutline}
                color="medium"
              />
              <IonLabel className="ion-text-wrap">
                <h2>Schnelleres Rechenmodell</h2>
                <IonNote>
                  {int8Progress !== null
                    ? `Wird geladen … ${int8Progress} %`
                    : int8Installed
                      ? 'Kleineres, verlustbehaftet gerechnetes Modell (int8). Kann spürbar schneller sein – achte darauf, ob die Stimme anders klingt.'
                      : `Einmalig ca. ${INT8_VECTOR_ESTIMATOR_SIZE_MB} MB laden: kleineres Rechenmodell (int8), das schneller sein kann. Der Klang kann sich leicht ändern.`}
                </IonNote>
                {int8Progress !== null && (
                  <IonProgressBar
                    value={int8Progress / 100}
                    style={{ marginTop: 6 }}
                  />
                )}
              </IonLabel>
              <IonToggle
                slot="end"
                checked={int8Enabled}
                disabled={int8Progress !== null}
                onIonChange={(event) =>
                  void toggleInt8(event.detail.checked)
                }
                aria-label="Schnelleres Rechenmodell verwenden"
              />
            </IonItem>
            {/* Das Experiment abgeschaltet zu lassen soll nicht bedeuten,
                dass 65 MB ungenutzt liegen bleiben – ohne diese Zeile
                ginge das nur ueber das Loeschen des ganzen Sprachmodells. */}
            {int8Installed && !int8Enabled && int8Progress === null && (
              <IonItem button onClick={() => void discardInt8()}>
                <IonIcon
                  aria-hidden="true"
                  slot="start"
                  icon={trashOutline}
                  color="medium"
                />
                <IonLabel color="medium" className="ion-text-wrap">
                  Experiment-Modell löschen (
                  {INT8_VECTOR_ESTIMATOR_SIZE_MB} MB freigeben)
                </IonLabel>
              </IonItem>
            )}
            <IonItem lines="none">
              <IonLabel className="ion-text-wrap">
                <h2>Technische Details</h2>
                <div className="engine-diagnostics">
                  {diagnosticLines(info).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </IonLabel>
            </IonItem>
          </IonList>
        )}
      </IonContent>
    </IonModal>
  )
}
