/**
 * Explains why a live input (microphone or tab audio) can't be opened, in terms
 * the player can act on. Browsers report most of these as the same NotAllowedError,
 * so we check the context first and read the error second.
 */
export type LiveSource = 'mic' | 'tab';

const FEATURE: Record<LiveSource, string> = { mic: 'microphone', tab: 'display-capture' };
const NOUN: Record<LiveSource, string> = { mic: 'the microphone', tab: 'tab audio' };

/** A reason recording can't start before we even ask, or null if asking may work. */
export async function preflight(source: LiveSource): Promise<string | null> {
  if (!window.isSecureContext) {
    return `Recording ${NOUN[source]} needs a secure page. Open SLAB/16 over https:// or from localhost.`;
  }
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  if (policy && !policy.allowsFeature(FEATURE[source])) {
    return `This page is embedded somewhere that blocks ${NOUN[source]}, so the browser can't ask you. Open SLAB/16 in its own tab, or use Resample or Load File.`;
  }
  if (source === 'mic' && (await micState()) === 'denied') return blockedForSite();
  return null;
}

/** Turn a getUserMedia / getDisplayMedia failure into a next step. */
export async function explain(source: LiveSource, error: unknown): Promise<string> {
  const name = error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (/system/i.test(message)) {
      return 'Your computer is blocking the browser from using the microphone. Allow it in your system privacy settings (on a Mac: System Settings → Privacy & Security → Microphone), then try again.';
    }
    if (source === 'tab') return 'Sharing was cancelled. Press Record again, pick a tab, and turn on "Share tab audio".';
    if ((await micState()) === 'denied') return blockedForSite();
    // Still "prompt": the browser refused without asking, which happens in sandboxed or embedded views.
    return "The browser didn't show a permission prompt here. Open SLAB/16 in its own tab, or use Resample or Load File.";
  }
  if (name === 'NotSupportedError') return `${NOUN[source][0]!.toUpperCase()}${NOUN[source].slice(1)} isn't available in this browser or view. Use Resample or Load File instead.`;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Plug one in or check your audio input settings.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The microphone is in use by another app or tab. Close it there and try again.';
  return message || `Couldn't open ${NOUN[source]}.`;
}

function blockedForSite(): string {
  return 'The microphone is blocked for this site. Click the icon at the left of the address bar, allow the microphone, then try again.';
}

async function micState(): Promise<PermissionState | 'unknown'> {
  try {
    return (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state;
  } catch {
    return 'unknown'; // Firefox and older Safari can't query the microphone
  }
}
