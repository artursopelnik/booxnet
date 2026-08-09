import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonList,
  IonModal,
  IonPage,
  IonProgressBar,
  IonRange,
  IonSelect,
  IonSelectOption,
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
  textOutline,
} from 'ionicons/icons'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import VoiceSheet from '../components/VoiceSheet'
import { getBook, savePosition, type Book } from '../lib/db'
import {
  buildBookStructure,
  type BookStructure,
  type BuildToken,
  type PageGroup,
  type PageSentence,
} from '../lib/bookStructure'
import { unitName } from '../lib/importers'
import { detectStudioLang } from '../lib/lang'
import { isStudioEngineInstalled } from '../lib/supertonic/assets'
import {
  studioFlushPrefetches,
  studioWarmup,
  subscribeEngineProgress,
  subscribeSynthProgress,
} from '../lib/supertonic/client'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  getFontScale,
  getHighlightStyle,
  saveFontScale,
  saveHighlightStyle,
  type HighlightStyle,
} from '../lib/readerPrefs'
import {
  engineSpeed,
  getSavedRate,
  getSavedVoiceId,
  prefetchSentences,
  saveRate,
  saveVoiceId,
  Speaker,
  type SentenceInput,
  type SpeakerState,
} from '../lib/tts'
import {
  STUDIO_VOICES,
  studioVoiceById,
  type StudioVoiceMeta,
} from '../lib/voices'

const RATES = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75]

// Stabile Leerwerte: Neue Arrays/Maps pro Render wuerden die
// memoisierten Seiten bei jedem Satzwechsel neu zeichnen lassen.
const EMPTY_PAGES: PageGroup[] = []
const EMPTY_SENTENCE_PAGES = new Map<number, number[]>()
const EMPTY_SPEAK_ITEMS: SentenceInput[] = []

/**
 * Sätze, die bei ruhender Wiedergabe ab der Leseposition vorgerechnet
 * und dauerhaft gespeichert werden. Grob eine Minute Ton – genug, um
 * beim nächsten App-Start das Laden der Engine zu überbrücken.
 */
const IDLE_PREFETCH_AHEAD = 5

/**
 * One page/chapter/section. Memoized so that a sentence change only
 * re-renders the page that contains the highlight – crucial for large books.
 */
const PageSection = memo(function PageSection({
  pageIndex,
  unitLabel,
  sentences,
  activeIndex,
  onJump,
}: {
  pageIndex: number
  unitLabel: string
  sentences: PageSentence[]
  activeIndex: number
  onJump: (index: number) => void
}) {
  return (
    <section className="reader-page">
      {/* Als Überschrift, damit Screenreader per Überschriften-Navigation
          durch das Buch springen können – bei einem Buch die
          naheliegendste Navigation. Sieht unverändert aus. */}
      <h2 className="page-marker">
        {unitLabel} {pageIndex + 1}
      </h2>
      <p>
        {sentences.map((sentence) => (
          <span
            key={sentence.index}
            id={sentence.start ? `sentence-${sentence.index}` : undefined}
            className={
              sentence.index === activeIndex
                ? 'sentence sentence--active'
                : 'sentence'
            }
            role="button"
            // Nur der aktive Satz ist ein Tabulator-Halt: Bei einem Buch
            // mit tausenden Saetzen waere sonst jeder einzelne einer, und
            // die Tastaturbedienung waere praktisch unbrauchbar. Von dort
            // aus geht es mit den Pfeiltasten weiter (siehe keyHandler).
            tabIndex={sentence.index === activeIndex ? 0 : -1}
            aria-current={sentence.index === activeIndex ? 'true' : undefined}
            onClick={() => onJump(sentence.index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onJump(sentence.index)
              }
            }}
          >
            {sentence.text}{' '}
          </span>
        ))}
      </p>
    </section>
  )
})

/** Pages around the reading position that are always fully rendered. */
const RENDER_WINDOW = 5

/** Rough page height from its text, so placeholders keep the scrollbar
 * honest before the real content mounts. */
function estimatePageHeight(sentences: PageSentence[]): number {
  const chars = sentences.reduce((sum, s) => sum + s.text.length, 0)
  // ~45 characters per line at the reader's font size, ~32 px line height,
  // plus the page marker block.
  return Math.max(160, Math.round((chars / 45) * 32 + 80))
}

/**
 * Mounts a page's sentence spans only when it is near the viewport or
 * inside the render window around the reading position. Books with
 * hundreds of pages would otherwise build tens of thousands of DOM nodes
 * up front and make opening a book crawl on phones. Once rendered, a page
 * stays rendered so scrolling back never causes layout jumps.
 */
const LazyPage = memo(function LazyPage({
  pageIndex,
  unitLabel,
  sentences,
  activeIndex,
  forceRender,
  onJump,
}: {
  pageIndex: number
  unitLabel: string
  sentences: PageSentence[]
  activeIndex: number
  forceRender: boolean
  onJump: (index: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)

  useEffect(() => {
    if (nearViewport) return
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true)
        }
      },
      { rootMargin: '1500px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [nearViewport])

  const rendered = nearViewport || forceRender
  return (
    <div
      ref={ref}
      style={rendered ? undefined : { minHeight: estimatePageHeight(sentences) }}
    >
      {rendered ? (
        <PageSection
          pageIndex={pageIndex}
          unitLabel={unitLabel}
          sentences={sentences}
          activeIndex={activeIndex}
          onJump={onJump}
        />
      ) : (
        <h2 className="page-marker">
          {unitLabel} {pageIndex + 1}
        </h2>
      )}
    </div>
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
  const [bookLang, setBookLang] = useState('de')
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  /** 0..1 – Stand des einmaligen Engine-Ladens, 1 = Engine bereit. */
  const [engineProgress, setEngineProgress] = useState(0)
  /** 0..1 – Rechenschritte der gerade laufenden Satz-Berechnung. */
  const [synthProgress, setSynthProgress] = useState(0)
  const [fontScale, setFontScale] = useState(getFontScale())
  const [highlightStyle, setHighlightStyle] = useState<HighlightStyle>(
    getHighlightStyle(),
  )
  const [presentToast] = useIonToast()

  const speakerRef = useRef<Speaker | null>(null)
  const toastRef = useRef(presentToast)
  toastRef.current = presentToast
  /** Suppresses auto-follow briefly after the user scrolled manually. */
  const userScrollUntil = useRef(0)
  const programmaticScroll = useRef(false)
  /** Läuft nach einem automatischen Bildlauf; gibt die Erkennung frei. */
  const scrollReleaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Satz- und Sprechstruktur des Buchs. Bewusst NICHT im Render
   * berechnet: Bei einem 400-Seiten-Buch dauert der Aufbau auf einem
   * Handy grob eine Sekunde, in der der Bildschirm sonst still stuende.
   * Er laeuft jetzt portionsweise im Hintergrund, die Oberflaeche bleibt
   * bedienbar und zeigt den Fortschritt.
   */
  const [structure, setStructure] = useState<BookStructure | null>(null)
  const [structureProgress, setStructureProgress] = useState(0)

  useEffect(() => {
    if (!book) {
      setStructure(null)
      return
    }
    const token: BuildToken = { cancelled: false }
    setStructure(null)
    setStructureProgress(0)
    void buildBookStructure(book.pages, token, setStructureProgress).then(
      (built) => {
        if (built) setStructure(built)
      },
    )
    return () => {
      token.cancelled = true
    }
  }, [book])

  const pages = structure?.pages ?? EMPTY_PAGES
  const pagesOfSentence = structure?.pagesOfSentence ?? EMPTY_SENTENCE_PAGES
  const speakItems = structure?.speakItems ?? EMPTY_SPEAK_ITEMS

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

  useEffect(() => subscribeEngineProgress(setEngineProgress), [])
  useEffect(() => subscribeSynthProgress(setSynthProgress), [])

  useEffect(() => {
    speaker.setSentences(speakItems)
  }, [speaker, speakItems])

  useEffect(() => {
    if (!book) return
    // Nur die ersten Seiten: detectStudioLang wertet ohnehin bloss die
    // ersten 4000 Zeichen aus - der ganze Buchtext waere ein Megabyte,
    // das sofort wieder weggeworfen wird.
    const detected = detectStudioLang(book.pages.slice(0, 5).join(' '))
    setBookLang(detected)
    speaker.setLangHint(detected)
  }, [speaker, book])

  const voice: StudioVoiceMeta =
    studioVoiceById(voiceId) ?? STUDIO_VOICES[0]

  // Warm the engine (and the selected voice's style) as soon as the reader
  // opens – loading ~400 MB of sessions takes long, and doing it here makes
  // the first press on Play feel instant instead of frozen. Bewusst KEIN
  // Begrüßungs-Vorrendern hier: Diese langen Renderings blockierten als
  // laufende Warteschlangen-Köpfe jeden Play-Druck mit neuer Stimme
  // minutenlang – Begrüßungen wärmt nur noch die Stimmen-Auswahl.
  useEffect(() => {
    if (engineInstalled) {
      studioWarmup(voice.id)
    }
  }, [engineInstalled, voice.id])

  useEffect(() => {
    speaker.setVoice(voice)
  }, [speaker, voice])

  // Fuer den Sperrbildschirm: Titel und Cover des laufenden Buchs.
  useEffect(() => {
    if (book) speaker.setBookInfo(book.title, book.cover)
  }, [speaker, book])

  /** Aktuelle Position für Effekte, die nicht pro Satz neu laufen sollen. */
  const currentRef = useRef(current)
  currentRef.current = current

  // Warm up the engine and the next sentences as soon as the reader is
  // open – tapping Play then starts quickly instead of on a cold engine.
  // Ab der LESEPOSITION, nicht ab Buchanfang: Wer mitten im Buch
  // weiterhört, bekam sonst einen kalten Start.
  useEffect(() => {
    if (!engineInstalled || speakItems.length === 0) return
    // Nur solange nichts läuft: Während der Wiedergabe berechnet der
    // Speaker selbst voraus (ab dem NÄCHSTEN Satz) – der aktuelle spielt
    // bei Tempo-/Stimmwechsel hörbar weiter und braucht keine neue Fassung.
    const speakerState = speaker.getState()
    if (speakerState === 'playing' || speakerState === 'loading') return
    // Fünf Sätze statt zwei: Sie landen dauerhaft im Speicher und müssen
    // beim nächsten App-Start das Laden der Engine mit Ton überbrücken –
    // dafür reichen zwei Sätze nicht.
    // Schleife mit Frueh-Abbruch statt slice().filter(): Letzteres kopiert
    // den gesamten Buchrest (bis zu 15.000 Elemente) zweimal, um fuenf
    // Saetze zu behalten.
    const next: string[] = []
    for (let i = currentRef.current; i < speakItems.length; i++) {
      if (speakItems[i].skip) continue
      next.push(speakItems[i].text)
      if (next.length >= IDLE_PREFETCH_AHEAD) break
    }
    if (next.length > 0) {
      prefetchSentences(voice.id, bookLang, next, engineSpeed(rate))
    }
  }, [engineInstalled, speakItems, voice.id, bookLang, rate, speaker])

  useEffect(() => {
    speaker.setRate(rate)
  }, [speaker, rate])

  // Persist the position, throttled so IndexedDB writes don't pile up.
  useEffect(() => {
    if (!book) return
    const timer = setTimeout(() => savePosition(book.id, current), 800)
    return () => clearTimeout(timer)
  }, [book, current])

  // Beim Verlassen die zuletzt erreichte Position auf jeden Fall sichern:
  // Der gedrosselte Effekt oben verwirft seinen Timer beim Aufräumen, wer
  // also innerhalb der 800 ms zurück in die Bibliothek geht, verlöre den
  // Fortschritt der letzten Sätze.
  useEffect(() => {
    if (!book) return
    return () => {
      void savePosition(book.id, currentRef.current)
    }
  }, [book])

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
    // Nur EIN laufender Timer: Bei schnellen Satzwechseln würde sonst ein
    // älterer Timer die Markierung mitten im noch laufenden Bildlauf
    // freigeben – das zählte als Nutzer-Scrollen und schaltete das
    // automatische Mitlaufen für 2,5 Sekunden ab.
    if (scrollReleaseTimer.current !== null) {
      clearTimeout(scrollReleaseTimer.current)
    }
    scrollReleaseTimer.current = setTimeout(() => {
      scrollReleaseTimer.current = null
      programmaticScroll.current = false
    }, 700)
  }, [current, state])

  useEffect(
    () => () => {
      if (scrollReleaseTimer.current !== null) {
        clearTimeout(scrollReleaseTimer.current)
      }
    },
    [],
  )

  // Keyboard control: Space toggles playback, arrow keys skip sentences.
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {})
  keyHandler.current = (event: KeyboardEvent) => {
    if (voiceSheetOpen || displayOpen) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable]')) return
    // Liegt der Fokus auf einem Bedienelement, gehoert die Taste diesem:
    // Sonst loeste die Leertaste auf dem Button "Ein Satz vor" Play/Pause
    // aus – und unterdrueckte per preventDefault zusaetzlich die normale
    // Aktivierung des Buttons.
    if (
      target?.closest(
        'button, a, [role="button"], ion-button, ion-back-button, ion-range, ion-select, ion-toggle, ion-item[button]',
      )
    ) {
      return
    }
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
      // React instantly – never make the play button wait on OPFS, which
      // can be slow on iOS. The sheet opens right away; a background
      // re-check corrects stale state (e.g. download finished elsewhere).
      setVoiceSheetOpen(true)
      toastRef.current({
        message: 'Lade zuerst einmalig das Sprachmodell herunter.',
        duration: 3000,
        color: 'warning',
      })
      void isStudioEngineInstalled().then(setEngineInstalled)
      return
    }
    speaker.play(current)
  }

  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1
    // Vorausberechnungen im alten Tempo sind ab jetzt wertlos und würden
    // die im neuen Tempo nur blockieren – verwerfen, BEVOR die Effekte
    // nach dem Re-Render die neuen Prefetches einreihen.
    studioFlushPrefetches()
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
          <div className="empty-state" role="status">
            <IonSpinner aria-hidden="true" />
            <span className="visually-hidden">Buch wird geladen</span>
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

  const activePages = pagesOfSentence.get(current)
  const activePage = activePages?.[0] ?? -1
  const unitLabel = unitName(book.unit)

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
          {/* Logo links (hinter dem Zurück-Pfeil), rechts die Aktionen. */}
          <img
            slot="start"
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt=""
          />
          <IonTitle role="heading" aria-level={1} className="reader-title">
            {book.title}
          </IonTitle>
          <IonButtons slot="end">
            <IonButton
              onClick={() => setDisplayOpen(true)}
              aria-label="Anzeige-Einstellungen"
            >
              <IonIcon aria-hidden="true" slot="icon-only" icon={textOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent
        fullscreen
        className="reader-content"
        scrollEvents
        onIonScrollStart={onUserScrollStart}
      >
        <article
          className={`reader-text hl-${highlightStyle}`}
          style={
            { '--reader-font-scale': fontScale / 100 } as React.CSSProperties
          }
        >
          {book.cover && (
            <img
              className="reader-cover"
              src={book.cover}
              alt={`Cover: ${book.title}`}
            />
          )}
          {/* Der Aufbau der Satzstruktur laeuft portionsweise; bis er
              fertig ist, steht hier ein Fortschritt statt einer leeren
              Seite. Bei kleinen Buechern ist er sofort vorbei. */}
          {structure === null && (
            <div className="structure-loading" role="status">
              <IonProgressBar
                value={structureProgress}
                aria-label="Buch wird aufbereitet"
              />
              <p>Das Buch wird aufbereitet …</p>
            </div>
          )}
          {pages.map((page) => (
            <LazyPage
              key={page.pageIndex}
              pageIndex={page.pageIndex}
              unitLabel={unitLabel}
              sentences={page.sentences}
              // Auch die Folgeseite markiert ihr Segment, wenn der aktive
              // Satz über die Seitengrenze läuft.
              activeIndex={
                activePages?.includes(page.pageIndex) ? current : -1
              }
              forceRender={Math.abs(page.pageIndex - activePage) <= RENDER_WINDOW}
              onJump={jumpTo}
            />
          ))}
        </article>
      </IonContent>

      <IonFooter translucent>
        {/* Jede Wartephase zeigt echten Fortschritt mit Prozent und
            Erklärtext – sonst wirkte die App bei langen Ladezeiten wie
            eingefroren: erst das einmalige Engine-Laden (App-Kaltstart,
            byte-gewichtet), danach die Rechenschritte der Satz-Berechnung.
            Solange noch kein Fortschritt gemeldet wurde, läuft der Balken
            unbestimmt; der Text (per CSS leicht verzögert eingeblendet)
            steht trotzdem da. */}
        {state === 'loading' && (
          <>
            {(engineProgress < 1 ? engineProgress : synthProgress) > 0 ? (
              <IonProgressBar
                value={engineProgress < 1 ? engineProgress : synthProgress}
                aria-label="Fortschritt der Sprachvorbereitung"
              />
            ) : (
              <IonProgressBar
                type="indeterminate"
                aria-label="Sprachvorbereitung läuft"
              />
            )}
            <div className="engine-loading-hint" aria-hidden="true">
              {engineProgress < 1
                ? `Die Vorlesestimme wird einmalig vorbereitet – ${Math.round(engineProgress * 100)} %`
                : `Der Satz wird berechnet – ${Math.round(synthProgress * 100)} %`}
            </div>
          </>
        )}
        {/* Zustandsansage fuer Screenreader: Ohne sie passiert nach dem
            Druck auf Play hoerbar nichts, solange die Engine laedt - und
            das kann Minuten dauern. Bewusst NUR der Zustand, nicht der
            Prozentwert: Eine Live-Region, die sich mit jedem Prozent
            aendert, unterbricht den Nutzer hunderte Male. */}
        <div className="visually-hidden" role="status">
          {state === 'loading'
            ? 'Die Vorlesestimme wird vorbereitet'
            : state === 'playing'
              ? 'Wird vorgelesen'
              : state === 'paused'
                ? 'Angehalten'
                : ''}
        </div>
        <IonToolbar className="player-toolbar">
          <div className="player">
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
                aria-label={`Lesegeschwindigkeit ${rate}-fach, ändern`}
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
        onPreviewStart={() => speaker.pause()}
        canWarmPreviews={state === 'idle'}
      />

      {/* Anzeige-Einstellungen als halbhohes Sheet: Der Text dahinter
          bleibt sichtbar, Änderungen wirken sofort als Live-Vorschau. */}
      <IonModal
        isOpen={displayOpen}
        onDidDismiss={() => setDisplayOpen(false)}
        initialBreakpoint={0.45}
        breakpoints={[0, 0.45, 0.75]}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle>Anzeige</IonTitle>
            <IonButtons slot="end">
              <IonButton strong onClick={() => setDisplayOpen(false)}>
                Fertig
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <IonList inset>
            <IonItem>
              <IonRange
                aria-label="Schriftgröße"
                min={FONT_SCALE_MIN}
                max={FONT_SCALE_MAX}
                step={FONT_SCALE_STEP}
                snaps
                value={fontScale}
                onIonInput={(event) => {
                  const value = Number(event.detail.value)
                  setFontScale(value)
                  saveFontScale(value)
                }}
              >
                {/* Rein visuelle Skala – Screenreader lesen sonst
                    "A ... A" um den Schieberegler herum. */}
                <span aria-hidden="true" slot="start" style={{ fontSize: '0.85rem' }}>
                  A
                </span>
                <span aria-hidden="true" slot="end" style={{ fontSize: '1.5rem' }}>
                  A
                </span>
              </IonRange>
            </IonItem>
            <IonItem>
              <IonSelect
                label="Markierung"
                interface="popover"
                value={highlightStyle}
                onIonChange={(event) => {
                  const value = event.detail.value as HighlightStyle
                  setHighlightStyle(value)
                  saveHighlightStyle(value)
                }}
              >
                <IonSelectOption value="mark">Hinterlegt</IonSelectOption>
                <IonSelectOption value="underline">
                  Unterstrichen
                </IonSelectOption>
                <IonSelectOption value="invert">Invertiert</IonSelectOption>
              </IonSelect>
            </IonItem>
          </IonList>
        </IonContent>
      </IonModal>
    </IonPage>
  )
}
