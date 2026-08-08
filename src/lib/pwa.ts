/**
 * Install-prompt plumbing for "Zum Home-Bildschirm hinzufügen".
 *
 * Chromium (Android/Desktop) fires `beforeinstallprompt` once the PWA
 * criteria are met – we stash the event so a button can open the native
 * install dialog later. iOS has no such API at all: installing is only
 * possible by hand over Safaris Teilen-Menü, so there we can merely show
 * instructions. The listener lives at module scope because the event often
 * fires before React has mounted.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** True when the app already runs installed from the home screen. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      (navigator as { standalone?: boolean }).standalone === true)
  )
}

function isIos(): boolean {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as macOS, but Macs have no touch screen.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export type InstallMethod = 'prompt' | 'ios-instructions' | null

/**
 * How the app can be installed right now: via the native dialog, via
 * iOS instructions, or not at all (already installed / browser without
 * install support).
 */
export function getInstallMethod(): InstallMethod {
  if (isStandalone()) return null
  if (deferredPrompt) return 'prompt'
  if (isIos()) return 'ios-instructions'
  return null
}

/** Subscribes to install-availability changes; returns an unsubscribe. */
export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Opens the native install dialog. The stashed event is single-use, so it
 * is cleared afterwards either way – on dismissal Chromium fires a fresh
 * `beforeinstallprompt` on one of the next visits.
 */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt
  if (!prompt) return false
  deferredPrompt = null
  await prompt.prompt()
  const choice = await prompt.userChoice
  notify()
  return choice.outcome === 'accepted'
}
