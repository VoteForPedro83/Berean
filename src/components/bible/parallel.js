/* ============================================================
   parallel.js — Parallel Bible columns component

   Renders 2–4 translation columns side-by-side in a CSS Grid.
   Verses share grid rows so they stay vertically aligned.
   Scroll sync is free — single scrollable container.

   Offline translations (instant):
     WEB  — bible_base.sqlite3 text_web
     KJV  — bible_base.sqlite3 text_kjv
     ULT  — translations_cc.sqlite3
     UST  — translations_cc.sqlite3

   Online translations (requires Cloudflare Worker):
     ESV, AFR83, AFR53 — API.Bible via Worker proxy
   ============================================================ */

import { getCCChapter, initTranslationsDb } from '../../db/translations.js';
import { fetchApiChapter } from '../../api/apibible.js';
import { getBook } from '../../data/books.js';

// ── Translation catalogue ─────────────────────────────────────────────────────

// Offline: built into local SQLite DB — always available.
// Online: requires deployed Cloudflare Worker + API.Bible key.
// Note: ULT/UST cover NT + select OT books (50/66). They will show
// "not available" for uncovered books (e.g. Psalms, Isaiah, Daniel).
const TRANSLATIONS = {
  BSB:    { label: 'BSB',    name: 'Berean Standard Bible',                  offline: true  },
  WEB:    { label: 'WEB',    name: 'World English Bible',                    offline: true  },
  ULT:    { label: 'ULT',   name: 'unfoldingWord Literal',                   offline: true  },
  UST:    { label: 'UST',   name: 'unfoldingWord Simplified',                offline: true  },
  ASV:    { label: 'ASV',   name: 'American Standard Version',               offline: false },
  GENEVA: { label: 'Geneva', name: 'Geneva Bible (1587)',                    offline: false },
  LSV:    { label: 'LSV',   name: 'Literal Standard Version',                offline: false },
  TSN:    { label: 'TSN',   name: 'Setswana — Open Tswana Living (NT only)', offline: false },
};

// ── State ─────────────────────────────────────────────────────────────────────

let _active       = false;
let _translations = ['WEB', 'ULT'];  // default pair (KJV needs text_kjv built into bible_base)

export { TRANSLATIONS };
export function isParallelActive()        { return _active; }
export function getParallelTranslations() { return [..._translations]; }

/** Public wrapper — lets reading-pane fetch any translation in single-column mode. */
export async function fetchTranslation(id, book, chapter, webVerses) {
  return _fetchTranslation(id, book, chapter, webVerses);
}

export function toggleParallel() {
  _active = !_active;
  return _active;
}

/** Pre-warm the CC translations DB so ULT/UST are fast on first use. */
export function initParallel() {
  initTranslationsDb().catch(() => {});
}

// ── Main render ───────────────────────────────────────────────────────────────

/**
 * Build the full parallel chapter HTML.
 * Called by reading-pane.js after it fetches the primary WEB chapter.
 *
 * @param {string} book
 * @param {number} chapter
 * @param {Array}  webVerses  Already-fetched WEB verses [{verse, text, osisId}]
 * @returns {Promise<string>} Complete HTML for #chapter-content
 */
export async function renderParallelChapter(book, chapter, webVerses) {
  const meta = getBook(book);

  // Fetch all translations concurrently (offline ones are instant)
  const settled = await Promise.allSettled(
    _translations.map(id => _fetchTranslation(id, book, chapter, webVerses))
  );

  const cols = _translations.map((id, i) => ({
    id,
    meta: TRANSLATIONS[id] ?? { label: id, name: id, offline: false },
    verses: settled[i].status === 'fulfilled' ? settled[i].value : [],
    failed: settled[i].status === 'rejected',
  }));

  const heading = `
    <h2 class="chapter-heading">
      <span class="chapter-heading__book">${esc(meta?.name ?? book)}</span>
      <span class="chapter-heading__number">${chapter}</span>
    </h2>`;

  return heading + _renderToolbar() + _renderGrid(cols);
}

// ── Grid renderer ─────────────────────────────────────────────────────────────

function _renderGrid(cols) {
  const n = cols.length;

  // Highest verse number across all columns
  const maxVerse = cols.reduce((max, col) => {
    const top = col.verses.length > 0 ? col.verses[col.verses.length - 1].verse : 0;
    return Math.max(max, top);
  }, 1);

  // Pre-index verses by verse number for O(1) lookup
  const indexed = cols.map(col => {
    const map = new Map();
    col.verses.forEach(v => map.set(v.verse, v.text));
    return map;
  });

  const parts = [];

  // Column header row
  for (const col of cols) {
    const workerNeeded = !col.meta.offline && !window.__bereanConfig?.workerUrl;
    const noData       = !col.failed && col.verses.length === 0;
    parts.push(`<div class="parallel-col-head">
      <span class="parallel-col-head__label">${esc(col.meta.label)}</span>
      ${workerNeeded ? '<span class="parallel-col-head__badge parallel-col-head__badge--warn">needs Worker</span>' : ''}
      ${col.failed   ? '<span class="parallel-col-head__badge parallel-col-head__badge--err">error</span>'        : ''}
      ${noData       ? '<span class="parallel-col-head__badge parallel-col-head__badge--warn">not available</span>' : ''}
    </div>`);
  }

  // Verse rows — output N cells per verse so CSS Grid puts them on the same row
  for (let v = 1; v <= maxVerse; v++) {
    for (let c = 0; c < n; c++) {
      const text    = indexed[c].get(v);
      const isEmpty = cols[c].verses.length === 0;

      if (isEmpty) {
        // Entire column has no data — only render a placeholder on verse 1
        if (v === 1) {
          parts.push(`<div class="parallel-verse parallel-verse--unavailable"
                           style="grid-row: 2 / ${maxVerse + 2}">
            <span class="parallel-verse__unavailable-msg">Not available for this book</span>
          </div>`);
        }
        // Skip all other verse slots for this column (already spanned)
      } else if (text !== undefined) {
        parts.push(`<div class="parallel-verse" data-verse="${v}">
          <sup class="parallel-verse__num">${v}</sup><span class="parallel-verse__text">${esc(text)}</span>
        </div>`);
      } else {
        // Verse absent in this translation (e.g. verse numbering differs)
        parts.push(`<div class="parallel-verse parallel-verse--empty" data-verse="${v}">
          <sup class="parallel-verse__num">${v}</sup>
        </div>`);
      }
    }
  }

  return `<div class="parallel-grid" style="--parallel-cols:${n}">${parts.join('')}</div>`;
}

// ── Toolbar renderer ──────────────────────────────────────────────────────────

function _renderToolbar() {
  const chips = _translations.map(id => {
    const t = TRANSLATIONS[id] ?? { label: id };
    const canRemove = _translations.length > 1;
    return `<span class="parallel-chip">
      <span class="parallel-chip__label">${esc(t.label)}</span>
      ${canRemove
        ? `<button class="parallel-chip__remove" data-remove="${esc(id)}" aria-label="Remove ${esc(t.label)} column" title="Remove ${esc(t.label)}">×</button>`
        : ''}
    </span>`;
  }).join('');

  const addBtn = _translations.length < 4
    ? `<button class="parallel-add-btn" id="parallel-add-btn" aria-label="Add a translation column">+ Add translation</button>`
    : '';

  return `<div class="parallel-toolbar" id="parallel-toolbar">${chips}${addBtn}</div>`;
}

// ── DOM event wiring ──────────────────────────────────────────────────────────

/**
 * Wire toolbar interactions after HTML has been injected into the DOM.
 * @param {HTMLElement} container  The #chapter-content element
 * @param {Function}    rerender   Callback to trigger a full re-render
 */
export function wireParallelEvents(container, rerender) {
  const toolbar = container.querySelector('#parallel-toolbar');
  if (!toolbar) return;

  toolbar.addEventListener('click', e => {
    // Remove a translation column
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      _removeTranslation(removeBtn.dataset.remove);
      rerender();
      return;
    }

    // Open translation picker
    if (e.target.closest('#parallel-add-btn')) {
      _openPicker(e.target.closest('#parallel-add-btn'), rerender);
    }
  });
}

// ── Translation management ────────────────────────────────────────────────────

function _removeTranslation(id) {
  if (_translations.length <= 1) return;
  _translations = _translations.filter(t => t !== id);
}

function _addTranslation(id) {
  if (_translations.includes(id) || _translations.length >= 4) return;
  _translations.push(id);
}

// ── Translation picker dropdown ───────────────────────────────────────────────

let _pickerEl = null;

function _openPicker(anchor, rerender) {
  // Close if already open
  if (_pickerEl) { _pickerEl.remove(); _pickerEl = null; return; }

  const available = Object.entries(TRANSLATIONS)
    .filter(([id]) => !_translations.includes(id));

  _pickerEl = document.createElement('div');
  _pickerEl.className = 'parallel-picker';
  _pickerEl.setAttribute('role', 'menu');

  if (!available.length) {
    _pickerEl.innerHTML = `<p class="parallel-picker__empty">All translations already shown</p>`;
  } else {
    _pickerEl.innerHTML = available.map(([id, t]) => {
      const workerNeeded = !t.offline && !window.__bereanConfig?.workerUrl;
      return `<button class="parallel-picker__item${workerNeeded ? ' parallel-picker__item--disabled' : ''}"
                       data-pick="${esc(id)}"
                       ${workerNeeded ? 'disabled title="Requires Cloudflare Worker — see docs/WORKER.md"' : ''}
                       role="menuitem">
        <span class="parallel-picker__name">${esc(t.name)}</span>
        <span class="parallel-picker__badge${t.offline ? '' : ' parallel-picker__badge--online'}">
          ${t.offline ? 'offline' : 'online'}
        </span>
      </button>`;
    }).join('');

    _pickerEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-pick]:not([disabled])');
      if (!btn) return;
      _addTranslation(btn.dataset.pick);
      _closePicker();
      rerender();
    });
  }

  // Position below anchor button
  const rect = anchor.getBoundingClientRect();
  Object.assign(_pickerEl.style, {
    position: 'fixed',
    top:  `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
  });

  document.body.appendChild(_pickerEl);
  // Close on next outside click
  setTimeout(() => document.addEventListener('click', _closePicker, { once: true }), 10);
}

function _closePicker() {
  _pickerEl?.remove();
  _pickerEl = null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

/**
 * Fetch a chapter in a given translation.
 * Returns [{osisId, verse, text}].
 */
async function _fetchTranslation(id, book, chapter, webVerses) {
  switch (id) {
    case 'WEB':
      return webVerses.map(v => ({ osisId: v.osisId, verse: v.verse, text: v.text }));

    case 'BSB': {
      const { getChapterBsb } = await import('../../db/bible.js');
      return getChapterBsb(book, chapter);
    }

    case 'KJV': {
      const { getChapterKjv } = await import('../../db/bible.js');
      return getChapterKjv(book, chapter);
    }

    case 'ULT':
    case 'UST':
      return getCCChapter(book, chapter, id);

    default:
      // Online translations via API.Bible Worker
      return fetchApiChapter(book, chapter, id);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
