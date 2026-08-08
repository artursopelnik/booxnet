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
  IonProgressBar,
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
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useParams } from 'react-router'
import VoiceSheet from '../components/VoiceSheet'
import { getBook, savePosition, type Book } from '../lib/db'
import { detectStudioLang, langLabel } from '../lib/lang'
import { isStudioEngineInstalled } from '../lib/supertonic/assets'
import { studioPrefetch } from '../lib/supertonic/client'
import { isSpeakable, sanitizeForSpeech, toSentences } from '../lib/text'
import {
  engineSpeed,
  getSavedRate,
  getSavedVoiceId,
  saveRate,
  saveVoiceId,
  Speaker,
  type SpeakerState,
} from '../lib/tts'
import {
  STUDIO_VOICES,
  studioVoiceById,
  type StudioVoiceMeta,
} from '../lib/voices'

const RATES = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75]

/** Punctuation-aware pause: questions/exclamations breathe a bit longer,
 * colons and semicolons connect more tightly to what follows. */
function pauseForEnding(text: string): number {
  const end = text.trim().slice(-1)
  if (end === '?' || end === '!' || end === '…' || end === '！' || end === '？')
    return 480
  if (end === ':' || end === ';') return 280
  return 350
}

interface PageSentence {
  index: number
  text: string
}

/**
 * One PDF page. Memoized so that a sentence change only re-renders the
 * page that contains the highlight – crucial for large books.
 */
const PageSection = memo(function PageSection({
  pageIndex,
  sentences,
  activeIndex,
  onJump,
}: {
  pageIndex: number
  sentences: PageSentence[]
  activeIndex: number
  onJump: (index: number) => void
}) {
  return (
    <section className="reader-page">
      <div className="page-marker">Seite {pageIndex + 1}</div>
      <p>
        {sentences.map((sentence) => (
          <span
            key={sentence.index}
            id={`sentence-${sentence.index}`}
            className={
              sentence.index === activeIndex
                ? 'sentence sentence--active'
                : 'sentence'
            }
            onClick={() => onJump(sentence.index)}
          >
            {sentence.text}{' '}
          </span>
        ))}
      </p>
    </section>
  )
})

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<Book | null | undefined>(undefined)
  const [engineInstalled, setEngineInstalled] = useState(false)
  const [voiceId, setVoiceId] = useState<string>(
    () => getSavedVoiceId() ?? STUDIO_VOICES[0].id,
  )
  const [rate, setRate] = useState(getSavedRate())
  const [state, setState] = useState<SpeakerState>('idle')
  const [current, setCurrent] = useState(0)
  const [bookLang, setBookLang] = useState('na')
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false)
  const [presentToast] = useIonToast()

  const speakerRef = useRef<Speaker | null>(null)
  const toastRef = useRef(presentToast)
  toastRef.current = presentToast
  /** Suppresses auto-follow briefly after the user scrolled manually. */
  const userScrollUntil = useRef(0)
  const programmaticScroll = useRef(false)

  const sentences = useMemo(
    () => (book ? toSentences(book.pages) : []),
    [book],
  )

  // Sentences grouped per page, computed once per book.
  const pages = useMemo(() => {
    if (!book) return []
    const result = book.pages.map((_, pageIndex) => ({
      pageIndex,
      sentences: [] as PageSentence[],
    }))
    sentences.forEach((sentence, index) => {
      result[sentence.page]?.sentences.push({ index, text: sentence.text })
    })
    return result.filter((page) => page.sentences.length > 0)
  }, [book, sentences])

  // Maps a sentence index to its page, for targeted re-rendering.
  const pageOfSentence = useMemo(() => {
    const map = new Map<number, number>()
    for (const page of pages) {
      for (const sentence of page.sentences) {
        map.set(sentence.index, page.pageIndex)
      }
    }
    return map
  }, [pages])

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
    isStudioEngineInstalled().then(setEngineInstalled)
  }, [])

  // What the voice actually speaks: sanitized text (no PDF artifacts), a
  // subtle <breath> expression tag at page starts (natively supported by
  // Supertonic 3), longer pauses at page breaks, punctuation-aware pauses.
  // Fragments without real words (page numbers, ornaments) are skipped.
  const speakItems = useMemo(
    () =>
      sentences.map((sentence, index) => {
        const previous = sentences[index - 1]
        const next = sentences[index + 1]
        const startsPage =
          previous !== undefined && previous.page !== sentence.page
        const endsPage = next !== undefined && next.page !== sentence.page
        const clean = sanitizeForSpeech(sentence.text)
        const speakable = isSpeakable(clean)
        return {
          text: startsPage && speakable ? `<breath> ${clean}` : clean,
          pauseAfter: endsPage ? 750 : pauseForEnding(sentence.text),
          skip: !speakable,
        }
      }),
    [sentences],
  )

  useEffect(() => {
    speaker.setSentences(speakItems)
  }, [speaker, speakItems])

  // Progressive rendering: paint the pages around the reading position
  // immediately, fill in the rest in the background – huge books (hundreds
  // of pages) no longer freeze the UI when opening.
  const [visiblePages, setVisiblePages] = useState(8)
  useEffect(() => {
    if (!book) return
    const positionPage = pageOfSentence.get(book.position) ?? 0
    const startIndex = pages.findIndex((p) => p.pageIndex === positionPage)
    setVisiblePages(Math.max(8, startIndex + 4))
  }, [book, pages, pageOfSentence])
  useEffect(() => {
    if (visiblePages >= pages.length) return
    const timer = setTimeout(
      () => setVisiblePages((v) => Math.min(v + 15, pages.length)),
      100,
    )
    return () => clearTimeout(timer)
  }, [visiblePages, pages.length])
  // Jumping forward must always render the target page.
  useEffect(() => {
    const page = pageOfSentence.get(current)
    if (page === undefined) return
    const index = pages.findIndex((p) => p.pageIndex === page)
    if (index >= 0) setVisiblePages((v) => Math.max(v, index + 2))
  }, [current, pages, pageOfSentence])

  useEffect(() => {
    if (!book) return
    const detected = detectStudioLang(book.pages.join(' '))
    setBookLang(detected)
    speaker.setLangHint(detected)
  }, [speaker, book])

  const voice: StudioVoiceMeta =
    studioVoiceById(voiceId) ?? STUDIO_VOICES[0]

  useEffect(() => {
    speaker.setVoice(voice)
  }, [speaker, voice])

  // Warm up the engine and the first sentences as soon as the reader is
  // open – tapping Play then starts quickly instead of on a cold engine.
  useEffect(() => {
    if (!engineInstalled || speakItems.length === 0) return
    const first = speakItems
      .filter((item) => !item.skip)
      .slice(0, 2)
      .map((item) => item.text)
    if (first.length > 0) {
      studioPrefetch(voice.id, bookLang, first, engineSpeed(rate))
    }
  }, [engineInstalled, speakItems, voice.id, bookLang, rate])

  useEffect(() => {
    speaker.setRate(rate)
  }, [speaker, rate])

  // Persist the position, throttled so IndexedDB writes don't pile up.
  useEffect(() => {
    if (!book) return
    const timer = setTimeout(() => savePosition(book.id, current), 800)
    return () => clearTimeout(timer)
  }, [book, current])

  // Follow the reading position – but never fight the user's own scrolling.
  useEffect(() => {
    if (state !== 'playing' && state !== 'loading') return
    if (Date.now() < userScrollUntil.current) return
    const element = document.getElementById(`sentence-${current}`)
    if (!element) return
    const rect = element.getBoundingClientRect()
    const height = window.innerHeight
    if (rect.top >= height * 0.15 && rect.bottom <= height * 0.7) return
    programmaticScroll.current = true
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    element.scrollIntoView({
      block: 'center',
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
    setTimeout(() => {
      programmaticScroll.current = false
    }, 700)
  }, [current, state])

  // Keyboard control: Space toggles playback, arrow keys skip sentences.
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {})
  keyHandler.current = (event: KeyboardEvent) => {
    if (voiceSheetOpen) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable]')) return
    if (event.code === 'Space') {
      event.preventDefault()
      togglePlayback()
    } else if (event.key === 'ArrowRight') {
      speaker.skip(1)
    } else if (event.key === 'ArrowLeft') {
      speaker.skip(-1)
    }
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const onUserScrollStart = useCallback(() => {
    if (!programmaticScroll.current) {
      userScrollUntil.current = Date.now() + 2500
    }
  }, [])

  useIonViewWillLeave(() => {
    speaker.stop()
  })
  useEffect(() => () => speaker.stop(), [speaker])

  const jumpTo = useCallback(
    (index: number) => speaker.jumpTo(index),
    [speaker],
  )

  const togglePlayback = () => {
    if (state === 'playing' || state === 'loading') {
      speaker.pause()
      return
    }
    if (!engineInstalled) {
      // Re-check OPFS – the state can be stale (e.g. download finished in
      // a second tab). Only the confirmed-missing case opens the sheet.
      void isStudioEngineInstalled().then((installed) => {
        setEngineInstalled(installed)
        if (installed) {
          speaker.play(current)
        } else {
          toastRef.current({
            message: 'Lade zuerst das Sprachmodell herunter (einmalig).',
            duration: 3000,
            color: 'warning',
          })
          setVoiceSheetOpen(true)
        }
      })
      return
    }
    speaker.play(current)
  }

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1
    setRate(next)
    saveRate(next)
  }

  const selectVoice = (selected: StudioVoiceMeta) => {
    setVoiceId(selected.id)
    saveVoiceId(selected.id)
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
              <IonBackButton
                defaultHref="/library"
                text=""
                aria-label="Zurück zur Bibliothek"
              />
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

  const activePage = pageOfSentence.get(current) ?? -1

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton
              defaultHref="/library"
              text=""
              aria-label="Zurück zur Bibliothek"
            />
          </IonButtons>
          <IonTitle className="reader-title">{book.title}</IonTitle>
          <img
            slot="end"
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="Booxnet"
          />
        </IonToolbar>
      </IonHeader>

      <IonContent
        fullscreen
        className="reader-content"
        scrollEvents
        onIonScrollStart={onUserScrollStart}
      >
        <article className="reader-text">
          {book.cover && (
            <img
              className="reader-cover"
              src={book.cover}
              alt={`Cover: ${book.title}`}
            />
          )}
          {pages.slice(0, visiblePages).map((page) => (
            <PageSection
              key={page.pageIndex}
              pageIndex={page.pageIndex}
              sentences={page.sentences}
              activeIndex={page.pageIndex === activePage ? current : -1}
              onJump={jumpTo}
            />
          ))}
        </article>
      </IonContent>

      <IonFooter translucent>
        {state === 'loading' && (
          <IonProgressBar type="indeterminate" aria-label="Stimme lädt" />
        )}
        <IonToolbar className="player-toolbar">
          <div className="player">
            <div className="player__meta">
              <IonNote aria-live="polite">
                {state === 'loading'
                  ? 'Stimme wird vorbereitet …'
                  : `Satz ${Math.min(current + 1, sentences.length)} von ${sentences.length} · ${voice.name} · ${langLabel(bookLang)}`}
              </IonNote>
            </div>
            <div className="player__controls">
              <IonButton
                fill="clear"
                onClick={() => setVoiceSheetOpen(true)}
                aria-label="Stimme auswählen"
              >
                <IonIcon aria-hidden="true" slot="icon-only" icon={personCircleOutline} />
              </IonButton>
              <IonButton
                fill="clear"
                onClick={() => speaker.skip(-1)}
                aria-label="Ein Satz zurück"
              >
                <IonIcon aria-hidden="true" slot="icon-only" icon={playBack} />
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
                    aria-hidden="true"
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
                <IonIcon aria-hidden="true" slot="icon-only" icon={playForward} />
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
        selectedId={voice.id}
        onSelect={selectVoice}
        onEngineChange={setEngineInstalled}
        onDismiss={() => setVoiceSheetOpen(false)}
      />
    </IonPage>
  )
}
