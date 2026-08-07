import * as pdfjs from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Book } from './db'
import { toSentences } from './text'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Parses a PDF file into a Book: per-page text plus a cover thumbnail. */
export async function importPdf(file: File): Promise<Book> {
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise

  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let text = ''
    for (const item of content.items) {
      const textItem = item as TextItem
      if (typeof textItem.str === 'string') {
        text += textItem.str
        text += textItem.hasEOL ? '\n' : ' '
      }
    }
    pages.push(text.trim())
  }

  let cover: string | undefined
  try {
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 240 / page.getViewport({ scale: 1 }).width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport }).promise
      cover = canvas.toDataURL('image/jpeg', 0.75)
    }
  } catch {
    // A missing cover is not fatal – the library shows a placeholder.
  }

  const pageCount = doc.numPages
  await doc.destroy()

  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.pdf$/i, ''),
    addedAt: Date.now(),
    pageCount,
    pages,
    cover,
    position: 0,
    sentenceCount: toSentences(pages).length,
  }
}
