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
  IonSearchbar,
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
import { useEffect, useMemo, useState } from 'react'
import {
  downloadNeuralVoice,
  removeNeuralVoice,
  storedNeuralVoices,
} from '../lib/neural'
import {
  downloadStudioEngine,
  isStudioEngineInstalled,
  removeStudioData,
  STUDIO_ENGINE_SIZE_MB,
} from '../lib/supertonic/assets'
import { resetStudioEngine } from '../lib/supertonic/engine'
import { previewVoice } from '../lib/tts'
import {
  NEURAL_VOICES,
  neuralVoiceToAppVoice,
  STUDIO_LANGS,
  STUDIO_VOICES,
  studioVoiceToAppVoice,
  systemVoiceToAppVoice,
  type AppVoice,
  type NeuralQuality,
} from '../lib/voices'

interface Props {
  isOpen: boolean
  systemVoices: SpeechSynthesisVoice[]
  selectedKey: string | null
  onSelect: (voice: AppVoice) => void
  /** Notifies the reader that the set of downloaded Piper voices changed. */
  onStoredChange: (stored: Set<string>) => void
  /** Notifies the reader that the studio pack was installed or removed. */
  onStudioChange: (installed: boolean) => void
  onDismiss: () => void
}

const QUALITY_LABEL: Record<NeuralQuality, string> = {
  x_low: 'sehr klein',
  low: 'klein',
  medium: 'mittel',
  high: 'beste Qualität',
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

/** German first, then alphabetically – used for all voice sections. */
function langOrder(a: string, b: string): number {
  const aDe = a.toLowerCase().startsWith('de')
  const bDe = b.toLowerCase().startsWith('de')
  if (aDe !== bDe) return aDe ? -1 : 1
  return languageLabel(a).localeCompare(languageLabel(b))
}

const QUALITY_RANK: Record<NeuralQuality, number> = {
  high: 0,
  medium: 1,
  low: 2,
  x_low: 3,
}

export default function VoiceSheet({
  isOpen,
  systemVoices,
  selectedKey,
  onSelect,
  onStoredChange,
  onStudioChange,
  onDismiss,
}: Props) {
  const [stored, setStored] = useState<Set<string>>(new Set())
  const [studioInstalled, setStudioInstalled] = useState(false)
  const [studioProgress, setStudioProgress] = useState<number | null>(null)
  const [downloading, setDownloading] = useState<Record<string, number>>({})
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [presentToast] = useIonToast()

  useEffect(() => {
    if (isOpen) {
      storedNeuralVoices().then(setStored)
      isStudioEngineInstalled().then(setStudioInstalled)
    }
  }, [isOpen])

  const matches = (name: string, lang: string) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (
      name.toLowerCase().includes(q) ||
      languageLabel(lang).toLowerCase().includes(q) ||
      lang.toLowerCase().includes(q)
    )
  }

  const neural = useMemo(
    () =>
      [...NEURAL_VOICES].sort(
        (a, b) =>
          langOrder(a.lang, b.lang) ||
          QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality] ||
          a.name.localeCompare(b.name),
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

  const startStudioDownload = async () => {
    setStudioProgress(0)
    try {
      await downloadStudioEngine(setStudioProgress)
      setStudioInstalled(true)
      onStudioChange(true)
    } catch {
      presentToast({
        message:
          'Download des Sprachmodells fehlgeschlagen. Prüfe deine Internetverbindung und versuche es erneut – bereits geladene Teile bleiben erhalten.',
        duration: 4000,
        color: 'danger',
      })
    } finally {
      setStudioProgress(null)
    }
  }

  const deleteStudioData = async () => {
    await removeStudioData()
    resetStudioEngine()
    setStudioInstalled(false)
    onStudioChange(false)
  }

  const startDownload = async (id: string) => {
    setDownloading((d) => ({ ...d, [id]: 0 }))
    try {
      await downloadNeuralVoice(
        id as (typeof NEURAL_VOICES)[number]['id'],
        (percent) => setDownloading((d) => ({ ...d, [id]: percent })),
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

  const previewButton = (voice: AppVoice) => (
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
      {previewing === voice.key ? (
        <IonSpinner name="crescent" />
      ) : (
        <IonIcon slot="icon-only" icon={volumeMediumOutline} />
      )}
    </IonButton>
  )

  const studioVoicesFiltered = STUDIO_VOICES.filter((meta) =>
    matches(meta.name, 'de'),
  )

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
        <IonToolbar>
          <IonSearchbar
            value={query}
            onIonInput={(event) => setQuery(event.detail.value ?? '')}
            placeholder="Name oder Sprache suchen"
          />
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItemGroup>
            <IonItemDivider sticky>
              <IonLabel>Studio-Stimmen · Supertonic 3</IonLabel>
            </IonItemDivider>
            <div className="voice-section-note">
              10 Stimmen in Studioqualität (44,1 kHz), jede spricht{' '}
              {STUDIO_LANGS.length} Sprachen. Die Stimmen selbst sind winzig
              (wenige hundert KB) und laden einzeln – nur das gemeinsame
              Sprachmodell dahinter wird einmalig heruntergeladen. Danach
              läuft alles offline.
            </div>
            {!studioInstalled && (
              <IonItem
                button={studioProgress === null}
                onClick={
                  studioProgress === null
                    ? () => void startStudioDownload()
                    : undefined
                }
              >
                <IonIcon slot="start" icon={sparklesOutline} color="primary" />
                <IonLabel>
                  <h2>Sprachmodell herunterladen</h2>
                  <IonNote>
                    {studioProgress === null
                      ? `Einmalig ca. ${STUDIO_ENGINE_SIZE_MB} MB – schaltet alle 10 Stimmen frei`
                      : `Wird geladen … ${studioProgress} %`}
                  </IonNote>
                  {studioProgress !== null && (
                    <IonProgressBar
                      value={studioProgress / 100}
                      style={{ marginTop: 6 }}
                    />
                  )}
                </IonLabel>
                {studioProgress === null && (
                  <IonIcon slot="end" icon={cloudDownloadOutline} />
                )}
              </IonItem>
            )}
            {studioVoicesFiltered.map((meta) => {
              const appVoice = studioVoiceToAppVoice(meta)
              return (
                <IonItem
                  key={meta.id}
                  button={studioInstalled}
                  disabled={!studioInstalled}
                  onClick={
                    studioInstalled ? () => onSelect(appVoice) : undefined
                  }
                >
                  <IonLabel>
                    <h2>{meta.name}</h2>
                    <IonNote>
                      {meta.gender === 'm' ? 'Männlich' : 'Weiblich'} · Studio{' '}
                      {meta.id} · {STUDIO_LANGS.length} Sprachen
                      {studioInstalled
                        ? ' · offline'
                        : ' · benötigt das Sprachmodell'}
                    </IonNote>
                  </IonLabel>
                  {appVoice.key === selectedKey && (
                    <IonIcon slot="end" color="primary" icon={checkmark} />
                  )}
                  {studioInstalled && previewButton(appVoice)}
                </IonItem>
              )
            })}
            {studioInstalled && (
              <IonItem button onClick={() => void deleteStudioData()}>
                <IonIcon slot="start" icon={trashOutline} color="medium" />
                <IonLabel color="medium">
                  Sprachmodell löschen ({STUDIO_ENGINE_SIZE_MB} MB freigeben)
                </IonLabel>
              </IonItem>
            )}
          </IonItemGroup>

          <IonItemGroup>
            <IonItemDivider sticky>
              <IonLabel>Neuronale Stimmen · Piper</IonLabel>
            </IonItemDivider>
            <div className="voice-section-note">
              {NEURAL_VOICES.length} Stimmen, je Stimme ein Download – danach
              offline nutzbar.
            </div>
            {neural
              .filter((meta) => matches(meta.name, meta.lang))
              .map((meta) => {
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
                        {languageLabel(meta.lang)} ·{' '}
                        {QUALITY_LABEL[meta.quality]}
                        {isStored
                          ? ' · heruntergeladen'
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
                        {previewButton(appVoice)}
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
                        <IonIcon
                          slot="icon-only"
                          icon={cloudDownloadOutline}
                        />
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
            {system
              .filter((voice) => matches(voice.name, voice.lang))
              .map((voice) => {
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
                    {previewButton(appVoice)}
                  </IonItem>
                )
              })}
          </IonItemGroup>
        </IonList>
      </IonContent>
    </IonModal>
  )
}
