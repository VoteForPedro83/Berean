/* ============================================================
   reading-journal.js — Reading Journal sidebar view

   Four tabs:
   - Year:     66-book chapter grid for the current year
   - All-Time: same grid, all history, with % coverage
   - Calendar: monthly heatmap of chapters read
   - Log:      chronological list with editable notes

   Invoked from sidebar nav → main.js view:change 'journal'
   "Mark as read" button lives in reading-pane.js header.
   ============================================================ */

import { BOOKS } from '../../data/books.js';
import {
  getAllReads, getReadOsisRefsForYear, getAllReadOsisRefs,
  getMonthlyReadCounts, deleteRead, updateNote,
} from '../../idb/reading-journal.js';

// ── Bible totals ──────────────────────────────────────────
const TOTAL_OT = BOOKS.filter(b => b.testament === 'OT').reduce((s, b) => s + b.chapters, 0); // 929
const TOTAL_NT = BOOKS.filter(b => b.testament === 'NT').reduce((s, b) => s + b.chapters, 0); // 260
const TOTAL    = TOTAL_OT + TOTAL_NT; // 1189

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Module state ──────────────────────────────────────────
let _container = null;
let _view = 'year';
let _year = new Date().getFullYear();

// ── Public API ────────────────────────────────────────────

export function initReadingJournal(containerEl) {
  _container = containerEl;
  _render();
}

// Called every time the journal view is re-activated (data may have changed)
export function refreshReadingJournal() {
  if (_container) _render();
}

// ── Router ────────────────────────────────────────────────

async function _render() {
  switch (_view) {
    case 'year':     await _renderYearView();     break;
    case 'overall':  await _renderOverallView();  break;
    case 'calendar': await _renderCalendarView(); break;
    case 'log':      await _renderLogView();      break;
  }
}

// ── Shared HTML fragments ─────────────────────────────────

function _shell(bodyHtml) {
  return `
    <div class="rj">
      <div class="rj__header">
        <h2 class="rj__title">Reading Journal</h2>
      </div>
      <div class="rj__tabs" role="tablist">
        ${_tab('year',     'Year')}
        ${_tab('overall',  'All-Time')}
        ${_tab('calendar', 'Calendar')}
        ${_tab('log',      'Log')}
      </div>
      ${bodyHtml}
    </div>`;
}

function _tab(id, label) {
  return `<button class="rj__tab${_view === id ? ' rj__tab--active' : ''}"
    role="tab" aria-selected="${_view === id}" data-view="${id}">${label}</button>`;
}

// ── Year view ─────────────────────────────────────────────

async function _renderYearView() {
  const readSet = await getReadOsisRefsForYear(_year);
  const { otRead, ntRead } = _countRead(readSet);
  const thisYear = new Date().getFullYear();

  _container.innerHTML = _shell(`
    <div class="rj__year-nav">
      <button class="rj__year-btn" id="rj-prev-year" aria-label="Previous year">‹</button>
      <span class="rj__year-label">${_year}</span>
      <button class="rj__year-btn" id="rj-next-year" aria-label="Next year"
              ${_year >= thisYear ? 'disabled' : ''}>›</button>
    </div>
    <div class="rj__stats">
      <span class="rj__stat">${otRead} / ${TOTAL_OT} OT</span>
      <span class="rj__stat-sep">·</span>
      <span class="rj__stat">${ntRead} / ${TOTAL_NT} NT</span>
    </div>
    <div class="rj__grid">${_bookGrid(readSet)}</div>
  `);

  _wireTabs();
  document.getElementById('rj-prev-year')?.addEventListener('click', () => { _year--; _render(); });
  document.getElementById('rj-next-year')?.addEventListener('click', () => { _year++; _render(); });
}

// ── Overall (all-time) view ───────────────────────────────

async function _renderOverallView() {
  const readSet = await getAllReadOsisRefs();
  const { otRead, ntRead } = _countRead(readSet);
  const total = otRead + ntRead;
  const pct   = (total / TOTAL * 100).toFixed(1);

  _container.innerHTML = _shell(`
    <div class="rj__overall-stats">
      <span class="rj__pct">${pct}%</span>
      <span class="rj__pct-label">of the Bible read</span>
      <div class="rj__progress-bar">
        <div class="rj__progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="rj__stats rj__stats--row">
        <span class="rj__stat">${otRead} / ${TOTAL_OT} OT chapters</span>
        <span class="rj__stat-sep">·</span>
        <span class="rj__stat">${ntRead} / ${TOTAL_NT} NT chapters</span>
      </div>
    </div>
    <div class="rj__grid">${_bookGrid(readSet)}</div>
  `);

  _wireTabs();
}

// ── Calendar (monthly heatmap) view ──────────────────────

async function _renderCalendarView() {
  const counts   = await getMonthlyReadCounts();
  const countMap = new Map(counts.map(c => [c.yearMonth, c.count]));
  const maxCount = counts.length ? Math.max(...counts.map(c => c.count)) : 1;

  // All months from first read to now
  const now       = new Date();
  const nowYM     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startYM   = counts.length ? counts[0].yearMonth : nowYM;
  const months    = [];
  const cur       = new Date(startYM + '-01');
  const endDate   = new Date(nowYM + '-01');
  while (cur <= endDate) {
    const ym = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    months.push({ ym, count: countMap.get(ym) || 0 });
    cur.setMonth(cur.getMonth() + 1);
  }

  _container.innerHTML = _shell(`
    ${months.length === 0
      ? '<p class="rj__empty">No chapters logged yet.</p>'
      : `<div class="rj__calendar">
          ${months.map(({ ym, count }) => {
            const [yr, mo] = ym.split('-');
            const intensity = count === 0 ? 0 : Math.ceil((count / maxCount) * 4);
            const moLabel   = MONTH_NAMES[parseInt(mo, 10) - 1];
            return `
              <div class="rj__month rj__month--${intensity}"
                   title="${moLabel} ${yr}: ${count} chapter${count === 1 ? '' : 's'}">
                <span class="rj__month-name">${moLabel}</span>
                <span class="rj__month-yr">${yr}</span>
                <span class="rj__month-count">${count || ''}</span>
              </div>`;
          }).join('')}
        </div>`}
  `);

  _wireTabs();
}

// ── Log view ──────────────────────────────────────────────

async function _renderLogView() {
  const reads = await getAllReads();

  _container.innerHTML = _shell(`
    ${reads.length === 0
      ? `<p class="rj__empty">No chapters logged yet.<br>
         Use the <strong>✓ Mark as read</strong> button in the reading pane header.</p>`
      : `<div class="rj__log">
          ${reads.map(r => `
            <div class="rj__log-entry" data-id="${r.id}">
              <div class="rj__log-entry-head">
                <span class="rj__log-ref">${_bookName(r.book)} ${r.chapter}</span>
                <span class="rj__log-date">${_fmtDate(r.readAt)}</span>
                <button class="rj__log-del" data-delete="${r.id}" title="Remove entry">×</button>
              </div>
              <textarea class="rj__log-note" data-id="${r.id}" rows="2"
                        placeholder="Add a note…">${_esc(r.note || '')}</textarea>
            </div>`).join('')}
        </div>`}
  `);

  _wireTabs();

  // Delete
  _container.addEventListener('click', async e => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    if (!confirm('Remove this log entry?')) return;
    await deleteRead(btn.dataset.delete);
    _renderLogView();
  });

  // Note editing — debounced
  let _saveTimer = null;
  _container.addEventListener('input', e => {
    if (!e.target.matches('.rj__log-note')) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => updateNote(e.target.dataset.id, e.target.value), 800);
  });
}

// ── Helpers ───────────────────────────────────────────────

function _bookGrid(readSet) {
  return BOOKS.map(book => {
    const squares = Array.from({ length: book.chapters }, (_, i) => {
      const ch     = i + 1;
      const isRead = readSet.has(`${book.osis}.${ch}`);
      return `<span class="rj__ch${isRead ? ' rj__ch--read' : ''}"
                    title="${book.name} ${ch}"></span>`;
    }).join('');
    return `
      <div class="rj__book-row">
        <span class="rj__book-abbr" title="${book.name}">${book.abbr}</span>
        <div class="rj__book-chs">${squares}</div>
      </div>`;
  }).join('');
}

function _countRead(readSet) {
  let otRead = 0, ntRead = 0;
  for (const book of BOOKS) {
    for (let c = 1; c <= book.chapters; c++) {
      if (readSet.has(`${book.osis}.${c}`)) {
        if (book.testament === 'OT') otRead++; else ntRead++;
      }
    }
  }
  return { otRead, ntRead };
}

function _wireTabs() {
  _container.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => { _view = btn.dataset.view; _render(); });
  });
}

function _bookName(osis) {
  return BOOKS.find(b => b.osis === osis)?.name || osis;
}

function _fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function _esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
