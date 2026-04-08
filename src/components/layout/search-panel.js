/* ============================================================
   search-panel.js — FTS5 full-text Bible search
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';
import { searchBible } from '../../db/bible.js';
import { navigateTo } from '../../router.js';
import { BOOKS } from '../../data/books.js';

let _panel      = null;
let _input      = null;
let _results    = null;
let _bookFilter = null;
let _debounce   = null;
let _lastQuery  = '';

export function initSearchPanel() {
  _panel = document.getElementById('search-panel');
  if (!_panel) return;

  _panel.innerHTML = `
    <div class="sp-header">
      <div class="sp-search-row">
        <svg class="sp-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input class="sp-input" id="sp-input" type="search"
               placeholder='Search the Bible… try "born again", John AND love, G3056'
               autocomplete="off" spellcheck="false" aria-label="Search the Bible"/>
        <button class="sp-clear" id="sp-clear" aria-label="Clear search" hidden>×</button>
      </div>
      <div class="sp-filters" id="sp-filters">
        <select class="sp-book-filter" id="sp-book-filter" aria-label="Filter by book">
          <option value="">All books</option>
          <optgroup label="Old Testament">
            ${BOOKS.filter(b => b.testament === 'OT').map(b =>
              `<option value="${b.osis}">${b.name}</option>`).join('')}
          </optgroup>
          <optgroup label="New Testament">
            ${BOOKS.filter(b => b.testament === 'NT').map(b =>
              `<option value="${b.osis}">${b.name}</option>`).join('')}
          </optgroup>
        </select>
        <span class="sp-result-count" id="sp-result-count"></span>
        <span class="sp-hint">Supports: phrases "…", AND / OR / NOT, Strong's G3056</span>
      </div>
    </div>
    <div class="sp-results" id="sp-results" role="list" aria-live="polite" aria-label="Search results">
      <div class="sp-empty">
        <p class="sp-empty__title">Search the Bible</p>
        <p class="sp-empty__body">Type a word, phrase, or Strong's number above.</p>
      </div>
    </div>`;

  _input      = document.getElementById('sp-input');
  _results    = document.getElementById('sp-results');
  _bookFilter = document.getElementById('sp-book-filter');

  _input.addEventListener('input', () => {
    const q = _input.value.trim();
    document.getElementById('sp-clear').hidden = !q;
    clearTimeout(_debounce);
    if (!q) { _showEmpty(); return; }
    _debounce = setTimeout(() => _runSearch(q), 300);
  });

  document.getElementById('sp-clear').addEventListener('click', () => {
    _input.value = '';
    document.getElementById('sp-clear').hidden = true;
    _showEmpty();
    _input.focus();
  });

  _bookFilter.addEventListener('change', () => {
    const q = _input.value.trim();
    if (q) _runSearch(q);
  });

  // Click result → navigate, fire VERSE_SELECT so right panel updates, close search
  _results.addEventListener('click', e => {
    const item = e.target.closest('[data-osis]');
    if (!item) return;
    const osisId  = item.dataset.osis;
    const [book, ch, v] = osisId.split('.');
    const chapter = parseInt(ch, 10);
    const verse   = parseInt(v, 10);
    navigateTo({ book, chapter, verse });
    // Right panel (commentary, cross-refs, topics) listens to VERSE_SELECT
    bus.emit(EVENTS.VERSE_SELECT, { osisId, book, chapter, verse });
    bus.emit('search:close');
  });
}

async function _runSearch(q) {
  _lastQuery = q;
  _results.innerHTML = `<div class="sp-loading">Searching…</div>`;

  try {
    const rows = await searchBible(q, {
      limit: 100,
      book: _bookFilter.value || undefined,
    });

    // Guard against stale results if user typed again quickly
    if (q !== _lastQuery) return;

    const count = document.getElementById('sp-result-count');

    if (!rows.length) {
      count.textContent = '';
      _results.innerHTML = `
        <div class="sp-empty">
          <p class="sp-empty__title">No results</p>
          <p class="sp-empty__body">Try a different word or phrase. Use quotes for exact phrases: "word of God"</p>
        </div>`;
      return;
    }

    count.textContent = rows.length === 100 ? '100+ results' : `${rows.length} result${rows.length !== 1 ? 's' : ''}`;

    _results.innerHTML = rows.map(r => {
      const ref   = _formatRef(r);
      const snip  = r.snippet || r.text || '';
      return `<div class="sp-result" data-osis="${_esc(r.osisId)}" role="listitem" tabindex="0">
        <span class="sp-result__ref">${_esc(ref)}</span>
        <span class="sp-result__snippet">${snip}</span>
      </div>`;
    }).join('');

  } catch (err) {
    if (q !== _lastQuery) return;
    document.getElementById('sp-result-count').textContent = '';
    _results.innerHTML = `
      <div class="sp-empty">
        <p class="sp-empty__title">Search error</p>
        <p class="sp-empty__body">${_esc(err.message)}</p>
      </div>`;
  }
}

function _showEmpty() {
  _lastQuery = '';
  document.getElementById('sp-result-count').textContent = '';
  _results.innerHTML = `
    <div class="sp-empty">
      <p class="sp-empty__title">Search the Bible</p>
      <p class="sp-empty__body">Type a word, phrase, or Strong's number above.</p>
    </div>`;
}

function _formatRef(r) {
  const book = BOOKS.find(b => b.osis === r.book);
  return `${book?.name ?? r.book} ${r.chapter}:${r.verse}`;
}

export function showSearchPanel() {
  _panel?.removeAttribute('hidden');
  setTimeout(() => _input?.focus(), 50);
}

export function hideSearchPanel() {
  _panel?.setAttribute('hidden', '');
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
