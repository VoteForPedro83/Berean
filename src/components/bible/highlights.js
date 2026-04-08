/* ============================================================
   highlights.js — Verse-level text highlighting (Stage 5)
   Uses CSS Custom Highlight API where supported,
   falls back to data-attribute + CSS variable approach.
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';
import { getDB }       from '../../idb/schema.js';

// ── Colour palette ────────────────────────────────────────
const COLORS = [
  { id: 'yellow', bg: 'rgba(253, 224,  71, 0.42)', label: 'Yellow' },
  { id: 'green',  bg: 'rgba( 74, 222, 128, 0.42)', label: 'Green'  },
  { id: 'blue',   bg: 'rgba( 96, 165, 250, 0.42)', label: 'Blue'   },
  { id: 'pink',   bg: 'rgba(251, 113, 133, 0.42)', label: 'Pink'   },
];

// Feature-detect CSS Custom Highlight API
const USE_HL_API = (() => {
  try { return typeof CSS !== 'undefined' && !!CSS.highlights; } catch { return false; }
})();

// ── Module state ──────────────────────────────────────────
let _book    = null;
let _chapter = null;
let _toolbar = null;
let _verse   = null;   // pending verse number

// ── Public API ────────────────────────────────────────────
export function initHighlights() {
  _buildToolbar();

  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    _book    = book;
    _chapter = chapter;
    _restoreHighlights();
  });

  // Show toolbar on text selection within chapter content
  document.addEventListener('mouseup',  _onPointerUp);
  document.addEventListener('touchend', _onPointerUp);

  // Hide toolbar on click outside
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#hl-toolbar')) _hideToolbar();
  });
}

// ── Floating colour toolbar ───────────────────────────────
function _buildToolbar() {
  _toolbar = document.createElement('div');
  _toolbar.id        = 'hl-toolbar';
  _toolbar.className = 'hl-toolbar';
  _toolbar.hidden    = true;
  _toolbar.setAttribute('role', 'toolbar');
  _toolbar.setAttribute('aria-label', 'Highlight colour');

  _toolbar.innerHTML = `
    <span class="hl-label">Highlight</span>
    ${COLORS.map(c => `
      <button class="hl-swatch" data-color="${c.id}"
              style="background:${c.bg}" title="${c.label}"
              aria-label="${c.label}"></button>`).join('')}
    <button class="hl-swatch hl-swatch--clear" data-color="clear"
            title="Remove highlight" aria-label="Remove highlight">✕</button>`;

  document.body.appendChild(_toolbar);

  _toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    _applyHighlight(btn.dataset.color);
  });
}

function _onPointerUp(e) {
  if (e.target.closest('#hl-toolbar')) return;

  // Small delay lets the selection finalise after touch/click
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range     = sel.getRangeAt(0);
    const chapterEl = document.getElementById('chapter-content');
    if (!chapterEl?.contains(range.commonAncestorContainer)) return;

    // Find the verse container the selection starts in
    const anchor = range.commonAncestorContainer;
    const verseEl = (anchor.nodeType === 3 ? anchor.parentElement : anchor)
      .closest('[data-verse]');
    if (!verseEl) return;

    _verse = parseInt(verseEl.dataset.verse);
    _positionToolbar(range.getBoundingClientRect());
  }, 10);
}

function _positionToolbar(rect) {
  _toolbar.hidden = false;
  const W    = 232;
  const left = Math.min(Math.max(rect.left + rect.width / 2 - W / 2, 8), window.innerWidth - W - 8);
  const top  = rect.top + window.scrollY - 52;
  _toolbar.style.left = `${left}px`;
  _toolbar.style.top  = `${Math.max(top, 4)}px`;
}

function _hideToolbar() {
  if (_toolbar) _toolbar.hidden = true;
  _verse = null;
}

// ── Apply / remove a highlight ────────────────────────────
async function _applyHighlight(color) {
  if (_verse == null || !_book) return;
  const osisId = `${_book}.${_chapter}.${_verse}`;
  _hideToolbar();
  window.getSelection()?.removeAllRanges();

  try {
    const db = await getDB();
    if (color === 'clear') {
      await db.delete('Highlights', osisId);
    } else {
      await db.put('Highlights', { osisId, color, createdAt: Date.now() });
    }
    await _restoreHighlights();
  } catch (err) {
    console.warn('[highlights] save failed:', err);
  }
}

// ── Restore highlights for the current chapter ────────────
async function _restoreHighlights() {
  if (!_book || !_chapter) return;
  const chapterEl = document.getElementById('chapter-content');
  if (!chapterEl) return;

  try {
    const db  = await getDB();
    const lo  = `${_book}.${_chapter}.`;
    const hi  = `${_book}.${_chapter}.\uffff`;
    const hls = await db.getAll('Highlights', IDBKeyRange.bound(lo, hi));

    if (USE_HL_API) {
      _applyViaHighlightAPI(chapterEl, hls);
    } else {
      _applyViaDataAttr(chapterEl, hls);
    }
  } catch (err) {
    console.warn('[highlights] restore failed:', err);
  }
}

function _applyViaHighlightAPI(chapterEl, hls) {
  // Clear all previous highlight ranges for this chapter
  COLORS.forEach(c => CSS.highlights.delete(`berean-hl-${c.id}`));

  const rangeMap = {};
  COLORS.forEach(c => { rangeMap[c.id] = []; });

  hls.forEach(hl => {
    const verse  = parseInt(hl.osisId.split('.')[2]);
    const textEl = chapterEl.querySelector(
      `.verse-container[data-verse="${verse}"] .verse-text`);
    if (!textEl || !rangeMap[hl.color]) return;
    const r = new Range();
    r.selectNodeContents(textEl);
    rangeMap[hl.color].push(r);
  });

  COLORS.forEach(c => {
    if (rangeMap[c.id].length > 0) {
      CSS.highlights.set(`berean-hl-${c.id}`, new Highlight(...rangeMap[c.id]));
    }
  });
}

function _applyViaDataAttr(chapterEl, hls) {
  // Remove stale attributes
  chapterEl.querySelectorAll('[data-hl-color]').forEach(el =>
    el.removeAttribute('data-hl-color'));

  hls.forEach(hl => {
    const verse = parseInt(hl.osisId.split('.')[2]);
    const el    = chapterEl.querySelector(`.verse-container[data-verse="${verse}"]`);
    if (el) el.setAttribute('data-hl-color', hl.color);
  });
}
