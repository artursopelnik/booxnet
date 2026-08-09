/** Minimal OPFS helpers for the Supertonic asset store. */

const DIR = 'supertonic'

async function dir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(DIR, { create: true })
}

/** Flattens an asset path like `onnx/vocoder.onnx` to a safe file name. */
function fileName(path: string): string {
  return path.replaceAll('/', '__')
}

export async function readAsset(path: string): Promise<ArrayBuffer | null> {
  try {
    const handle = await (await dir()).getFileHandle(fileName(path))
    return await (await handle.getFile()).arrayBuffer()
  } catch {
    return null
  }
}

export async function writeAsset(
  path: string,
  data: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<void> {
  const handle = await (await dir()).getFileHandle(fileName(path), {
    create: true,
  })
  const writable = await handle.createWritable()
  await writable.write(data instanceof Uint8Array ? data.buffer : data)
  await writable.close()
}

/**
 * True when this page may store assets in OPFS. Private windows (Firefox
 * blocks OPFS entirely, others hand out tiny ephemeral quotas) and browsers
 * without writable file streams report false.
 */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    if (!navigator.storage?.getDirectory) return false
    if (
      typeof FileSystemFileHandle !== 'undefined' &&
      !('createWritable' in FileSystemFileHandle.prototype)
    ) {
      return false
    }
    await dir()
    return true
  } catch {
    return false
  }
}

export async function hasAsset(path: string): Promise<boolean> {
  try {
    await (await dir()).getFileHandle(fileName(path))
    return true
  } catch {
    return false
  }
}

/** Size of a stored asset in bytes, or -1 if it doesn't exist. */
export async function assetSize(path: string): Promise<number> {
  try {
    const handle = await (await dir()).getFileHandle(fileName(path))
    return (await handle.getFile()).size
  } catch {
    return -1
  }
}

/**
 * Streams a body into OPFS without buffering the whole file in memory –
 * essential for the ~200 MB models on memory-tight mobile devices. The
 * file is only committed on a complete stream; on any error (or when
 * fewer than minBytes arrive) the write is aborted and nothing persists.
 */
export async function writeAssetStream(
  path: string,
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  onChunk: (bytes: number) => void,
  minBytes = 0,
): Promise<number> {
  const handle = await (await dir()).getFileHandle(fileName(path), {
    create: true,
  })
  const writable = await handle.createWritable()
  const reader = stream.getReader()
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      await writable.write(value)
      total += value.byteLength
      onChunk(value.byteLength)
    }
    if (minBytes > 0 && total < minBytes) {
      throw new Error(`Truncated download for ${path}: ${total}/${minBytes}`)
    }
  } catch (error) {
    await writable.abort().catch(() => {})
    throw error
  }
  await writable.close()
  return total
}

/**
 * Behält unter `pathPrefix` nur die zuletzt geschriebenen `keep` Dateien
 * und löscht die älteren. Damit wächst ein laufend gefüllter Cache nicht
 * unbegrenzt, ohne dass der Aufrufer die Ablage-Details kennen muss.
 * Best-effort: Fehler (Datei inzwischen weg, Verzeichnis nicht lesbar)
 * werden verschluckt.
 */
export async function pruneAssets(
  pathPrefix: string,
  keep: number,
): Promise<void> {
  try {
    const handle = (await dir()) as FileSystemDirectoryHandle & {
      values?: () => AsyncIterableIterator<FileSystemHandle>
    }
    if (!handle.values) return
    const prefix = fileName(pathPrefix)
    const found: { name: string; modified: number }[] = []
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file' || !entry.name.startsWith(prefix)) continue
      try {
        const file = await (entry as FileSystemFileHandle).getFile()
        found.push({ name: entry.name, modified: file.lastModified })
      } catch {
        // Datei verschwunden – überspringen.
      }
    }
    if (found.length <= keep) return
    found.sort((a, b) => b.modified - a.modified)
    for (const entry of found.slice(keep)) {
      await handle.removeEntry(entry.name).catch(() => {})
    }
  } catch {
    // Aufräumen ist Kür – niemals den Aufrufer scheitern lassen.
  }
}

/** Entfernt eine einzelne Datei; fehlt sie bereits, passiert nichts. */
export async function removeAsset(path: string): Promise<void> {
  try {
    await (await dir()).removeEntry(fileName(path))
  } catch {
    // Schon weg.
  }
}

export async function removeAllAssets(): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(DIR, { recursive: true })
  } catch {
    // Already gone.
  }
}
