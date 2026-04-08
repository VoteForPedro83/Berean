/* ============================================================
   progress-panel.js — Reading plans + progress heatmap (Stage 5)
   Supports 6 reading plans; per-plan IDB progress tracking.
   ============================================================ */
import { BOOKS, BOOK_MAP } from '../../data/books.js';
import { bus, EVENTS }     from '../../state/eventbus.js';
import { getDB }           from '../../idb/schema.js';
import { navigateTo }      from '../../router.js';

// ─────────────────────────────────────────────────────────────
// Helper: build an array of {osis, book, chapter} from a book list
// ─────────────────────────────────────────────────────────────
function _chaptersFor(osisList) {
  const out = [];
  for (const osis of osisList) {
    const book = BOOK_MAP.get(osis);
    if (!book) continue;
    for (let ch = 1; ch <= book.chapters; ch++) {
      out.push({ osis: `${osis}.${ch}`, book, chapter: ch });
    }
  }
  return out;
}

// Distribute N chapters evenly across D days (same algorithm as original)
function _distribute(chapters, days) {
  const result = [];
  const total  = chapters.length;
  let   idx    = 0;
  for (let day = 0; day < days; day++) {
    const count = Math.round((total - idx) / (days - day));
    result.push(chapters.slice(idx, idx + count));
    idx += count;
  }
  return result;
}

// Cycle N chapters across D days (1 per day, repeating)
function _cycle(chapters, days) {
  return Array.from({ length: days }, (_, i) => [chapters[i % chapters.length]]);
}

// ─────────────────────────────────────────────────────────────
// Reading plan generators — each returns a PLAN array:
//   PLAN[dayIndex] = Array<{osis, book, chapter, stream?}>
// ─────────────────────────────────────────────────────────────

// 1. Bible in a Year — sequential GEN→REV, 365 days
function _genSequential() {
  return _distribute(
    _chaptersFor(BOOKS.map(b => b.osis)),
    365,
  );
}

// 2. M'Cheyne 4-Stream — 365 days, ~4 readings/day
//    Stream A: OT Narrative  (GEN–EST, 436 chap, distributed)
//    Stream B: OT Wisdom+Prophets (JOB–MAL, 493 chap, distributed)
//    Stream C: Gospels+Acts  (MAT–ACT, 117 chap, cycling ~3×)
//    Stream D: Epistles+Rev  (ROM–REV, 143 chap, cycling ~2.5×)
function _genMcheyne() {
  const streamA = _chaptersFor(['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT',
    '1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST']);
  const streamB = _chaptersFor(['JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM',
    'EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL']);
  const streamC = _chaptersFor(['MAT','MRK','LUK','JHN','ACT']);
  const streamD = _chaptersFor(['ROM','1CO','2CO','GAL','EPH','PHP','COL',
    '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE',
    '1JN','2JN','3JN','JUD','REV']);

  const dA = _distribute(streamA, 365);
  const dB = _distribute(streamB, 365);
  const dC = _cycle(streamC, 365);
  const dD = _cycle(streamD, 365);

  return Array.from({ length: 365 }, (_, i) => [
    ...dA[i].map(r => ({ ...r, stream: 'OT Narrative' })),
    ...dB[i].map(r => ({ ...r, stream: 'Wisdom & Prophets' })),
    ...dC[i].map(r => ({ ...r, stream: 'Gospels & Acts' })),
    ...dD[i].map(r => ({ ...r, stream: 'Epistles' })),
  ]);
}

// 3. Chronological — events in historical order, 365 days
function _genChronological() {
  // Approximate chronological order of books
  const ORDER = [
    'GEN','JOB','EXO','LEV','NUM','DEU',
    'JOS','JDG','RUT','1SA','2SA',
    'PSA',
    '1KI','1CH','2CH','PRO','ECC','SNG','2KI',
    'OBA','JOL','JON','AMO','HOS','ISA','MIC',
    'NAH','HAB','ZEP','JER','LAM','EZK','DAN',
    'EZR','HAG','ZEC','NEH','EST','MAL',
    'MAT','MRK','LUK','JHN','ACT',
    'JAS','GAL','1TH','2TH','1CO','2CO','ROM',
    'EPH','PHP','COL','PHM','1TI','2TI','TIT',
    '1PE','2PE','HEB','JUD','1JN','2JN','3JN','REV',
  ];
  return _distribute(_chaptersFor(ORDER), 365);
}

// 4. New Testament in a Year — NT cycling, 365 days (NT read ~1.4×)
function _genNTYear() {
  const nt = _chaptersFor(BOOKS.filter(b => b.testament === 'NT').map(b => b.osis));
  return _cycle(nt, 365);
}

// 5. Psalms & Proverbs — 31-day monthly cycle
//    Days 1–30: 5 Psalms each (using the N, N+30, N+60, N+90, N+120 method)
//    Day  31:   Ps 31 + last 4 wraparound Psalms + Prov 31
//    Each day also reads the corresponding Proverbs chapter
function _genPsalmsProverbs() {
  const psalms   = _chaptersFor(['PSA']); // 150 chapters
  const proverbs = _chaptersFor(['PRO']); // 31 chapters

  return Array.from({ length: 31 }, (_, i) => {
    const day = i + 1; // 1-indexed
    const readings = [];

    // 5 Psalms using the interleaved method: Ps day, day+30, day+60, day+90, day+120
    // For day 31 we use: Ps 31,61,91,121,151→wrap to Ps 1
    for (let k = 0; k < 5; k++) {
      const psIdx = ((day - 1) + k * 30) % 150;
      readings.push({ ...psalms[psIdx], stream: 'Psalms' });
    }

    // 1 Proverbs chapter (Prov i+1, or Prov 31 on day 31)
    const provIdx = Math.min(i, 30);
    readings.push({ ...proverbs[provIdx], stream: 'Proverbs' });

    return readings;
  });
}

// 6. Bible in 2 Years — slow sequential, 730 days
function _genTwoYear() {
  return _distribute(
    _chaptersFor(BOOKS.map(b => b.osis)),
    730,
  );
}

// ─────────────────────────────────────────────────────────────
// Plan registry
// ─────────────────────────────────────────────────────────────
const PLAN_DEFS = [
  {
    id: 'sequential',
    name: 'Bible in a Year',
    desc: 'Genesis to Revelation in 365 days.',
    days: 365,
    generate: _genSequential,
  },
  {
    id: 'mcheyne',
    name: "M'Cheyne (4 Streams)",
    desc: '~4 readings/day: OT narrative, wisdom & prophets, Gospels, and Epistles.',
    days: 365,
    generate: _genMcheyne,
  },
  {
    id: 'chronological',
    name: 'Chronological',
    desc: 'The Bible in the order events occurred.',
    days: 365,
    generate: _genChronological,
  },
  {
    id: 'nt_year',
    name: 'New Testament in a Year',
    desc: 'One NT chapter daily, cycling through the NT ~1.4×.',
    days: 365,
    generate: _genNTYear,
  },
  {
    id: 'psalms_proverbs',
    name: 'Psalms & Proverbs',
    desc: 'A 31-day monthly cycle: 5 Psalms + 1 Proverbs per day.',
    days: 31,
    generate: _genPsalmsProverbs,
  },
  {
    id: 'two_year',
    name: 'Bible in 2 Years',
    desc: 'A gentler pace through the whole Bible over 730 days.',
    days: 730,
    generate: _genTwoYear,
  },
];

// Cache generated plans so they're only built once
const _planCache = {};
function _getPlan(id) {
  if (!_planCache[id]) {
    const def = PLAN_DEFS.find(p => p.id === id);
    _planCache[id] = def ? def.generate() : [];
  }
  return _planCache[id];
}

// ─────────────────────────────────────────────────────────────
// Module state
// ─────────────────────────────────────────────────────────────
let _container      = null;
let _inited         = false;
let _progress       = null;   // current plan's IDB record
let _activePlanId   = localStorage.getItem('berean_plan') || 'sequential';
let _viewDayIdx     = 0;

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────
export async function initProgressPanel(containerEl) {
  _container = containerEl;
  _progress  = await _loadProgress(_activePlanId);
  _viewDayIdx = _todayIndex();

  if (!_inited) {
    _inited = true;
    bus.on(EVENTS.CHAPTER_LOADED, async ({ book, chapter }) => {
      const key = `${book}.${chapter}`;
      if (!_progress.visitedChapters.includes(key)) {
        _progress.visitedChapters.push(key);
        await _saveProgress(_progress);
        _render();
      }
    });
  }

  _render();
}

// ─────────────────────────────────────────────────────────────
// IDB
// ─────────────────────────────────────────────────────────────
async function _loadProgress(planId) {
  try {
    const db  = await getDB();
    const rec = await db.get('ReadingPlanProgress', planId);
    return rec ?? _freshProgress(planId);
  } catch {
    return _freshProgress(planId);
  }
}

function _freshProgress(planId) {
  return {
    planId,
    startDate:       Date.now(),
    completedDays:   [],
    visitedChapters: [],
  };
}

async function _saveProgress(p) {
  try {
    const db = await getDB();
    await db.put('ReadingPlanProgress', p);
  } catch (e) {
    console.warn('[progress] save failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function _planDef() {
  return PLAN_DEFS.find(p => p.id === _activePlanId) || PLAN_DEFS[0];
}

function _todayIndex() {
  const def  = _planDef();
  const diff = Math.floor((Date.now() - _progress.startDate) / 86_400_000);
  return Math.min(Math.max(diff, 0), def.days - 1);
}

function _totalPct() {
  const total   = BOOKS.reduce((s, b) => s + b.chapters, 0);
  const visited = _progress.visitedChapters.length;
  return ((visited / total) * 100).toFixed(2);
}

function _bookPct(book) {
  let done = 0;
  for (let ch = 1; ch <= book.chapters; ch++) {
    if (_progress.visitedChapters.includes(`${book.osis}.${ch}`)) done++;
  }
  return done / book.chapters;
}

// ─────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────
function _render() {
  if (!_container) return;

  const def          = _planDef();
  const plan         = _getPlan(_activePlanId);
  const todayIdx     = _todayIndex();
  const dayIdx       = _viewDayIdx;
  const dayReadings  = plan[dayIdx] || [];
  const isComplete   = _progress.completedDays.includes(dayIdx);
  const doneCount    = dayReadings.filter(r => _progress.visitedChapters.includes(r.osis)).length;
  const isToday      = dayIdx === todayIdx;
  const canGoPrev    = dayIdx > 0;
  const canGoNext    = dayIdx < def.days - 1;

  // Group by stream (for M'Cheyne and Psalms+Proverbs)
  const hasStreams    = dayReadings.some(r => r.stream);
  const grouped      = _groupByStream(dayReadings);

  _container.innerHTML = `
    <div class="pp-wrap">

      <!-- ── Plan selector ──────────────────────────── -->
      <section class="pp-section pp-section--plan-select">
        <div class="pp-section__hd">
          <span class="pp-section__title">Reading Plan</span>
        </div>
        <select class="pp-plan-select" id="pp-plan-select" aria-label="Choose reading plan">
          ${PLAN_DEFS.map(p => `
            <option value="${p.id}" ${p.id === _activePlanId ? 'selected' : ''}>
              ${p.name}
            </option>`).join('')}
        </select>
        <p class="pp-plan-desc">${def.desc}</p>
      </section>

      <!-- ── Day's readings ──────────────────────────── -->
      <section class="pp-section">
        <div class="pp-section__hd">
          <span class="pp-section__title">
            ${isToday ? "Today's Reading" : `Day ${dayIdx + 1}`}
          </span>
          <span class="pp-section__badge">
            ${isToday ? 'Today · ' : ''}Day ${dayIdx + 1} / ${def.days}
          </span>
        </div>

        <!-- Day navigation -->
        <div class="pp-day-nav">
          <button class="pp-day-btn" id="pp-prev-day" ${canGoPrev ? '' : 'disabled'}>&#8592; Prev</button>
          <button class="pp-day-btn pp-day-btn--today" id="pp-goto-today" ${isToday ? 'disabled' : ''}>Today</button>
          <button class="pp-day-btn" id="pp-next-day" ${canGoNext ? '' : 'disabled'}>Next &#8594;</button>
        </div>

        <div class="pp-readings" id="pp-readings">
          ${hasStreams
            ? _renderGrouped(grouped)
            : _renderFlat(dayReadings)}
        </div>

        ${isComplete
          ? `<p class="pp-complete">✓ All readings done for day ${dayIdx + 1}!</p>`
          : `<button class="pp-btn-all" id="pp-mark-all">
               Mark all done (${doneCount}/${dayReadings.length})
             </button>`
        }
        <button class="pp-btn-reset" id="pp-reset-plan">Reset progress for this plan</button>
      </section>

      <!-- ── Bible progress heatmap ──────────────────── -->
      <section class="pp-section">
        <div class="pp-section__hd">
          <span class="pp-section__title">Bible Progress</span>
          <span class="pp-section__badge">${_totalPct()}% read</span>
        </div>
        <div class="pp-heatmap" id="pp-heatmap" role="list" aria-label="Reading progress by book">
          ${BOOKS.map(book => {
            const pct     = _bookPct(book);
            const opacity = pct === 0 ? 0.07 : (0.18 + pct * 0.82);
            const visited = Math.round(pct * book.chapters);
            return `<button class="pp-cell${pct >= 1 ? ' pp-cell--done' : ''}"
                             data-book="${book.osis}"
                             title="${book.name}: ${visited}/${book.chapters} chapters"
                             style="--cell-op:${opacity.toFixed(2)}"
                             role="listitem"
                             aria-label="${book.name} ${Math.round(pct * 100)}% read">
              <span class="pp-cell__abbr">${book.abbr}</span>
            </button>`;
          }).join('')}
        </div>
        <p class="pp-heatmap-legend">
          <span class="pp-legend-swatch pp-legend-swatch--unread"></span>Unread
          <span class="pp-legend-swatch pp-legend-swatch--partial"></span>Partial
          <span class="pp-legend-swatch pp-legend-swatch--done"></span>Complete
        </p>
      </section>

    </div>`;

  _wireClicks(dayIdx, dayReadings);
}

function _renderFlat(readings) {
  return readings.map(r => {
    const done = _progress.visitedChapters.includes(r.osis);
    return `<button class="pp-reading${done ? ' pp-reading--done' : ''}"
                     data-osis="${r.osis}"
                     title="${done ? 'Click to uncheck' : 'Click to navigate'}">
      <span class="pp-reading__check" aria-hidden="true">${done ? '✓' : '○'}</span>
      <span>${r.book.name} ${r.chapter}</span>
      ${done ? '<span class="pp-reading__uncheck" aria-hidden="true">✕</span>' : ''}
    </button>`;
  }).join('');
}

function _renderGrouped(grouped) {
  return Object.entries(grouped).map(([stream, readings]) => `
    <div class="pp-stream">
      <span class="pp-stream__label">${stream}</span>
      ${readings.map(r => {
        const done = _progress.visitedChapters.includes(r.osis);
        return `<button class="pp-reading${done ? ' pp-reading--done' : ''}"
                         data-osis="${r.osis}"
                         title="${done ? 'Click to uncheck' : 'Click to navigate'}">
          <span class="pp-reading__check" aria-hidden="true">${done ? '✓' : '○'}</span>
          <span>${r.book.name} ${r.chapter}</span>
          ${done ? '<span class="pp-reading__uncheck" aria-hidden="true">✕</span>' : ''}
        </button>`;
      }).join('')}
    </div>`).join('');
}

function _groupByStream(readings) {
  const groups = {};
  for (const r of readings) {
    const key = r.stream || 'Reading';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────
// Event wiring
// ─────────────────────────────────────────────────────────────
function _wireClicks(dayIdx, dayReadings) {
  // Plan selector
  _container.querySelector('#pp-plan-select')?.addEventListener('change', async e => {
    _activePlanId = e.target.value;
    localStorage.setItem('berean_plan', _activePlanId);
    _progress   = await _loadProgress(_activePlanId);
    _viewDayIdx = _todayIndex();
    _render();
  });

  // Day navigation
  _container.querySelector('#pp-prev-day')?.addEventListener('click', () => {
    if (_viewDayIdx > 0) { _viewDayIdx--; _render(); }
  });
  _container.querySelector('#pp-next-day')?.addEventListener('click', () => {
    if (_viewDayIdx < _planDef().days - 1) { _viewDayIdx++; _render(); }
  });
  _container.querySelector('#pp-goto-today')?.addEventListener('click', () => {
    _viewDayIdx = _todayIndex();
    _render();
  });

  // Chapter buttons: click done → uncheck, click undone → navigate
  _container.querySelector('#pp-readings')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-osis]');
    if (!btn) return;
    const osis = btn.dataset.osis;
    const [book, ch] = osis.split('.');
    const isDone = _progress.visitedChapters.includes(osis);

    if (isDone) {
      _progress.visitedChapters = _progress.visitedChapters.filter(k => k !== osis);
      _progress.completedDays   = _progress.completedDays.filter(d => d !== dayIdx);
      await _saveProgress(_progress);
      _render();
    } else {
      navigateTo({ book, chapter: parseInt(ch) });
    }
  });

  // Mark all done
  _container.querySelector('#pp-mark-all')?.addEventListener('click', async () => {
    for (const r of dayReadings) {
      if (!_progress.visitedChapters.includes(r.osis)) {
        _progress.visitedChapters.push(r.osis);
      }
    }
    if (!_progress.completedDays.includes(dayIdx)) {
      _progress.completedDays.push(dayIdx);
    }
    await _saveProgress(_progress);
    _render();
  });

  // Reset
  _container.querySelector('#pp-reset-plan')?.addEventListener('click', async () => {
    const def = _planDef();
    if (!confirm(`Reset all progress for "${def.name}"? This clears every checked chapter for this plan.`)) return;
    _progress.startDate       = Date.now();
    _progress.completedDays   = [];
    _progress.visitedChapters = [];
    _viewDayIdx = 0;
    await _saveProgress(_progress);
    _render();
  });

  // Heatmap clicks → navigate to book
  _container.querySelector('#pp-heatmap')?.addEventListener('click', e => {
    const cell = e.target.closest('[data-book]');
    if (!cell) return;
    navigateTo({ book: cell.dataset.book, chapter: 1 });
  });
}
