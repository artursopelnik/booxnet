import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * Ein Buch OHNE seinen Text – was die Bibliothek anzeigt.
 *
 * Der Text liegt bewusst in einem eigenen Speicher (siehe VorleserDB):
 * Er macht praktisch die gesamte Datenmenge aus (bei 400 Seiten rund ein
 * Megabyte), wird in der Bibliothek aber nie gebraucht. Lag er im selben
 * Datensatz, las die Bibliothek bei jedem Eintritt den Volltext aller
 * Bücher – bei zehn großen Büchern ein zweistelliger Megabyte-Betrag,
 * nur um Titel und Fortschritt anzuzeigen.
 */
export interface BookMeta {
  id: string
  title: string
  addedAt: number
  pageCount: number
  /** What one `pages` entry represents. Missing on old books ⇒ 'page'. */
  unit?: 'page' | 'chapter' | 'section'
  /** JPEG data-URL of the cover (PDF: first page), shown in the library. */
  cover?: string
  /** Index of the last read sentence, for resuming. */
  position: number
  /** Total number of sentences, cached for the progress display. */
  sentenceCount: number
  /** Manuelle Sortierposition (Drag-and-drop); fehlt bei alten Büchern. */
  order?: number
}

/** Ein Buch MIT seinem Text – was der Reader und der Import brauchen. */
export interface Book extends BookMeta {
  /** Extracted plain text, one entry per page/chapter/section. */
  pages: string[]
}

interface VorleserDB extends DBSchema {
  books: {
    key: string
    value: BookMeta
  }
  /** Der Buchtext, getrennt von den Metadaten (siehe BookMeta). */
  pages: {
    key: string
    value: string[]
  }
  /**
   * Leseposition getrennt vom Buch. Der Grund ist Schreiblast: Die
   * Position aendert sich bei JEDEM Satz, ein Buch-Datensatz enthaelt
   * aber den kompletten Text (bei 400 Seiten rund ein Megabyte). Lag
   * die Position im Buch, las und schrieb die App pro Satz ein Megabyte
   * - ueber eine Stunde Hoeren hunderte Megabyte auf den Flash-Speicher,
   * und jedes Mal ein Ruckler auf dem Hauptthread. Hier sind es ein paar
   * Byte.
   */
  positions: {
    key: string
    value: number
  }
}

let dbPromise: Promise<IDBPDatabase<VorleserDB>> | null = null

function db() {
  dbPromise ??= openDB<VorleserDB>('vorleser', 3, {
    async upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        database.createObjectStore('books', { keyPath: 'id' })
      }
      // Position getrennt vom Buch – rein additiv, die bisher im Buch
      // gespeicherte Position gilt als Rueckfall (siehe withPosition).
      if (oldVersion < 2) {
        database.createObjectStore('positions')
      }
      // Text aus dem Buch-Datensatz herausloesen. Laeuft in der
      // Versionswechsel-Transaktion, ist also entweder ganz oder gar
      // nicht wirksam – ein Abbruch mittendrin kann keine halb
      // umgezogene Bibliothek hinterlassen.
      if (oldVersion < 3) {
        database.createObjectStore('pages')
        if (oldVersion >= 1) {
          const books = transaction.objectStore('books')
          const pages = transaction.objectStore('pages')
          for (const stored of await books.getAll()) {
            const legacy = stored as BookMeta & { pages?: string[] }
            if (!legacy.pages) continue
            const { pages: text, ...meta } = legacy
            await pages.put(text, legacy.id)
            await books.put(meta)
          }
        }
      }
    },
  })
  return dbPromise
}

/** Ergaenzt die aktuelle Leseposition; ohne Eintrag gilt die im Buch. */
function withPosition<T extends BookMeta>(book: T, position: number | undefined): T {
  return position === undefined ? book : { ...book, position }
}

/** Nur die Metadaten – der Buchtext wird hier bewusst nicht geladen. */
export async function getAllBooks(): Promise<BookMeta[]> {
  const database = await db()
  const [stored, keys, positions] = await Promise.all([
    database.getAll('books'),
    database.getAllKeys('positions'),
    database.getAll('positions'),
  ])
  const byId = new Map(keys.map((key, index) => [key, positions[index]]))
  const books = stored.map((book) => withPosition(book, byId.get(book.id)))
  // Manuell sortierte Bücher zuerst in ihrer Reihenfolge, der Rest
  // (Alt-Bestand, Neuimporte) dahinter – neueste oben.
  return books.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) return a.order - b.order
    if (a.order !== undefined) return -1
    if (b.order !== undefined) return 1
    return b.addedAt - a.addedAt
  })
}

/** Buch samt Text – fuer den Reader. */
export async function getBook(id: string): Promise<Book | undefined> {
  const database = await db()
  const [meta, pages, position] = await Promise.all([
    database.get('books', id),
    database.get('pages', id),
    database.get('positions', id),
  ])
  if (!meta) return undefined
  return withPosition({ ...meta, pages: pages ?? [] }, position)
}

export async function putBook(book: Book): Promise<void> {
  const { pages, ...meta } = book
  const database = await db()
  const transaction = database.transaction(['books', 'pages'], 'readwrite')
  await Promise.all([
    transaction.objectStore('books').put(meta),
    transaction.objectStore('pages').put(pages, book.id),
  ])
  await transaction.done
}

/** Aendert nur den Titel, ohne den Text anzufassen. */
export async function renameBook(id: string, title: string): Promise<void> {
  const database = await db()
  const transaction = database.transaction('books', 'readwrite')
  const meta = await transaction.store.get(id)
  if (meta) await transaction.store.put({ ...meta, title })
  await transaction.done
}

export async function deleteBook(id: string): Promise<void> {
  const database = await db()
  await Promise.all([
    database.delete('books', id),
    database.delete('pages', id),
    database.delete('positions', id),
  ])
}

/** Persistiert die per Drag-and-drop gewählte Reihenfolge. */
export async function saveBookOrder(ids: string[]): Promise<void> {
  const database = await db()
  const transaction = database.transaction('books', 'readwrite')
  await Promise.all(
    ids.map(async (id, index) => {
      const book = await transaction.store.get(id)
      if (book) await transaction.store.put({ ...book, order: index })
    }),
  )
  await transaction.done
}

/**
 * Speichert nur die Leseposition – ein winziger Datensatz im eigenen
 * Speicher, unabhaengig vom Buchtext (siehe VorleserDB.positions).
 */
export async function savePosition(id: string, position: number): Promise<void> {
  await (await db()).put('positions', position, id)
}
