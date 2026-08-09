import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface Book {
  id: string
  title: string
  addedAt: number
  pageCount: number
  /** Extracted plain text, one entry per page/chapter/section. */
  pages: string[]
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

interface VorleserDB extends DBSchema {
  books: {
    key: string
    value: Book
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
  dbPromise ??= openDB<VorleserDB>('vorleser', 2, {
    upgrade(database, oldVersion) {
      // Rein additiv: Bestehende Buecher bleiben unangetastet, ihre bisher
      // im Buch gespeicherte Position gilt weiter als Rueckfall (siehe
      // withPosition), bis sie das naechste Mal fortgeschrieben wird.
      if (oldVersion < 1) {
        database.createObjectStore('books', { keyPath: 'id' })
      }
      if (oldVersion < 2) {
        database.createObjectStore('positions')
      }
    },
  })
  return dbPromise
}

/** Ergaenzt die aktuelle Leseposition; ohne Eintrag gilt die im Buch. */
function withPosition(book: Book, position: number | undefined): Book {
  return position === undefined ? book : { ...book, position }
}

export async function getAllBooks(): Promise<Book[]> {
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

export async function getBook(id: string): Promise<Book | undefined> {
  const database = await db()
  const book = await database.get('books', id)
  if (!book) return undefined
  return withPosition(book, await database.get('positions', id))
}

export async function putBook(book: Book): Promise<void> {
  await (await db()).put('books', book)
}

export async function deleteBook(id: string): Promise<void> {
  const database = await db()
  await Promise.all([
    database.delete('books', id),
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
