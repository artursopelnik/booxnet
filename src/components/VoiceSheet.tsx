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
  useIonAlert,
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
  isStudioEngineInstalled,
  removeStudioData,
  STUDIO_ENGINE_SIZE_MB,
} from '../lib/supertonic/assets'
import {
  resetStudioEngine,
  subscribeEngineInfo,
  type EngineInfo,
} from '../lib/supertonic/client'
import { previewVoice, warmVoicePreviews } from '../lib/tts'
import { useEngineDownload } from '../lib/useEngineDownload'
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
      : `Achtung: nur ${engine.threads} Thread – Mehrkern-Modus nicht aktiv (das bremst stark)`,
    `Vorbereitung: ${num(engine.loadSeconds)} s`,
  ]
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
  const { progress, storageBlocked, start } = useEngineDownload()
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [presentToast] = useIonToast()
  const [presentAlert] = useIonAlert()
  /** Diagnose: Am Handy gibt es keine Browser-Konsole. */
  const [info, setInfo] = useState<EngineInfo>({ engine: null, synth: null })

  useEffect(() => subscribeEngineInfo(setInfo), [])

  useEffect(() => {
    if (isOpen) {
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
    }
  }, [isOpen])

  const startDownload = async () => {
    if (!(await start())) return
    setInstalled(true)
    onEngineChange(true)
    // Direkt nach dem Download alle Begrüßungen vorrendern – ab dann
    // spielt jede Vorstellung sofort, dauerhaft und offline.
    warmVoicePreviews(STUDIO_VOICES)
  }

  const deleteData = async () => {
    await removeStudioData()
    resetStudioEngine()
    setInstalled(false)
    onEngineChange(false)
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
          <IonTitle role="heading" aria-level={1}>Stimmen</IonTitle>
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
                    aria-label="Sprachmodell wird heruntergeladen"
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
              // Das Haekchen rechts ist rein visuell; ohne diese Angabe
              // hoeren Screenreader vier gleichwertige Eintraege und
              // erfahren nie, welche Stimme gerade aktiv ist.
              aria-current={voice.id === selectedId ? 'true' : undefined}
            >
              <IonLabel>
                <h2>
                  {voice.name}
                  {voice.id === selectedId && (
                    <span className="visually-hidden"> (ausgewählt)</span>
                  )}
                </h2>
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
                  className="voice-preview-button"
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

        {/* Messwerte direkt in der App: Am Handy gibt es keine
            Browser-Konsole, in der sich Threads, Ladezeit und Rechentempo
            ablesen liessen. Eingeklappt, weil sie im Alltag niemanden
            interessieren – gebraucht werden sie erst, wenn etwas zaeh
            laeuft. <details> statt eigenem Zustand: Auf- und Zuklappen
            kann der Browser selbst, inklusive Tastatur und Screenreader. */}
        {installed && (
          <IonList inset>
            <IonItem lines="none">
              <IonLabel className="ion-text-wrap">
                <details className="engine-details">
                  <summary>Technische Details</summary>
                  <div className="engine-diagnostics">
                    {diagnosticLines(info).map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                </details>
              </IonLabel>
            </IonItem>
          </IonList>
        )}
      </IonContent>
    </IonModal>
  )
}
