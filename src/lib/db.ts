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
}

let dbPromise: Promise<IDBPDatabase<VorleserDB>> | null = null

function db() {
  dbPromise ??= openDB<VorleserDB>('vorleser', 1, {
    upgrade(database) {
      database.createObjectStore('books', { keyPath: 'id' })
    },
  })
  return dbPromise
}

export async function getAllBooks(): Promise<Book[]> {
  const books = await (await db()).getAll('books')
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
  return (await db()).get('books', id)
}

export async function putBook(book: Book): Promise<void> {
  await (await db()).put('books', book)
}

export async function deleteBook(id: string): Promise<void> {
  await (await db()).delete('books', id)
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

export async function savePosition(id: string, position: number): Promise<void> {
  const database = await db()
  const book = await database.get('books', id)
  if (book) {
    book.position = position
    await database.put('books', book)
  }
}
