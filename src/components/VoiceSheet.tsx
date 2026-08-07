import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemGroup,
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
  trashOutline,
  volumeMediumOutline,
} from 'ionicons/icons'
import { useEffect, useMemo, useState } from 'react'
import {
  downloadNeuralVoice,
  removeNeuralVoice,
  storedNeuralVoices,
} from '../lib/neural'
import { previewVoice } from '../lib/tts'
import {
  NEURAL_VOICES,
  neuralVoiceToAppVoice,
  systemVoiceToAppVoice,
  type AppVoice,
} from '../lib/voices'

interface Props {
  isOpen: boolean
  systemVoices: SpeechSynthesisVoice[]
  selectedKey: string | null
  onSelect: (voice: AppVoice) => void
  /** Notifies the reader that the set of downloaded voices changed. */
  onStoredChange: (stored: Set<string>) => void
  onDismiss: () => void
}

/** Human-readable language label for a BCP-47 tag, in the UI language. */
function languageLabel(lang: string): string {
  try {
    const name = new Intl.DisplayNames(['de'], { type: 'language' }).of(
      lang.split('-')[0],
    )
    return name ?? lang
  } catch {
    return lang
  }
}

/** German first, then alphabetically – used for both voice sections. */
function langOrder(a: string, b: string): number {
  const aDe = a.toLowerCase().startsWith('de')
  const bDe = b.toLowerCase().startsWith('de')
  if (aDe !== bDe) return aDe ? -1 : 1
  return languageLabel(a).localeCompare(languageLabel(b))
}

export default function VoiceSheet({
  isOpen,
  systemVoices,
  selectedKey,
  onSelect,
  onStoredChange,
  onDismiss,
}: Props) {
  const [stored, setStored] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<Record<string, number>>({})
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [presentToast] = useIonToast()

  useEffect(() => {
    if (isOpen) {
      storedNeuralVoices().then(setStored)
    }
  }, [isOpen])

  const neural = useMemo(
    () =>
      [...NEURAL_VOICES].sort(
        (a, b) => langOrder(a.lang, b.lang) || a.name.localeCompare(b.name),
      ),
    [],
  )

  const system = useMemo(
    () =>
      [...systemVoices].sort(
        (a, b) => langOrder(a.lang, b.lang) || a.name.localeCompare(b.name),
      ),
    [systemVoices],
  )

  const updateStored = (next: Set<string>) => {
    setStored(next)
    onStoredChange(next)
  }

  const startDownload = async (id: string) => {
    setDownloading((d) => ({ ...d, [id]: 0 }))
    try {
      await downloadNeuralVoice(id as (typeof NEURAL_VOICES)[number]['id'], (percent) =>
        setDownloading((d) => ({ ...d, [id]: percent })),
      )
      updateStored(new Set([...stored, id]))
    } catch {
      presentToast({
        message:
          'Download fehlgeschlagen. Prüfe deine Internetverbindung und versuche es erneut.',
        duration: 3500,
        color: 'danger',
      })
    } finally {
      setDownloading((d) => {
        const { [id]: _removed, ...rest } = d
        return rest
      })
    }
  }

  const deleteVoice = async (id: string) => {
    await removeNeuralVoice(id as (typeof NEURAL_VOICES)[number]['id'])
    const next = new Set(stored)
    next.delete(id)
    updateStored(next)
  }

  const preview = async (voice: AppVoice) => {
    setPreviewing(voice.key)
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
        <IonList>
          <IonItemGroup>
            <IonItemDivider sticky>
              <IonLabel>Neuronale Stimmen · beste Qualität</IonLabel>
            </IonItemDivider>
            <div className="voice-section-note">
              Einmal herunterladen, danach komplett offline nutzbar. Läuft
              direkt auf deinem Gerät (Piper, WASM).
            </div>
            {neural.map((meta) => {
              const appVoice = neuralVoiceToAppVoice(meta)
              const isStored = stored.has(meta.id)
              const progress = downloading[meta.id]
              const isDownloading = progress !== undefined
              return (
                <IonItem
                  key={meta.id}
                  button={isStored}
                  onClick={isStored ? () => onSelect(appVoice) : undefined}
                >
                  <IonLabel>
                    <h2>{meta.name}</h2>
                    <IonNote>
                      {languageLabel(meta.lang)}
                      {isStored
                        ? ' · heruntergeladen, offline verfügbar'
                        : ` · ca. ${meta.sizeMB} MB`}
                    </IonNote>
                    {isDownloading && (
                      <IonProgressBar
                        value={(progress ?? 0) / 100}
                        style={{ marginTop: 6 }}
                      />
                    )}
                  </IonLabel>
                  {appVoice.key === selectedKey && (
                    <IonIcon slot="end" color="primary" icon={checkmark} />
                  )}
                  {isStored && (
                    <>
                      <IonButton
                        slot="end"
                        fill="clear"
                        disabled={previewing !== null}
                        onClick={(event) => {
                          event.stopPropagation()
                          void preview(appVoice)
                        }}
                        aria-label={`Stimme ${meta.name} probehören`}
                      >
                        {previewing === appVoice.key ? (
                          <IonSpinner name="crescent" />
                        ) : (
                          <IonIcon slot="icon-only" icon={volumeMediumOutline} />
                        )}
                      </IonButton>
                      <IonButton
                        slot="end"
                        fill="clear"
                        color="medium"
                        onClick={(event) => {
                          event.stopPropagation()
                          void deleteVoice(meta.id)
                        }}
                        aria-label={`Stimmpaket ${meta.name} löschen`}
                      >
                        <IonIcon slot="icon-only" icon={trashOutline} />
                      </IonButton>
                    </>
                  )}
                  {!isStored && !isDownloading && (
                    <IonButton
                      slot="end"
                      fill="clear"
                      onClick={() => void startDownload(meta.id)}
                      aria-label={`Stimme ${meta.name} herunterladen`}
                    >
                      <IonIcon slot="icon-only" icon={cloudDownloadOutline} />
                    </IonButton>
                  )}
                  {isDownloading && (
                    <IonNote slot="end">{progress} %</IonNote>
                  )}
                </IonItem>
              )
            })}
          </IonItemGroup>

          <IonItemGroup>
            <IonItemDivider sticky>
              <IonLabel>Systemstimmen</IonLabel>
            </IonItemDivider>
            {system.length === 0 && (
              <div className="voice-section-note">
                Dein Browser stellt keine Systemstimmen bereit. Auf iOS und
                Android sind in den Systemeinstellungen weitere Stimmen zum
                Download verfügbar.
              </div>
            )}
            {system.map((voice) => {
              const appVoice = systemVoiceToAppVoice(voice)
              return (
                <IonItem
                  key={appVoice.key}
                  button
                  onClick={() => onSelect(appVoice)}
                >
                  <IonLabel>
                    <h2>{voice.name}</h2>
                    <IonNote>
                      {languageLabel(voice.lang)} ({voice.lang})
                      {voice.localService
                        ? ' · lokal, offline verfügbar'
                        : ' · benötigt Internet'}
                    </IonNote>
                  </IonLabel>
                  {appVoice.key === selectedKey && (
                    <IonIcon slot="end" color="primary" icon={checkmark} />
                  )}
                  <IonButton
                    slot="end"
                    fill="clear"
                    onClick={(event) => {
                      event.stopPropagation()
                      void preview(appVoice)
                    }}
                    aria-label={`Stimme ${voice.name} probehören`}
                  >
                    <IonIcon slot="icon-only" icon={volumeMediumOutline} />
                  </IonButton>
                </IonItem>
              )
            })}
          </IonItemGroup>
        </IonList>
      </IonContent>
    </IonModal>
  )
}
