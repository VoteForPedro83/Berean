/* ============================================================
   router.js — URL hash router
   Parses #JHN.3.16 style hashes into passage objects.
   ============================================================ */

import { bus, EVENTS } from './state/eventbus.js';

// Callbacks registered by reading-pane to track history button state
let _onPush = null;
let _onPop  = null;
export function registerHistoryCallbacks(onPush, onPop) {
  _onPush = onPush;
  _onPop  = onPop;
}

export const DEFAULT_PASSAGE = { book: 'JHN', chapter: 1, verse: 1, osisId: 'JHN.1.1' };

/** Parse a hash string like "#JHN.3.16" into passage parts. */
export function parseHash(hash = '') {
  const cleaned = hash.replace(/^#/, '').trim();
  if (!cleaned) return DEFAULT_PASSAGE;

  const match = cleaned.match(/^([1-3]?[A-Z]+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return DEFAULT_PASSAGE;

  const [, book, chapterStr, verseStr] = match;
  const chapter = parseInt(chapterStr, 10);
  const verse   = parseInt(verseStr || '1', 10);

  return { book, chapter, verse, osisId: `${book}.${chapter}.${verse}` };
}

/** Encode a passage into a hash string. */
export function encodeHash({ book, chapter, verse = 1 }) {
  return `#${book}.${chapter}.${verse}`;
}

/** Navigate to a passage — updates URL and emits NAVIGATE event. */
export function navigateTo({ book, chapter, verse = 1 }) {
  const osisId  = `${book}.${chapter}.${verse}`;
  const newHash = encodeHash({ book, chapter, verse });
  if (window.location.hash !== newHash) {
    history.pushState(null, '', newHash);
    _onPush?.();
  }
  bus.emit(EVENTS.NAVIGATE, { book, chapter, verse, osisId });
}

/** Initialise the router — call once at app start. */
export function initRouter() {
  const initial = parseHash(window.location.hash);
  // Don't emit here — main.js will trigger the first render after all components init
  window._initialPassage = initial;

  window.addEventListener('popstate', (e) => {
    // delta: -1 if going back, +1 if going forward (approximated)
    _onPop?.(-1);
    bus.emit(EVENTS.NAVIGATE, parseHash(window.location.hash));
  });
}
