/**
 * Oberflächensprache.
 *
 * Bewusst ohne Bibliothek: Es geht um gut hundert feste Texte ohne
 * Plural- oder Datumsregeln, dafür lohnt kein Paket im Startpfad. Die
 * Wörterbücher sind gewöhnliche Objekte; weil das englische als
 * `Record<MessageKey, string>` deklariert ist, meldet der Übersetzer
 * eine fehlende Übersetzung schon beim Bauen.
 *
 * Eine weitere Sprache ist genau ein Objekt mehr – die Liste der
 * Schlüssel gibt vor, was zu übersetzen ist.
 */
import { readSetting, writeSetting } from './storage'

const LANG_KEY = 'booxnet.uiLang'

const de = {
  'common.cancel': 'Abbrechen',
  'common.save': 'Speichern',
  'common.done': 'Fertig',
  'common.understood': 'Verstanden',
  'common.delete': 'Löschen',

  'unit.page': 'Seite',
  'unit.pages': 'Seiten',
  'unit.chapter': 'Kapitel',
  'unit.chapters': 'Kapitel',
  'unit.section': 'Abschnitt',
  'unit.sections': 'Abschnitte',

  'theme.auto': 'Automatisch',
  'theme.light': 'Hell',
  'theme.dark': 'Dunkel',
  'theme.eink': 'E-Ink (hoher Kontrast)',
  'theme.header': 'Darstellung',
  'theme.change': 'Darstellung ändern',

  'library.title': 'Bibliothek',
  'library.empty.title': 'Noch keine Bücher',
  'library.empty.body':
    'Lade ein PDF, EPUB oder eine Textdatei hoch und lass es dir vorlesen. Kostenlos und komplett offline auf deinem Gerät.',
  'library.empty.action': 'Buch auswählen',
  'library.upload': 'Buch hochladen',
  'library.importing': 'Buch wird eingelesen',
  'library.actionsFor': 'Aktionen für {title}',
  'library.rename': 'Titel ändern',
  'library.deleteBook': 'Buch löschen',
  'library.listened': '{percent} % gehört',
  'library.noText':
    'In dieser Datei wurde kein Text gefunden. Gescannte PDFs ohne Textebene können nicht vorgelesen werden.',
  'library.readError': 'Die Datei konnte nicht gelesen werden.',
  'library.uiLanguage': 'Sprache der App',

  'welcome.title': 'Willkommen bei Booxnet',
  'welcome.intro':
    'Deine kostenlose Vorlese-App: Lade ein Buch als PDF, EPUB oder Textdatei hoch und lass es dir mit natürlichen Stimmen vorlesen. Ohne Konto, ohne Cloud. Alles bleibt auf deinem Gerät.',
  'welcome.soundOn': 'Ton an!',
  'welcome.soundOnNote':
    'Stummschaltung aus oder Kopfhörer verbinden – sonst bleibt die Stimme lautlos.',
  'welcome.language': 'Sprache',
  'welcome.languageNote':
    'Wird je Buch am Text erkannt – 31 Sprachen. Im Reader änderbar, falls die Erkennung danebenliegt.',
  'welcome.installAdd': 'Zum Home-Bildschirm hinzufügen',
  'welcome.installAsApp': 'Als App aufs Handy',
  'welcome.installNote': 'Aktualisiert sich selbst, läuft 100 % offline.',
  'welcome.downloadHeading': 'Einmaliger Download',
  'welcome.downloadPrivate':
    'Im privaten Fenster nicht möglich – bitte normales Fenster nutzen.',
  'welcome.downloadSize': 'Ca. {mb} MB – alle Stimmen, für immer offline.',
  'welcome.downloadProgress':
    '{loaded} von ca. {total} MB … App geöffnet lassen.',
  'welcome.start': 'Weiter: Dateien laden',
  'welcome.starting': 'Wird geladen …',

  'install.header': 'Zum Home-Bildschirm',
  'install.iosHelp':
    'Auf dem iPhone/iPad geht das nur über Safari selbst: Tippe unten auf das Teilen-Symbol (Quadrat mit Pfeil nach oben) und wähle dann „Zum Home-Bildschirm". Danach startet Booxnet wie eine App.',
  'install.addToHome': 'Zum Home-Bildschirm hinzufügen',
  'update.install': 'Update installieren',
  'update.check': 'Nach Update suchen',
  'update.tapToReload': 'Tippen zum Neuladen',
  'update.upToDate': 'Du hast bereits die neuste Version.',
  'update.failed':
    'Update-Prüfung fehlgeschlagen. Prüfe deine Internetverbindung und versuche es später noch einmal.',
  'update.noServiceWorker':
    'Update-Prüfung hier nicht möglich, denn die App läuft ohne Service Worker (z. B. im privaten Fenster).',

  'reader.back': 'Zurück zur Bibliothek',
  'reader.notFound': 'Buch nicht gefunden',
  'reader.loadingBook': 'Buch wird geladen',
  'reader.preparingBook': 'Das Buch wird aufbereitet …',
  'reader.preparingBookAria': 'Buch wird aufbereitet',
  'reader.displaySettings': 'Anzeige-Einstellungen',
  'reader.displayHeader': 'Anzeige',
  'reader.fontSize': 'Schriftgröße',
  'reader.highlight': 'Markierung',
  'reader.highlightMark': 'Hinterlegt',
  'reader.highlightUnderline': 'Unterstrichen',
  'reader.highlightInvert': 'Invertiert',
  'reader.bookLanguage': 'Sprache',
  'reader.languageAuto': 'Automatisch ({lang})',
  'reader.cover': 'Cover: {title}',
  'reader.chooseVoice': 'Stimme auswählen',
  'reader.previousSentence': 'Ein Satz zurück',
  'reader.nextSentence': 'Ein Satz vor',
  'reader.play': 'Vorlesen',
  'reader.pause': 'Pause',
  'reader.rate': 'Lesegeschwindigkeit {rate}-fach, ändern',
  'reader.needsModel': 'Lade zuerst einmalig das Sprachmodell herunter.',
  'reader.prepareProgress': 'Fortschritt der Sprachvorbereitung',
  'reader.preparingVoice': 'Sprachvorbereitung läuft',
  'reader.preparingVoicePercent':
    'Die Vorlesestimme wird einmalig vorbereitet – {percent} %',
  'reader.computingPercent': 'Der Satz wird berechnet – {percent} %',
  'reader.statePreparing': 'Die Vorlesestimme wird vorbereitet',
  'reader.statePlaying': 'Wird vorgelesen',
  'reader.statePaused': 'Angehalten',

  'voices.title': 'Stimmen',
  'voices.male': 'Männlich',
  'voices.female': 'Weiblich',
  'voices.selected': ' (ausgewählt)',
  'voices.needsModel': ' · benötigt das Sprachmodell',
  'voices.preview': 'Stimme {name} probehören',
  'voices.previewFailed': 'Probehören fehlgeschlagen.{detail}',
  'voices.download': 'Sprachmodell herunterladen',
  'voices.downloadAria': 'Sprachmodell wird heruntergeladen',
  'voices.downloadSize': 'Einmalig ca. {mb} MB, schaltet alle 10 Stimmen frei',
  'voices.downloadProgress':
    'Wird geladen … {loaded} von ca. {total} MB. Lass die App dabei geöffnet.',
  'voices.storageBlocked':
    'Hier nicht möglich: Dein Browser blockiert den Speicher dafür (z. B. im privaten Fenster). Bitte in einem normalen Fenster öffnen.',
  'voices.deleteModel': 'Sprachmodell löschen ({mb} MB freigeben)',
  'voices.deleteHeader': 'Sprachmodell löschen?',
  'voices.deleteBody':
    'Alle Stimmen und Begrüßungen werden von diesem Gerät entfernt. Zum Vorlesen musst du die ca. {mb} MB danach erneut herunterladen.',
  'voices.details': 'Technische Details',
  'voices.notPrepared': 'Stimme noch nicht vorbereitet – tippe im Buch auf Abspielen.',
  'voices.cores': 'Rechenkerne: {threads} Threads von {cores} Kernen',
  'voices.singleThread':
    'Achtung: nur {threads} Thread – Mehrkern-Modus nicht aktiv (das bremst stark)',
  'voices.prepareTime': 'Vorbereitung: {seconds} s',
  'voices.lastSentence':
    'Letzter Satz: {compute} s Rechenzeit für {audio} s Ton ({factor}×)',
  'voices.fasterThanRealtime':
    'Unter 1× heißt: schneller als Echtzeit, der Vorrat wächst.',
  'voices.slowerThanRealtime':
    'Über 1× heißt: langsamer als Echtzeit, der Vorrat schrumpft.',

  'speech.preview': 'Hallo, ich bin {name}. So klinge ich, wenn ich dir dein Buch vorlese.',
  'speech.displaced':
    'Die Wiedergabe wurde mehrfach unterbrochen. Tippe erneut auf Play.',
  'speech.startFailed':
    'Die Wiedergabe konnte nicht starten. Tippe noch einmal auf Play.',
  'speech.timedOut':
    'Dein Gerät hat für diesen Satz ungewöhnlich lange gebraucht. Tippe erneut auf Play, es geht an derselben Stelle weiter.',
  'speech.failed':
    'Die Stimme konnte nicht erzeugt werden. Falls das wiederholt passiert, lade das Sprachmodell in der Stimmen-Auswahl erneut herunter.',

  'download.storage':
    'Dein Browser erlaubt hier keinen Speicher für das Sprachmodell, das passiert vor allem in privaten Fenstern. Öffne Booxnet in einem normalen Fenster und lade es dort herunter.',
  'download.quota':
    'Auf deinem Gerät ist zu wenig Speicherplatz für das Sprachmodell frei (ca. {mb} MB). Schaffe etwas Platz und versuche es dann erneut. Bereits geladene Teile bleiben erhalten.',
  'download.network':
    'Die Sprachdaten sind gerade nicht erreichbar. Prüfe deine Internetverbindung und versuche es in ein paar Minuten noch einmal. Bereits geladene Teile bleiben erhalten.',
}

export type MessageKey = keyof typeof de

const en: Record<MessageKey, string> = {
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.done': 'Done',
  'common.understood': 'Got it',
  'common.delete': 'Delete',

  'unit.page': 'Page',
  'unit.pages': 'Pages',
  'unit.chapter': 'Chapter',
  'unit.chapters': 'Chapters',
  'unit.section': 'Section',
  'unit.sections': 'Sections',

  'theme.auto': 'Automatic',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.eink': 'E-ink (high contrast)',
  'theme.header': 'Appearance',
  'theme.change': 'Change appearance',

  'library.title': 'Library',
  'library.empty.title': 'No books yet',
  'library.empty.body':
    'Upload a PDF, EPUB or text file and have it read to you. Free and entirely offline on your device.',
  'library.empty.action': 'Choose a book',
  'library.upload': 'Upload a book',
  'library.importing': 'Reading the book',
  'library.actionsFor': 'Actions for {title}',
  'library.rename': 'Rename',
  'library.deleteBook': 'Delete book',
  'library.listened': '{percent}% listened',
  'library.noText':
    'No text was found in this file. Scanned PDFs without a text layer cannot be read aloud.',
  'library.readError': 'The file could not be read.',
  'library.uiLanguage': 'App language',

  'welcome.title': 'Welcome to Booxnet',
  'welcome.intro':
    'Your free read-aloud app: upload a book as PDF, EPUB or text file and have it read to you in natural voices. No account, no cloud. Everything stays on your device.',
  'welcome.soundOn': 'Sound on!',
  'welcome.soundOnNote':
    'Turn off silent mode or connect headphones – otherwise the voice stays silent.',
  'welcome.language': 'Language',
  'welcome.languageNote':
    'Detected per book from its text – 31 languages. Changeable in the reader if the detection is wrong.',
  'welcome.installAdd': 'Add to home screen',
  'welcome.installAsApp': 'Install as an app',
  'welcome.installNote': 'Updates itself, runs 100% offline.',
  'welcome.downloadHeading': 'One-time download',
  'welcome.downloadPrivate':
    'Not possible in a private window – please use a normal one.',
  'welcome.downloadSize': 'About {mb} MB – all voices, offline for good.',
  'welcome.downloadProgress':
    '{loaded} of about {total} MB … keep the app open.',
  'welcome.start': 'Continue: download files',
  'welcome.starting': 'Downloading …',

  'install.header': 'Add to home screen',
  'install.iosHelp':
    'On iPhone and iPad this only works from Safari itself: tap the share icon at the bottom (a square with an arrow pointing up) and choose "Add to Home Screen". Booxnet then starts like an app.',
  'install.addToHome': 'Add to home screen',
  'update.install': 'Install update',
  'update.check': 'Check for updates',
  'update.tapToReload': 'Tap to reload',
  'update.upToDate': 'You already have the latest version.',
  'update.failed':
    'Update check failed. Check your internet connection and try again later.',
  'update.noServiceWorker':
    'Update checks are unavailable here because the app runs without a service worker (for example in a private window).',

  'reader.back': 'Back to the library',
  'reader.notFound': 'Book not found',
  'reader.loadingBook': 'Loading the book',
  'reader.preparingBook': 'Preparing the book …',
  'reader.preparingBookAria': 'Preparing the book',
  'reader.displaySettings': 'Display settings',
  'reader.displayHeader': 'Display',
  'reader.fontSize': 'Text size',
  'reader.highlight': 'Highlight',
  'reader.highlightMark': 'Filled',
  'reader.highlightUnderline': 'Underlined',
  'reader.highlightInvert': 'Inverted',
  'reader.bookLanguage': 'Language',
  'reader.languageAuto': 'Automatic ({lang})',
  'reader.cover': 'Cover: {title}',
  'reader.chooseVoice': 'Choose a voice',
  'reader.previousSentence': 'Previous sentence',
  'reader.nextSentence': 'Next sentence',
  'reader.play': 'Read aloud',
  'reader.pause': 'Pause',
  'reader.rate': 'Reading speed {rate}×, change',
  'reader.needsModel': 'Download the speech model once first.',
  'reader.prepareProgress': 'Speech preparation progress',
  'reader.preparingVoice': 'Preparing speech',
  'reader.preparingVoicePercent':
    'Preparing the reading voice, one time only – {percent}%',
  'reader.computingPercent': 'Computing the sentence – {percent}%',
  'reader.statePreparing': 'Preparing the reading voice',
  'reader.statePlaying': 'Reading aloud',
  'reader.statePaused': 'Paused',

  'voices.title': 'Voices',
  'voices.male': 'Male',
  'voices.female': 'Female',
  'voices.selected': ' (selected)',
  'voices.needsModel': ' · needs the speech model',
  'voices.preview': 'Preview the voice {name}',
  'voices.previewFailed': 'Preview failed.{detail}',
  'voices.download': 'Download the speech model',
  'voices.downloadAria': 'Downloading the speech model',
  'voices.downloadSize': 'About {mb} MB once, unlocks all 10 voices',
  'voices.downloadProgress':
    'Downloading … {loaded} of about {total} MB. Keep the app open.',
  'voices.storageBlocked':
    'Not possible here: your browser blocks storage for this (for example in a private window). Please open it in a normal window.',
  'voices.deleteModel': 'Delete the speech model (free {mb} MB)',
  'voices.deleteHeader': 'Delete the speech model?',
  'voices.deleteBody':
    'All voices and greetings will be removed from this device. To read aloud you will have to download the {mb} MB again.',
  'voices.details': 'Technical details',
  'voices.notPrepared': 'Voice not prepared yet – tap play inside a book.',
  'voices.cores': 'Processor cores: {threads} threads of {cores}',
  'voices.singleThread':
    'Warning: only {threads} thread – multi-core mode is off (this slows things down a lot)',
  'voices.prepareTime': 'Preparation: {seconds} s',
  'voices.lastSentence':
    'Last sentence: {compute} s of computing for {audio} s of audio ({factor}×)',
  'voices.fasterThanRealtime':
    'Below 1× means faster than real time – the buffer grows.',
  'voices.slowerThanRealtime':
    'Above 1× means slower than real time – the buffer shrinks.',

  'speech.preview': "Hello, I'm {name}. This is how I sound when I read your book to you.",
  'speech.displaced': 'Playback was interrupted repeatedly. Tap play again.',
  'speech.startFailed': 'Playback could not start. Tap play once more.',
  'speech.timedOut':
    'Your device took unusually long for this sentence. Tap play again and it continues from the same spot.',
  'speech.failed':
    'The voice could not be generated. If this keeps happening, download the speech model again from the voice list.',

  'download.storage':
    'Your browser does not allow storage for the speech model here, which mostly happens in private windows. Open Booxnet in a normal window and download it there.',
  'download.quota':
    'There is not enough free space on your device for the speech model (about {mb} MB). Free up some space and try again. Parts already downloaded are kept.',
  'download.network':
    'The speech data cannot be reached right now. Check your internet connection and try again in a few minutes. Parts already downloaded are kept.',
}

const DICTIONARIES = { de, en }

export type UiLang = keyof typeof DICTIONARIES

export const UI_LANGUAGES: { code: UiLang; name: string }[] = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
]

/**
 * Englisch ist der Rückfall, nicht Deutsch: Wer keine der angebotenen
 * Sprachen spricht, kommt mit Englisch am ehesten zurecht.
 */
const FALLBACK: UiLang = 'en'

function isUiLang(value: string | null): value is UiLang {
  return value !== null && value in DICTIONARIES
}

function detectFromBrowser(): UiLang {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.split('-')[0]
    if (isUiLang(base)) return base
  }
  return FALLBACK
}

let current: UiLang = (() => {
  const stored = readSetting(LANG_KEY)
  return isUiLang(stored) ? stored : detectFromBrowser()
})()

const listeners = new Set<() => void>()

export function getUiLang(): UiLang {
  return current
}

export function setUiLang(lang: UiLang): void {
  if (lang === current) return
  current = lang
  writeSetting(LANG_KEY, lang)
  applyDocumentLang()
  for (const listener of listeners) listener()
}

/**
 * Hält das lang-Attribut der Seite gleich – Screenreader lesen danach.
 * Ohne DOM (Worker, Testlauf) ist das schlicht nichts zu tun; ohne diese
 * Prüfung riss ein Sprachwechsel dort alles mit.
 */
export function applyDocumentLang(): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = current
}

export function subscribeUiLang(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Übersetzt einen Schlüssel. Platzhalter stehen in geschweiften
 * Klammern: t('reader.rate', { rate: 1.5 }).
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[current][key] ?? DICTIONARIES[FALLBACK][key]
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}
