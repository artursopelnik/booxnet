import { strFromU8, unzip, type Unzipped } from 'fflate'
import type { Book } from './db'
import { toSentences } from './text'

/** Elements whose boundaries become paragraph breaks in the extracted text. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'div',
  'dt',
  'figcaption',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'ol',
  'p',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
])

const SKIP_TAGS = new Set(['script', 'style', 'head', 'template', 'svg'])

function collectText(node: Node, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.nodeValue ?? '')
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const tag = (node as Element).tagName.toLowerCase()
  if (SKIP_TAGS.has(tag)) return
  const isBlock = BLOCK_TAGS.has(tag)
  if (isBlock) out.push('\n')
  for (const child of Array.from(node.childNodes)) {
    collectText(child, out)
  }
  if (isBlock) out.push('\n')
}

/** Extracts readable text from one XHTML chapter, paragraphs kept apart. */
function chapterText(xhtml: string): string {
  const parser = new DOMParser()
  let doc = parser.parseFromString(xhtml, 'application/xhtml+xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    // Not all EPUBs contain well-formed XML – the HTML parser is forgiving.
    doc = parser.parseFromString(xhtml, 'text/html')
  }
  const root = doc.body ?? doc.documentElement
  if (!root) return ''
  const parts: string[] = []
  collectText(root, parts)
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** Resolves an href relative to the directory of `fromFile` inside the zip. */
function resolvePath(fromFile: string, href: string): string {
  const stack = fromFile.split('/').slice(0, -1)
  for (const part of decodeURIComponent(href.replace(/[#?].*$/, '')).split(
    '/',
  )) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function parseXml(source: string): Document {
  return new DOMParser().parseFromString(source, 'application/xml')
}

interface ManifestItem {
  href: string
  mediaType: string
  properties: string
}

/** Scales a cover image to the library thumbnail size, as a JPEG data-URL. */
async function renderCover(
  bytes: Uint8Array,
  mediaType: string,
): Promise<string | undefined> {
  // Copy into a fresh Uint8Array – TypeScript's BlobPart requires a plain
  // ArrayBuffer-backed view.
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: mediaType }),
  )
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('cover decode failed'))
      el.src = url
    })
    const width = Math.min(440, image.naturalWidth)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = Math.max(
      1,
      Math.round((image.naturalHeight / image.naturalWidth) * width),
    )
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.75)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Finds the cover image: EPUB 3 `cover-image` property, then the EPUB 2
 * `<meta name="cover">` convention, then any image named "cover". */
function findCoverPath(
  opf: Document,
  manifest: Map<string, ManifestItem>,
  opfPath: string,
): { path: string; mediaType: string } | undefined {
  let item: ManifestItem | undefined
  for (const candidate of manifest.values()) {
    if (candidate.properties.split(/\s+/).includes('cover-image')) {
      item = candidate
      break
    }
  }
  if (!item) {
    for (const meta of Array.from(opf.getElementsByTagName('meta'))) {
      if (meta.getAttribute('name') === 'cover') {
        item = manifest.get(meta.getAttribute('content') ?? '')
        if (item) break
      }
    }
  }
  if (!item) {
    for (const candidate of manifest.values()) {
      if (
        candidate.mediaType.startsWith('image/') &&
        /cover/i.test(candidate.href)
      ) {
        item = candidate
        break
      }
    }
  }
  if (!item?.mediaType.startsWith('image/')) return undefined
  return { path: resolvePath(opfPath, item.href), mediaType: item.mediaType }
}

/** Parses an EPUB file into a Book: per-chapter text plus a cover. */
export async function importEpub(file: File): Promise<Book> {
  const data = new Uint8Array(await file.arrayBuffer())
  const files = await new Promise<Unzipped>((resolve, reject) => {
    unzip(data, (error, result) => (error ? reject(error) : resolve(result)))
  })

  const readText = (path: string): string | undefined => {
    const bytes = files[path]
    return bytes ? strFromU8(bytes) : undefined
  }

  const container = readText('META-INF/container.xml')
  const opfPath = container
    ? parseXml(container)
        .getElementsByTagName('rootfile')[0]
        ?.getAttribute('full-path')
    : undefined
  const opfSource = opfPath ? readText(opfPath) : undefined
  if (!opfPath || !opfSource) {
    throw new Error('Kein gültiges EPUB: Inhaltsverzeichnis fehlt.')
  }
  const opf = parseXml(opfSource)

  const manifest = new Map<string, ManifestItem>()
  for (const item of Array.from(opf.getElementsByTagName('item'))) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (!id || !href) continue
    manifest.set(id, {
      href,
      mediaType: item.getAttribute('media-type') ?? '',
      properties: item.getAttribute('properties') ?? '',
    })
  }

  // The spine defines the reading order of the chapters.
  const chapters: string[] = []
  for (const ref of Array.from(opf.getElementsByTagName('itemref'))) {
    if (ref.getAttribute('linear') === 'no') continue
    const item = manifest.get(ref.getAttribute('idref') ?? '')
    if (!item) continue
    if (
      item.mediaType !== 'application/xhtml+xml' &&
      item.mediaType !== 'text/html'
    )
      continue
    const source = readText(resolvePath(opfPath, item.href))
    chapters.push(source ? chapterText(source) : '')
  }
  if (chapters.length === 0) {
    throw new Error('Kein gültiges EPUB: keine Kapitel gefunden.')
  }

  let cover: string | undefined
  try {
    const found = findCoverPath(opf, manifest, opfPath)
    const bytes = found ? files[found.path] : undefined
    if (found && bytes) {
      cover = await renderCover(bytes, found.mediaType)
    }
  } catch {
    // A missing cover is not fatal – the library shows a placeholder.
  }

  const title =
    opf
      .getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]
      ?.textContent?.trim() || file.name.replace(/\.epub$/i, '')

  return {
    id: crypto.randomUUID(),
    title,
    addedAt: Date.now(),
    pageCount: chapters.length,
    pages: chapters,
    unit: 'chapter',
    cover,
    position: 0,
    sentenceCount: toSentences(chapters).length,
  }
}
