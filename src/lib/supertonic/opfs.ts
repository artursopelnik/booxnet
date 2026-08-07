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

export async function hasAsset(path: string): Promise<boolean> {
  try {
    await (await dir()).getFileHandle(fileName(path))
    return true
  } catch {
    return false
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
