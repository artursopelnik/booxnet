import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonNote,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
  useIonToast,
  useIonViewWillLeave,
} from '@ionic/react'
import {
  pause,
  personCircleOutline,
  play,
  playBack,
  playForward,
} from 'ionicons/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import VoiceSheet from '../components/VoiceSheet'
import { getBook, savePosition, type Book } from '../lib/db'
import { detectStudioLang } from '../lib/lang'
import { storedNeuralVoices } from '../lib/neural'
import { isStudioEngineInstalled } from '../lib/supertonic/assets'
import { toSentences } from '../lib/text'
import {
  getSavedRate,
  getSavedVoiceKey,
  loadSystemVoices,
  saveRate,
  saveVoiceKey,
  Speaker,
  type SpeakerState,
} from '../lib/tts'
import {
  NEURAL_VOICES,
  neuralVoiceToAppVoice,
  STUDIO_VOICES,
  studioVoiceToAppVoice,
  systemVoiceToAppVoice,
  type AppVoice,
} from '../lib/voices'

const RATES = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75]

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<Book | null | undefined>(undefined)
  const [systemVoices, setSystemVoices] = useState<SpeechSynthesisVoice[]>([])
  const [storedNeural, setStoredNeural] = useState<Set<string>>(new Set())
  const [studioInstalled, setStudioInstalled] = useState(false)
  const [voiceKey, setVoiceKey] = useState<string | null>(getSavedVoiceKey())
  const [rate, setRate] = useState(getSavedRate())
  const [state, setState] = useState<SpeakerState>('idle')
  const [current, setCurrent] = useState(0)
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false)
  const [presentToast] = useIonToast()

  const speakerRef = useRef<Speaker | null>(null)
  const toastRef = useRef(presentToast)
  toastRef.current = presentToast

  const sentences = useMemo(
    () => (book ? toSentences(book.pages) : []),
    [book],
  )

  if (!speakerRef.current) {
    speakerRef.current = new Speaker({
      onSentence: setCurrent,
      onStateChange: setState,
      onError: (message) =>
        toastRef.current({ message, duration: 4000, color: 'danger' }),
    })
  }
  const speaker = speakerRef.current

  useEffect(() => {
    getBook(id).then((loaded) => {
      setBook(loaded ?? null)
      if (loaded) setCurrent(loaded.position)
    })
  }, [id])

  useEffect(() => {
    loadSystemVoices().then(setSystemVoices)
    storedNeuralVoices().then(setStoredNeural)
    isStudioEngineInstalled().then(setStudioInstalled)
  }, [])

  useEffect(() => {
    speaker.setSentences(sentences.map((s) => s.text))
  }, [speaker, sentences])

  // Detected book language, used by the multilingual studio engine.
  useEffect(() => {
    if (!book) return
    speaker.setLangHint(detectStudioLang(book.pages.join(' ')))
  }, [speaker, book])

  // All voices the user can actually use right now.
  const availableVoices = useMemo<AppVoice[]>(
    () => [
      ...(studioInstalled ? STUDIO_VOICES.map(studioVoiceToAppVoice) : []),
      ...NEURAL_VOICES.filter((meta) => storedNeural.has(meta.id)).map(
        neuralVoiceToAppVoice,
      ),
      ...systemVoices.map(systemVoiceToAppVoice),
    ],
    [studioInstalled, storedNeural, systemVoices],
  )

  const voice = useMemo(() => {
    if (availableVoices.length === 0) return null
    const isGerman = (v: AppVoice) => v.lang.toLowerCase().startsWith('de')
    return (
      availableVoices.find((v) => v.key === voiceKey) ??
      availableVoices.find((v) => v.kind === 'neural' && isGerman(v)) ??
      availableVoices.find((v) => v.kind === 'system' && isGerman(v)) ??
      availableVoices.find(
        (v) => v.kind === 'system' && v.systemVoice.default,
      ) ??
      availableVoices[0]
    )
  }, [availableVoices, voiceKey])

  useEffect(() => {
    speaker.setVoice(voice)
  }, [speaker, voice])

  useEffect(() => {
    speaker.setRate(rate)
  }, [speaker, rate])

  // Persist the position and keep the current sentence in view.
  useEffect(() => {
    if (!book) return
    savePosition(book.id, current)
    const element = document.getElementById(`sentence-${current}`)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [book, current])

  useIonViewWillLeave(() => {
    speaker.stop()
  })
  useEffect(() => () => speaker.stop(), [speaker])

  const togglePlayback = () => {
    if (state === 'playing' || state === 'loading') speaker.pause()
    else speaker.play(current)
  }

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1
    setRate(next)
    saveRate(next)
  }

  const selectVoice = (selected: AppVoice) => {
    setVoiceKey(selected.key)
    saveVoiceKey(selected.key)
  }

  if (book === undefined) {
    return (
      <IonPage>
        <IonContent fullscreen>
          <div className="empty-state">
            <IonSpinner />
          </div>
        </IonContent>
      </IonPage>
    )
  }

  if (book === null) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start">
              <IonBackButton defaultHref="/library" text="Bibliothek" />
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent fullscreen>
          <div className="empty-state">
            <h2>Buch nicht gefunden</h2>
          </div>
        </IonContent>
      </IonPage>
    )
  }

  // Group the global sentence list back into pages for display.
  const pages = book.pages.map((_, pageIndex) => ({
    pageIndex,
    sentences: [] as { index: number; text: string }[],
  }))
  sentences.forEach((sentence, index) => {
    pages[sentence.page]?.sentences.push({ index, text: sentence.text })
  })

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/library" text="Bibliothek" />
          </IonButtons>
          <IonTitle>{book.title}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="reader-content">
        <article className="reader-text">
          {pages.map((page) =>
            page.sentences.length === 0 ? null : (
              <section key={page.pageIndex}>
                <div className="page-marker">Seite {page.pageIndex + 1}</div>
                <p>
                  {page.sentences.map((sentence) => (
                    <span
                      key={sentence.index}
                      id={`sentence-${sentence.index}`}
                      className={
                        sentence.index === current
                          ? 'sentence sentence--active'
                          : 'sentence'
                      }
                      onClick={() => speaker.jumpTo(sentence.index)}
                    >
                      {sentence.text}{' '}
                    </span>
                  ))}
                </p>
              </section>
            ),
          )}
        </article>
      </IonContent>

      <IonFooter translucent>
        <IonToolbar className="player-toolbar">
          <div className="player">
            <div className="player__meta">
              <IonNote>
                Satz {Math.min(current + 1, sentences.length)} von{' '}
                {sentences.length}
                {voice &&
                  ` · ${voice.name}${
                    voice.kind === 'neural'
                      ? ' (neuronal)'
                      : voice.kind === 'studio'
                        ? ' (Studio)'
                        : ''
                  }`}
              </IonNote>
            </div>
            <div className="player__controls">
              <IonButton
                fill="clear"
                onClick={() => setVoiceSheetOpen(true)}
                aria-label="Stimme auswählen"
              >
                <IonIcon slot="icon-only" icon={personCircleOutline} />
              </IonButton>
              <IonButton
                fill="clear"
                onClick={() => speaker.skip(-1)}
                aria-label="Ein Satz zurück"
              >
                <IonIcon slot="icon-only" icon={playBack} />
              </IonButton>
              <IonButton
                className="player__play"
                shape="round"
                onClick={togglePlayback}
                aria-label={
                  state === 'playing' || state === 'loading'
                    ? 'Pause'
                    : 'Vorlesen'
                }
              >
                {state === 'loading' ? (
                  <IonSpinner name="crescent" />
                ) : (
                  <IonIcon
                    slot="icon-only"
                    icon={state === 'playing' ? pause : play}
                  />
                )}
              </IonButton>
              <IonButton
                fill="clear"
                onClick={() => speaker.skip(1)}
                aria-label="Ein Satz vor"
              >
                <IonIcon slot="icon-only" icon={playForward} />
              </IonButton>
              <IonButton
                fill="clear"
                className="player__rate"
                onClick={cycleRate}
                aria-label="Lesegeschwindigkeit ändern"
              >
                {rate}×
              </IonButton>
            </div>
          </div>
        </IonToolbar>
      </IonFooter>

      <VoiceSheet
        isOpen={voiceSheetOpen}
        systemVoices={systemVoices}
        selectedKey={voice?.key ?? null}
        onSelect={selectVoice}
        onStoredChange={setStoredNeural}
        onStudioChange={setStudioInstalled}
        onDismiss={() => setVoiceSheetOpen(false)}
      />
    </IonPage>
  )
}
