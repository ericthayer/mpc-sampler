/** Small wrappers over device-integration APIs. Every one is optional and fails quietly. */

let wakeLock: WakeLockSentinel | null = null;
let wakeWanted = false;

/** Keep the screen on while the sequencer is running. */
export async function setWakeLock(on: boolean): Promise<void> {
  wakeWanted = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

// The lock is dropped whenever the tab is hidden; take it again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeWanted) void setWakeLock(true);
});

const coarsePointer = window.matchMedia('(pointer: coarse)');

/** Short haptic tick on pad hits (Android; a no-op elsewhere). */
export function hapticTick(): void {
  if (coarsePointer.matches && typeof navigator.vibrate === 'function') navigator.vibrate(8);
}

export interface MediaHandlers {
  play: () => void;
  stop: () => void;
}

/** Hardware media keys / lock-screen controls drive the transport. */
export function bindMediaSession(handlers: MediaHandlers): void {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler('play', handlers.play);
    navigator.mediaSession.setActionHandler('pause', handlers.stop);
    navigator.mediaSession.setActionHandler('stop', handlers.stop);
  } catch {
    /* unsupported action */
  }
}

export function updateMediaSession(title: string, playing: boolean): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'SLAB/16' });
  navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}

/** Ask the browser not to evict saved samples under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

let installEvent: BeforeInstallPromptEvent | null = null;

/** Capture the install prompt so the Project page can offer it. */
export function watchInstallPrompt(onAvailable: (available: boolean) => void): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event;
    onAvailable(true);
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    onAvailable(false);
  });
}

export async function promptInstall(): Promise<boolean> {
  const event = installEvent;
  if (!event) return false;
  // The event is single-use.
  installEvent = null;
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

/** Register the offline cache. Skipped where service workers can't run (file://, sandboxed frames). */
export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), { scope: './' });
    await navigator.serviceWorker.ready;
    // Modules fetched before the worker took control aren't cached yet; tell it what was loaded.
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => url.startsWith(location.origin));
    registration.active?.postMessage({ type: 'precache', urls: [location.href, ...urls] });
  } catch {
    /* offline support is a progressive enhancement */
  }
}
