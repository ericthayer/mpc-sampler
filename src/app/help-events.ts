/** Decoupled requests for help UI, so pages and keys can ask without importing the dialogs. */
export type HelpRequest = 'tour' | 'guide' | 'shortcuts' | 'welcome';

export const GUIDE_URL = 'help.html';
const EVENT = 'slab-help';

export function requestHelp(kind: HelpRequest): void {
  window.dispatchEvent(new CustomEvent<HelpRequest>(EVENT, { detail: kind }));
}

export function onHelpRequest(handler: (kind: HelpRequest) => void): void {
  window.addEventListener(EVENT, (event) => handler((event as CustomEvent<HelpRequest>).detail));
}

/** Open the guide in a new tab so the instrument (and anything playing) keeps running. */
export function openGuide(section = ''): void {
  const link = document.createElement('a');
  link.href = section ? `${GUIDE_URL}#${section}` : GUIDE_URL;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}
