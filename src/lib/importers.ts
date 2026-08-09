import type { Book } from './db'
import { t } from './i18n'
import { toSentences } from './text'

/** File extensions the library's file picker accepts. */
export const ACCEPTED_FILES =
  '.pdf,.epub,.txt,.md,application/pdf,application/epub+zip,text/plain'

/** Target size of one reader section when importing plain text. */
const SECTION_CHARS = 6000

/** Parses a plain-text (or Markdown) file into a Book. The text is packed
 * into sections of a few thousand characters at paragraph boundaries so the
 * reader's lazy rendering keeps working for very large files. */
async function importPlainText(file: File): Promise<Book> {
  const raw = (await file.text())
    // Strip the most disruptive Markdown syntax so headings and links are
    // read as their text instead of as symbols.
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')

  const sections: string[] = []
  let current = ''
  for (const paragraph of raw.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue
    if (current && current.length + trimmed.length > SECTION_CHARS) {
      sections.push(current)
      current = ''
    }
    current = current ? `${current}\n${trimmed}` : trimmed
  }
  if (current) sections.push(current)

  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.(txt|md)$/i, ''),
    addedAt: Date.now(),
    pageCount: sections.length,
    pages: sections,
    unit: 'section',
    position: 0,
    sentenceCount: toSentences(sections).length,
  }
}

/** Imports a book file, choosing the parser by file type. The heavy parsers
 * (pdfjs, fflate) are loaded on demand so they stay out of the main bundle. */
export async function importBook(file: File): Promise<Book> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { importPdf } = await import('./pdf')
    return importPdf(file)
  }
  if (name.endsWith('.epub') || file.type === 'application/epub+zip') {
    const { importEpub } = await import('./epub')
    return importEpub(file)
  }
  if (
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    file.type === 'text/plain'
  ) {
    return importPlainText(file)
  }
  throw new Error(
    'Dieses Format wird nicht unterstützt. Booxnet liest PDF, EPUB und Textdateien (.txt, .md).',
  )
}

/** Singular label of a book's reading unit, e.g. for "Seite 3". */
export function unitName(unit: Book['unit']): string {
  if (unit === 'chapter') return t('unit.chapter')
  if (unit === 'section') return t('unit.section')
  return t('unit.page')
}

/** Count with pluralized unit, e.g. "12 Seiten" / "1 Kapitel". */
export function unitCount(unit: Book['unit'], count: number): string {
  if (unit === 'chapter')
    return `${count} ${t(count === 1 ? 'unit.chapter' : 'unit.chapters')}`
  if (unit === 'section')
    return `${count} ${t(count === 1 ? 'unit.section' : 'unit.sections')}`
  return `${count} ${t(count === 1 ? 'unit.page' : 'unit.pages')}`
}
