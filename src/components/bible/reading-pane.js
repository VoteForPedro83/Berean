/* ============================================================
   reading-pane.js — Main Bible reading component
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';
import { navigateTo, registerHistoryCallbacks } from '../../router.js';
import { getChapter, hasChapterData, isDbReady, initBibleDb } from '../../db/bible.js';
import { getBook, BOOKS } from '../../data/books.js';
import { renderVerse, wireVerseEvents, clearVerseSelection } from './verse.js';
import { setPassage } from '../../state/study-mode.js';
import {
  TRANSLATIONS,
  fetchTranslation,
  isParallelActive,
  toggleParallel,
  renderParallelChapter,
  wireParallelEvents,
} from './parallel.js';
import {
  ABSENT_VERSES,
  LATE_ADDITION_VERSES,
  LATE_ADDITION_RANGES,
  DISPUTED_VERSES,
  VARIANT_NOTES,
  getRangeForVerse,
} from '../../data/textual-variants.js';
import { getNtOtQuotesForChapter } from '../../db/crossrefs.js';
import { getVerseNumbersForPerson } from '../../db/narrative.js';
import { logRead, deleteAllReadsForChapter, getChapterReadCount } from '../../idb/reading-journal.js';
import { toast } from '../layout/toast.js';

let _pane = null;
let _header = null;
let _chapterEl = null;
let _current = { book: 'JHN', chapter: 1, verse: 1 };
let _lastVerses = []; // kept so interlinear can rebuild on toggle
let _activeTranslation = 'WEB';
let _translationPickerEl = null;

export function initReadingPane() {
  _pane = document.getElementById('bible-pane');
  if (!_pane) return;

  _pane.innerHTML = `
    <div class="reading-pane">
      <header class="reading-pane__header" id="reading-header">
        <div class="reading-pane__nav">
          <button class="reading-pane__nav-btn" id="prev-chapter" aria-label="Previous chapter" title="Previous chapter (Alt+←)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="reading-pane__book-btn" id="book-select" aria-haspopup="true" aria-expanded="false">
            <span id="reading-book-name">John</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="reading-pane__chapter-btn" id="chapter-select">
            <span id="reading-chapter-num">1</span>
          </button>
          <button class="reading-pane__nav-btn" id="next-chapter" aria-label="Next chapter" title="Next chapter (Alt+→)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div class="reading-pane__actions">
          <button class="reading-pane__nav-btn reading-pane__history-btn" id="nav-back"
                  aria-label="Go back" title="Go back" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/><line x1="9" y1="12" x2="21" y2="12"/></svg>
          </button>
          <button class="reading-pane__nav-btn reading-pane__history-btn" id="nav-forward"
                  aria-label="Go forward" title="Go forward" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/><line x1="3" y1="12" x2="15" y2="12"/></svg>
          </button>
          <div class="reading-pane__divider"></div>
          <button class="reading-pane__action-btn" id="toggle-interlinear"
                  aria-label="Toggle interlinear (Ctrl+I)" title="Toggle interlinear (Ctrl+I)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h7"/><path d="M14 18l3 3 5-5"/></svg>
          </button>
          <button class="reading-pane__action-btn" id="toggle-parallel"
                  aria-label="Toggle parallel columns (Ctrl+P)" title="Toggle parallel columns (Ctrl+P)"
                  aria-pressed="false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/>
            </svg>
          </button>
          <button class="reading-pane__translation-tag" id="reading-translation-tag"
                  title="Change translation" aria-label="Change translation">WEB</button>
          <div class="reading-pane__divider"></div>
          <button class="reading-pane__action-btn" id="btn-memo-mode"
                  aria-label="Memorisation mode (M)" title="Memorisation mode (M)"
                  aria-pressed="false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
          <button class="reading-pane__action-btn reading-pane__mark-read-btn" id="btn-mark-read"
                  aria-label="Mark chapter as read" title="Mark chapter as read">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
          <button class="reading-pane__action-btn" id="btn-focus-mode"
                  aria-label="Focus mode — hide panels (F)" title="Focus mode — hide panels (F)"
                  aria-pressed="false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
        </div>
      </header>

      <div class="reading-pane__context-banner" id="context-banner" hidden></div>

      <div class="reading-pane__scroll" id="reading-scroll">
        <div class="reading-pane__chapter" id="chapter-content">
          <div class="reading-pane__loading">Loading…</div>
        </div>
      </div>
    </div>

    <!-- Book picker dropdown -->
    <div class="book-picker" id="book-picker" hidden>
      <div class="book-picker__sections">
        <div class="book-picker__section">
          <h3 class="book-picker__heading">Old Testament</h3>
          <div class="book-picker__grid" data-testament="OT"></div>
        </div>
        <div class="book-picker__section">
          <h3 class="book-picker__heading">New Testament</h3>
          <div class="book-picker__grid" data-testament="NT"></div>
        </div>
      </div>
    </div>

    <!-- Chapter picker dropdown -->
    <div class="chapter-picker" id="chapter-picker" hidden>
      <div class="chapter-picker__grid" id="chapter-picker-grid"></div>
    </div>`;

  _chapterEl = document.getElementById('chapter-content');

  // Wire buttons
  document.getElementById('prev-chapter').addEventListener('click', () => goChapter(-1));
  document.getElementById('next-chapter').addEventListener('click', () => goChapter(1));
  document.getElementById('book-select').addEventListener('click', toggleBookPicker);
  document.getElementById('chapter-select').addEventListener('click', toggleChapterPicker);
  document.getElementById('toggle-interlinear').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('berean:toggle-interlinear'));
  });

  document.getElementById('toggle-parallel').addEventListener('click', () => {
    const nowActive = toggleParallel();
    const btn = document.getElementById('toggle-parallel');
    btn.setAttribute('aria-pressed', nowActive);
    btn.classList.toggle('reading-pane__action-btn--active', nowActive);
    // Re-render current chapter in the new mode
    loadChapter(_current.book, _current.chapter, _current.verse);
  });

  document.getElementById('reading-translation-tag').addEventListener('click', e => {
    _toggleTranslationPicker(e.currentTarget);
  });

  // Mark as read — toggle: mark if not read, unmark if already read
  document.getElementById('btn-mark-read').addEventListener('click', async () => {
    const { book, chapter } = _current;
    const osisRef = `${book}.${chapter}`;
    const { name } = BOOKS.find(b => b.osis === book) || {};
    const count = await getChapterReadCount(osisRef);
    if (count > 0) {
      await deleteAllReadsForChapter(osisRef);
      toast(`${name ?? book} ${chapter} unmarked`, 'info');
    } else {
      await logRead(osisRef, book, chapter);
      toast(`${name ?? book} ${chapter} logged ✓`, 'info');
    }
    _updateMarkReadBtn(book, chapter);
  });

  // Back / Forward history buttons
  document.getElementById('nav-back').addEventListener('click', () => history.back());
  document.getElementById('nav-forward').addEventListener('click', () => history.forward());
  updateHistoryButtons();

  // Register callbacks so router can update button state
  registerHistoryCallbacks(recordHistoryPush, recordHistoryPop);

  // When interlinear turns on, rebuild with the currently loaded verses
  document.addEventListener('berean:interlinear-on', () => {
    if (_lastVerses.length) {
      const { buildInterlinearChapter } = window.__bereanInterlinear || {};
      buildInterlinearChapter?.(_lastVerses);
    }
  });

  // Build book picker grids
  buildBookPicker();

  // Wire verse events
  wireVerseEvents(_chapterEl);

  // Listen for navigation
  bus.on(EVENTS.NAVIGATE, ({ book, chapter, verse }) => {
    loadChapter(book, chapter, verse);
  });

  // Listen for theme toggle from command palette
  bus.on(EVENTS.THEME_CHANGE, val => {
    if (val === 'toggle') {
      const { toggleTheme } = window.__bereanState || {};
      toggleTheme?.();
    }
  });

  // Entity graph node tap → subtractive focus: dim verses not containing the entity
  bus.on(EVENTS.ENTITY_SELECTED, async ({ type, id }) => {
    if (type !== 'person') return;
    const rows = await getVerseNumbersForPerson(id, _current.book, _current.chapter);
    const verseSet = new Set(rows.map(r => r.osis_verse));
    document.querySelectorAll('#chapter-content .verse-container').forEach(el => {
      const v = parseInt(el.dataset.osis?.split('.')[2] ?? '0', 10);
      el.classList.toggle('verse-entity-dim', !verseSet.has(v));
    });
  });

  // Graph selection cleared → restore full opacity
  bus.on(EVENTS.ENTITY_CLEARED, _clearEntityFocus);

  // Also clear on chapter navigation so stale dim state doesn't carry over
  bus.on(EVENTS.CHAPTER_LOADED, _clearEntityFocus);
}

function _clearEntityFocus() {
  document.querySelectorAll('#chapter-content .verse-container.verse-entity-dim')
    .forEach(el => el.classList.remove('verse-entity-dim'));
}

async function loadChapter(book, chapter, targetVerse = 1) {
  _current = { book, chapter, verse: targetVerse };
  setPassage({ book, chapter, verse: targetVerse });

  // Update header
  const meta = getBook(book);
  document.getElementById('reading-book-name').textContent = meta?.name ?? book;
  document.getElementById('reading-chapter-num').textContent = chapter;

  // Show or hide prev/next buttons
  document.getElementById('prev-chapter').disabled = chapter <= 1;
  document.getElementById('next-chapter').disabled = chapter >= (meta?.chapters ?? 150);

  clearVerseSelection();
  _chapterEl.innerHTML = `<div class="reading-pane__loading" aria-live="polite">Loading…</div>`;

  const verses = await getChapter(book, chapter);

  if (verses.length === 0) {
    _chapterEl.innerHTML = `
      <div class="reading-pane__no-data">
        <p class="reading-pane__no-data-title">${meta?.name ?? book} ${chapter}</p>
        <p class="reading-pane__no-data-body">No verses found for this chapter.</p>
      </div>`;
    return;
  }

  // Fetch active translation if not WEB
  let displayVerses = verses;
  if (!isParallelActive() && _activeTranslation !== 'WEB') {
    try {
      const alt = await fetchTranslation(_activeTranslation, book, chapter, verses);
      if (alt.length > 0) {
        displayVerses = alt;
      } else {
        // Translation has no data for this book — revert to WEB and notify
        const unavailable = _activeTranslation;
        _activeTranslation = 'WEB';
        toast(`${unavailable} not available for ${meta?.name ?? book} — showing WEB`, 'info');
      }
    } catch {
      const failed = _activeTranslation;
      _activeTranslation = 'WEB';
      toast(`${failed} failed to load — showing WEB`, 'info');
    }
  }

  // Update translation tag
  document.getElementById('reading-translation-tag').textContent = _activeTranslation;

  if (isParallelActive()) {
    // ── Parallel mode ────────────────────────────────────────────────────────
    // Show a quick skeleton while all translation fetches resolve
    _chapterEl.innerHTML = `<div class="reading-pane__loading" aria-live="polite">Loading parallel view…</div>`;

    const parallelHtml = await renderParallelChapter(book, chapter, verses);
    _chapterEl.innerHTML = parallelHtml;

    // Re-render helper — passed to toolbar so adding/removing columns re-renders
    async function reRenderParallel() {
      const html = await renderParallelChapter(book, chapter, verses);
      _chapterEl.innerHTML = html;
      wireParallelEvents(_chapterEl, reRenderParallel);
    }
    wireParallelEvents(_chapterEl, reRenderParallel);

    document.getElementById('reading-scroll')?.scrollTo(0, 0);

  } else {
    // ── Normal single-translation mode ───────────────────────────────────────
    _chapterEl.innerHTML = `
      <h2 class="chapter-heading">
        <span class="chapter-heading__book">${meta?.name ?? book}</span>
        <span class="chapter-heading__number">${chapter}</span>
      </h2>
      <div class="verse-list">
        ${buildVerseListHtml(displayVerses, targetVerse)}
      </div>
      ${!hasRealDb() ? '<p class="mock-notice">Showing mock data — WEB text · Full Bible after database build</p>' : ''}`;

    // Scroll to target verse
    if (targetVerse > 1) {
      const el = document.getElementById(`v-${book}.${chapter}.${targetVerse}`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      document.getElementById('reading-scroll')?.scrollTo(0, 0);
    }
  }

  _lastVerses = verses;
  window.__bereanLastChapter = { book, chapter, verses };
  bus.emit(EVENTS.CHAPTER_LOADED, { book, chapter, verses });

  // Update context banner (non-blocking — narrative.sqlite3 may not be available)
  _updateContextBanner(book, chapter);

  // Update mark-as-read button (non-blocking)
  _updateMarkReadBtn(book, chapter);

  // Mark NT verses that quote the OT (non-blocking — decorative only)
  if (meta?.testament === 'NT') {
    markNtOtQuotes(book, chapter);
  }
}

// ── Mark-as-read button state ─────────────────────────────────────────────────

async function _updateMarkReadBtn(book, chapter) {
  const btn = document.getElementById('btn-mark-read');
  if (!btn) return;
  try {
    const count = await getChapterReadCount(`${book}.${chapter}`);
    btn.classList.toggle('reading-pane__mark-read-btn--done', count > 0);
    btn.title = count > 0
      ? `Read ${count} time${count === 1 ? '' : 's'} — click to log again`
      : 'Mark chapter as read';
  } catch { /* non-critical */ }
}

// ── Context banner ────────────────────────────────────────────────────────────

async function _updateContextBanner(book, chapter) {
  const banner = document.getElementById('context-banner');
  if (!banner) return;
  try {
    const { getChapterPeriodLabel } = await import('../../db/narrative.js');
    const label = await getChapterPeriodLabel(book, chapter);
    if (label) {
      banner.textContent = label;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  } catch {
    banner.hidden = true;
  }
}

// ── NT–OT quote marking ───────────────────────────────────────────────────────

/**
 * After a chapter renders, query NT-OT quote data and mark matching verse
 * containers with a data attribute. The verse menu reads this attribute to
 * show "OT Source" navigation links.  Runs asynchronously so it never blocks
 * initial render.
 */
async function markNtOtQuotes(book, chapter) {
  try {
    const quotes = await getNtOtQuotesForChapter(book, chapter);
    if (!quotes.length) return;

    // Group refs by nt_osis so we can store them all on one element
    const byVerse = {};
    for (const q of quotes) {
      if (!byVerse[q.nt_osis]) byVerse[q.nt_osis] = [];
      byVerse[q.nt_osis].push({ ot: q.ot_osis, rel: q.relationship });
    }

    for (const [ntOsis, refs] of Object.entries(byVerse)) {
      const el = document.getElementById(`v-${ntOsis}`);
      if (!el) continue;
      el.classList.add('verse-container--has-ntot');
      el.dataset.ntotRefs = JSON.stringify(refs);
    }
  } catch {
    // Non-critical decoration — silently ignore errors
  }
}

// ── Verse list with textual variant annotations ───────────────────────────────

/**
 * Builds the inner HTML for the verse list, injecting range banners and
 * per-verse notes for textual variants (absent verses, late additions,
 * disputed verses).
 */
function buildVerseListHtml(verses, targetVerse) {
  const parts = [];
  const announcedRanges = new Set(); // avoid repeating range banners

  for (const v of verses) {
    const osis      = v.osisId;
    const isAbsent  = ABSENT_VERSES.has(osis);
    const isLate    = LATE_ADDITION_VERSES.has(osis);
    const isDisputed = DISPUTED_VERSES.has(osis);

    // ── Range banner (inject once, before the first verse of the range) ──────
    if (isLate) {
      const range = getRangeForVerse(osis);
      if (range && !announcedRanges.has(range.id)) {
        announcedRanges.add(range.id);
        parts.push(renderVariantRangeBanner(range));
      }
    }

    // ── Verse rendering ──────────────────────────────────────────────────────
    if (isAbsent) {
      parts.push(renderAbsentVerse(v, targetVerse));
    } else if (isLate) {
      parts.push(renderLateAdditionVerse(v, targetVerse));
    } else if (isDisputed) {
      parts.push(renderDisputedVerse(v, targetVerse));
    } else {
      parts.push(renderVerse({
        osisId:   osis,
        verse:    v.verse,
        text:     v.text,
        isTarget: v.verse === targetVerse,
      }));
    }
  }

  return parts.join('');
}

/** Range banner — appears once before the first verse of a late addition block */
function renderVariantRangeBanner(range) {
  return `
    <div class="variant-range-banner" role="note" aria-label="Textual variant note">
      <span class="variant-range-banner__icon" aria-hidden="true">※</span>
      <div class="variant-range-banner__body">
        <strong class="variant-range-banner__label">${escapeHtmlStr(range.label)}</strong>
        <p class="variant-range-banner__note">${escapeHtmlStr(range.note)}</p>
      </div>
    </div>`;
}

/**
 * Render a verse that is absent from the oldest manuscripts.
 * The verse itself is rendered identically to any normal verse.
 * The note is a SIBLING element after the verse — never inside it —
 * so the verse number / text alignment is completely unaffected.
 */
function renderAbsentVerse(v, targetVerse) {
  const osis       = v.osisId;
  const customNote = VARIANT_NOTES[osis];
  const noteText   = customNote || 'Not found in the oldest and most reliable manuscripts. Included here for reference; most modern critical editions omit or bracket this verse.';

  return renderVerse({ osisId: osis, verse: v.verse, text: v.text, isTarget: v.verse === targetVerse })
    + `<div class="variant-verse-note" role="note" aria-label="Textual variant note for verse ${v.verse}">
         <span class="variant-verse-note__icon" aria-hidden="true">※</span>
         <span class="variant-verse-note__text">${escapeHtmlStr(noteText)}</span>
       </div>`;
}

/**
 * Render a verse that belongs to a named late-addition range.
 * The range banner already explains the context, so individual
 * verses render exactly like normal verses — no per-verse note.
 */
function renderLateAdditionVerse(v, targetVerse) {
  return renderVerse({ osisId: v.osisId, verse: v.verse, text: v.text, isTarget: v.verse === targetVerse });
}

/**
 * Render a textually disputed verse (present in some early MSS, absent from others).
 * The verse renders normally; a lighter sibling note records the debate.
 */
function renderDisputedVerse(v, targetVerse) {
  const osis       = v.osisId;
  const customNote = VARIANT_NOTES[osis];
  const noteText   = customNote || 'This verse is present in some early manuscripts but absent from others. Its authenticity is debated among textual scholars.';

  return renderVerse({ osisId: osis, verse: v.verse, text: v.text, isTarget: v.verse === targetVerse })
    + `<div class="variant-verse-note variant-verse-note--disputed" role="note" aria-label="Textual variant note for verse ${v.verse}">
         <span class="variant-verse-note__icon" aria-hidden="true">〜</span>
         <span class="variant-verse-note__text">${escapeHtmlStr(noteText)}</span>
       </div>`;
}

function escapeHtmlStr(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function goChapter(delta) {
  const meta = getBook(_current.book);
  const maxChapter = meta?.chapters ?? 150;
  const next = Math.max(1, Math.min(maxChapter, _current.chapter + delta));
  if (next !== _current.chapter) navigateTo({ book: _current.book, chapter: next, verse: 1 });
}

// ── Book Picker ───────────────────────────────────────────
function buildBookPicker() {
  ['OT', 'NT'].forEach(t => {
    const grid = document.querySelector(`.book-picker__grid[data-testament="${t}"]`);
    if (!grid) return;
    BOOKS.filter(b => b.testament === t).forEach(b => {
      const btn = document.createElement('button');
      btn.className = 'book-picker__book';
      btn.textContent = b.abbr;
      btn.title = b.name;
      btn.addEventListener('click', () => {
        navigateTo({ book: b.osis, chapter: 1, verse: 1 });
        closeAllPickers();
      });
      grid.appendChild(btn);
    });
  });
}

function toggleBookPicker() {
  const picker = document.getElementById('book-picker');
  const btn    = document.getElementById('book-select');
  const isHidden = picker.hidden;
  closeAllPickers();
  if (isHidden) {
    picker.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', closeAllPickers, { once: true }), 10);
  }
}

function toggleChapterPicker() {
  const picker = document.getElementById('chapter-picker');
  const grid   = document.getElementById('chapter-picker-grid');
  const isHidden = picker.hidden;
  closeAllPickers();
  if (isHidden) {
    const meta = getBook(_current.book);
    const max  = meta?.chapters ?? 1;
    grid.innerHTML = Array.from({ length: max }, (_, i) => `
      <button class="chapter-picker__num${i + 1 === _current.chapter ? ' chapter-picker__num--active' : ''}"
              data-ch="${i + 1}">${i + 1}</button>`).join('');
    grid.querySelectorAll('[data-ch]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo({ book: _current.book, chapter: parseInt(btn.dataset.ch), verse: 1 });
        closeAllPickers();
      });
    });
    picker.hidden = false;
    setTimeout(() => document.addEventListener('click', closeAllPickers, { once: true }), 10);
  }
}

function closeAllPickers() {
  document.getElementById('book-picker').hidden = true;
  document.getElementById('chapter-picker').hidden = true;
  document.getElementById('book-select')?.setAttribute('aria-expanded', 'false');
}

// ── Translation picker ────────────────────────────────────────────────────────

function _toggleTranslationPicker(anchor) {
  if (_translationPickerEl) {
    _translationPickerEl.remove();
    _translationPickerEl = null;
    return;
  }

  _translationPickerEl = document.createElement('div');
  _translationPickerEl.className = 'parallel-picker';
  _translationPickerEl.setAttribute('role', 'menu');

  _translationPickerEl.innerHTML = Object.entries(TRANSLATIONS).map(([id, t]) => {
    const workerNeeded = !t.offline && !window.__bereanConfig?.workerUrl;
    const isActive = id === _activeTranslation;
    return `<button class="parallel-picker__item${workerNeeded ? ' parallel-picker__item--disabled' : ''}${isActive ? ' parallel-picker__item--active' : ''}"
                     data-pick="${id}"
                     ${workerNeeded ? 'disabled title="Requires Cloudflare Worker"' : ''}
                     role="menuitem">
      <span class="parallel-picker__name">${t.name}</span>
      <span class="parallel-picker__badge${t.offline ? '' : ' parallel-picker__badge--online'}">${t.offline ? 'offline' : 'online'}</span>
    </button>`;
  }).join('');

  _translationPickerEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-pick]:not([disabled])');
    if (!btn) return;
    _activeTranslation = btn.dataset.pick;
    _closeTranslationPicker();
    loadChapter(_current.book, _current.chapter, _current.verse);
  });

  const rect = anchor.getBoundingClientRect();
  Object.assign(_translationPickerEl.style, {
    position: 'fixed',
    top:   `${rect.bottom + 4}px`,
    right: `${document.documentElement.clientWidth - rect.right}px`,
  });

  document.body.appendChild(_translationPickerEl);
  setTimeout(() => document.addEventListener('click', _closeTranslationPicker, { once: true }), 10);
}

function _closeTranslationPicker() {
  _translationPickerEl?.remove();
  _translationPickerEl = null;
}

function hasRealDb() { return isDbReady(); }

// ── History buttons ───────────────────────────────────────────────────────────

// We track history depth ourselves because the browser doesn't expose it.
// _historyDepth counts how many pushStates we've done since the app loaded.
// Back disables at 0; forward disables when we haven't gone back.
let _historyDepth   = 0;
let _forwardDepth   = 0;

/** Call whenever a pushState happens (navigateTo → bus.NAVIGATE). */
export function recordHistoryPush() {
  _historyDepth++;
  _forwardDepth = 0; // new navigation clears forward stack
  updateHistoryButtons();
}

/** Call on popstate (back/forward). */
export function recordHistoryPop(delta) {
  _historyDepth  = Math.max(0, _historyDepth + delta);
  _forwardDepth  = Math.max(0, _forwardDepth - delta);
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const back    = document.getElementById('nav-back');
  const forward = document.getElementById('nav-forward');
  if (back)    back.disabled    = (_historyDepth === 0);
  if (forward) forward.disabled = (_forwardDepth === 0);
}
