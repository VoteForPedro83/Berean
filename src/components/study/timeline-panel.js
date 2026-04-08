/* ============================================================
   timeline-panel.js — Biblical Timeline (vertical feed)

   Right-panel "Timeline" tab. Shows events, people, and places
   for the current BOOK as a vertical chronological feed.

   Layout:
   ┌──────────────────────────────────┐
   │ Genesis — Timeline         [ⓘ] │  header
   ├──────────────────────────────────┤
   │ ▸ PATRIARCHS IN EGYPT            │  ← sticky era divider
   │                                  │
   │  Ch. 46  · c. 1875 BC    (dimmed)│  ← chapter section
   │    ● Jacob moves to Egypt        │
   │    👤 Jacob · c. 2006–1859 BC    │
   │                                  │
   │  Ch. 47  · c. 1875 BC  ◀ active │  ← active section (full opacity)
   │    ● Joseph rules Egypt          │
   │    👤 Joseph · c. 1915–1805 BC   │
   │    📍 Egypt · Goshen             │
   └──────────────────────────────────┘

   All dates prefixed "c." — Theographic dates are approximate.
   Lifespans > 150 years (antediluvian) shown with // break marker.
   ============================================================ */

import { bus, EVENTS }                from '../../state/eventbus.js';
import { state }                      from '../../state/study-mode.js';
import { getEventsForBook,
         getPeopleForBook,
         getPlacesForBook,
         getFirstVerseForEvent }      from '../../db/narrative.js';
import { navigateTo }                 from '../../router.js';
import { BOOK_MAP }                   from '../../data/books.js';

// ── State ─────────────────────────────────────────────────
let _container  = null;
let _loading    = false;
let _lastBook   = '';
let _activeChapter = 1;

// Fallback periods for non-narrative books (Psalms, Epistles, etc.)
// Used when no events/people are found for the whole book.
const BOOK_FALLBACK = {
  PSA: 'Various periods · primarily United Monarchy (c. 1010–931 BC)',
  PRO: 'United Monarchy · c. 970–931 BC',
  ECC: 'United Monarchy · c. 935 BC',
  SNG: 'United Monarchy · c. 960 BC',
  LAM: 'Late Judah · c. 586 BC',
  ROM: 'Apostolic Age · c. 57 AD',
  '1CO': 'Apostolic Age · c. 54 AD',
  '2CO': 'Apostolic Age · c. 55 AD',
  GAL: 'Apostolic Age · c. 48–55 AD',
  EPH: 'Apostolic Age · c. 60–62 AD',
  PHP: 'Apostolic Age · c. 60–62 AD',
  COL: 'Apostolic Age · c. 60–62 AD',
  '1TH': 'Apostolic Age · c. 51 AD',
  '2TH': 'Apostolic Age · c. 51 AD',
  '1TI': 'Late Apostolic Age · c. 62–65 AD',
  '2TI': 'Late Apostolic Age · c. 67 AD',
  TIT:  'Late Apostolic Age · c. 62–65 AD',
  PHM:  'Apostolic Age · c. 60–62 AD',
  HEB:  'Late Apostolic Age · c. 60–70 AD',
  JAS:  'Apostolic Age · c. 45–49 AD',
  '1PE': 'Late Apostolic Age · c. 62–65 AD',
  '2PE': 'Late Apostolic Age · c. 67 AD',
  '1JN': 'Late Apostolic Age · c. 85–95 AD',
  '2JN': 'Late Apostolic Age · c. 85–95 AD',
  '3JN': 'Late Apostolic Age · c. 85–95 AD',
  JUD:  'Late Apostolic Age · c. 65–80 AD',
  REV:  'Late Apostolic Age · c. 95 AD',
  OBA:  'Divided Kingdom · c. 845–586 BC',
  JOL:  'Divided Kingdom · c. 835–796 BC',
  HAG:  'Persian Period · c. 520 BC',
  ZEC:  'Persian Period · c. 520–480 BC',
  MAL:  'Persian Period · c. 430 BC',
};

// ── Init ──────────────────────────────────────────────────

export function initTimelinePanel(containerEl) {
  _container = containerEl;
  _renderShell();
  _activeChapter = state.chapter;
  _loadForBook(state.book, state.chapter);

  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    _activeChapter = chapter;
    if (book !== _lastBook) {
      // New book — full reload
      _loadForBook(book, chapter);
    } else {
      // Same book, different chapter — just update highlighting
      _updateActiveSection(chapter);
    }
  });
}

function _renderShell() {
  _container.innerHTML = `
    <div class="tp">
      <div class="tp__header">
        <span class="tp__title" id="tp-title">Timeline</span>
        <span class="tp__status" id="tp-status"></span>
        <button class="tp__info-btn" id="tp-info" title="About these dates" aria-label="About chronology">ⓘ</button>
      </div>
      <div class="tp__disclaimer tp__disclaimer--hidden" id="tp-disclaimer">
        Dates reflect a synthesized conservative chronology (Theographic dataset).
        Many ancient dates are scholarly approximations, not absolute certainties.
        All dates are prefixed "c." (circa).
      </div>
      <div class="tp__body" id="tp-body"></div>
    </div>`;

  document.getElementById('tp-info')?.addEventListener('click', () => {
    const d = document.getElementById('tp-disclaimer');
    if (d) d.classList.toggle('tp__disclaimer--hidden');
  });
}

// ── Data loading ──────────────────────────────────────────

async function _loadForBook(book, chapter) {
  if (_loading) return;
  _lastBook = book;
  _loading  = true;

  const bookMeta = BOOK_MAP.get(book);
  const bookName = bookMeta?.name ?? book;
  _setTitle(`${bookName} — Timeline`);
  _setStatus('Loading…');

  try {
    const [events, people, places] = await Promise.all([
      getEventsForBook(book),
      getPeopleForBook(book),
      getPlacesForBook(book),
    ]);

    _setStatus('');

    if (!events.length && !people.length && !places.length) {
      _renderEmpty(book, bookName);
      return;
    }

    _render(events, people, places, chapter);
  } catch (err) {
    console.error('[timeline-panel]', err);
    _setStatus('Failed to load timeline data');
  } finally {
    _loading = false;
  }
}

// ── Rendering ─────────────────────────────────────────────

function _render(events, people, places, activeChapter) {
  const body = document.getElementById('tp-body');
  if (!body) return;

  // ── Group all entities by first_chapter ──────────────────
  const chapterMap = new Map(); // chapter → { events, people, places }

  const _getOrCreate = ch => {
    if (!chapterMap.has(ch)) chapterMap.set(ch, { events: [], people: [], places: [] });
    return chapterMap.get(ch);
  };

  for (const e of events) _getOrCreate(e.first_chapter).events.push(e);
  for (const p of people) _getOrCreate(p.first_chapter).people.push(p);
  for (const pl of places) _getOrCreate(pl.first_chapter).places.push(pl);

  // Sort chapters numerically
  const chapters = [...chapterMap.keys()].sort((a, b) => a - b);

  // ── Build HTML ───────────────────────────────────────────
  const parts = [];
  let lastEra = null;

  for (const ch of chapters) {
    const { events: cEvts, people: cPpl, places: cPls } = chapterMap.get(ch);

    // Compute era for this chapter
    const chYear = _earliestYear(cEvts, cPpl);
    const era    = chYear != null ? _periodForYear(chYear) : null;

    // Era divider when period changes
    if (era && era !== lastEra) {
      lastEra = era;
      const eraYear = chYear != null ? _yearLabel(chYear) : '';
      parts.push(`
        <div class="tp__era-header">
          <span class="tp__era-name">${_esc(era.toUpperCase())}</span>
          ${eraYear ? `<span class="tp__era-year">c. ${_esc(eraYear)}</span>` : ''}
        </div>`);
    }

    const isActive = ch === activeChapter;
    const chYearLabel = chYear != null ? `c. ${_esc(_yearLabel(chYear))}` : '';

    parts.push(`
      <div class="tp__section${isActive ? ' tp__section--active' : ''}" id="tp-ch-${ch}" data-ch="${ch}">
        <div class="tp__section-hd">
          <span class="tp__section-num">Ch. ${ch}</span>
          ${chYearLabel ? `<span class="tp__section-year">${chYearLabel}</span>` : ''}
        </div>
        ${_buildEvents(cEvts)}
        ${_buildPeople(cPpl)}
        ${_buildPlaces(cPls)}
      </div>`);
  }

  body.innerHTML = parts.join('');

  // Wire event click → navigate
  body.querySelectorAll('[data-event-id]').forEach(el => {
    el.addEventListener('click', _onEventClick);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') _onEventClick.call(el, e); });
  });

  // Wire person click → ENTITY_SELECTED
  body.querySelectorAll('[data-person-id]').forEach(el => {
    el.addEventListener('click', () => {
      bus.emit(EVENTS.ENTITY_SELECTED, {
        type: 'person',
        id:   el.dataset.personId,
        name: el.dataset.personName,
        source: 'timeline',
      });
    });
  });

  // Scroll active chapter into view
  requestAnimationFrame(() => {
    const activeEl = document.getElementById(`tp-ch-${activeChapter}`);
    if (activeEl) activeEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function _buildEvents(events) {
  if (!events.length) return '';
  return events.map(e => {
    const y = _parseYear(e.start_date);
    const dateStr = y != null ? `c. ${_esc(_yearLabel(y))}` : '';
    return `
      <div class="tp__event" data-event-id="${_esc(e.id)}" tabindex="0" role="button"
           title="Navigate to this event">
        <span class="tp__event-pip"></span>
        <div class="tp__event-content">
          <span class="tp__event-name">${_esc(e.title)}</span>
          ${dateStr ? `<span class="tp__event-date">${dateStr}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function _buildPeople(people) {
  if (!people.length) return '';
  return people.map(p => {
    return `
      <div class="tp__person" data-person-id="${_esc(p.id)}" data-person-name="${_esc(p.name)}"
           tabindex="0" role="button" title="${_esc(p.name)}">
        <span class="tp__person-accent"></span>
        <div class="tp__person-content">
          <span class="tp__person-name">${_esc(p.name)}</span>
          <span class="tp__person-life">${_lifespanLabel(p)}</span>
        </div>
      </div>`;
  }).join('');
}

function _buildPlaces(places) {
  if (!places.length) return '';
  const tags = places.map(pl =>
    `<span class="tp__place-tag">${_esc(pl.name)}</span>`
  ).join('');
  return `<div class="tp__places-row">${tags}</div>`;
}

function _renderEmpty(book, bookName) {
  const body = document.getElementById('tp-body');
  if (!body) return;
  const fallback = BOOK_FALLBACK[book];
  body.innerHTML = `
    <div class="tp__empty">
      <div class="tp__empty-title">${_esc(bookName)}</div>
      <div class="tp__empty-msg">No narrative event data found for this book.</div>
      ${fallback ? `<div class="tp__empty-period">${_esc(fallback)}</div>` : ''}
      <div class="tp__empty-hint">Narrative data is available for historical, Gospel, and Acts books.</div>
    </div>`;
}

// ── Active chapter update (same book, chapter nav) ────────

function _updateActiveSection(chapter) {
  const body = document.getElementById('tp-body');
  if (!body) return;

  // Remove active class from previous
  body.querySelectorAll('.tp__section--active').forEach(el => {
    el.classList.remove('tp__section--active');
  });

  // Apply to new active chapter if it exists in the feed
  const activeEl = document.getElementById(`tp-ch-${chapter}`);
  if (activeEl) {
    activeEl.classList.add('tp__section--active');
    requestAnimationFrame(() => {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
}

// ── Event click → navigate to first verse ─────────────────

async function _onEventClick(e) {
  e.preventDefault();
  const el      = e.currentTarget ?? this;
  const eventId = el.dataset?.eventId;
  if (!eventId) return;

  const passage = await getFirstVerseForEvent(eventId);
  if (passage) navigateTo(passage);
}

// ── Helpers ───────────────────────────────────────────────

function _setTitle(t) {
  const el = document.getElementById('tp-title');
  if (el) el.textContent = t;
}

function _setStatus(msg) {
  const el = document.getElementById('tp-status');
  if (el) el.textContent = msg;
}

function _parseYear(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function _yearLabel(year) {
  return year < 0 ? `${Math.abs(year)} BC` : `${year} AD`;
}

/** Earliest dated year across a chapter's events + people */
function _earliestYear(events, people) {
  const years = [];
  for (const e of events) {
    const y = _parseYear(e.start_date);
    if (y != null) years.push(y);
  }
  for (const p of people) {
    if (p.birth_year != null) years.push(p.birth_year);
  }
  if (!years.length) return null;
  return Math.min(...years);
}

/**
 * Human-readable lifespan for a person.
 * Antediluvian outliers (> 150 years) shown with // break marker.
 */
function _lifespanLabel(p) {
  const OUTLIER_THRESHOLD = 150;

  if (p.birth_year == null && p.death_year == null) return 'mentioned';

  if (p.birth_year != null && p.death_year != null) {
    const span = p.death_year - p.birth_year;
    if (Math.abs(span) > OUTLIER_THRESHOLD) {
      // Antediluvian outlier — show birth year and exact count
      return `c. ${_yearLabel(p.birth_year)} &nbsp;<span class="tp__life-break">// ${Math.abs(span)} yrs</span>`;
    }
    return `c. ${_yearLabel(p.birth_year)} – ${_yearLabel(p.death_year)}`;
  }

  if (p.birth_year != null) return `b. c. ${_yearLabel(p.birth_year)}`;
  if (p.death_year != null) return `d. c. ${_yearLabel(p.death_year)}`;
  return 'mentioned';
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Biblical period lookup ────────────────────────────────
// (Duplicated from narrative.js so this module is self-contained)
function _periodForYear(year) {
  if (year == null) return null;
  if (year < -2000) return 'Antediluvian / Patriarchs';
  if (year < -1800) return 'Early Patriarchs';
  if (year < -1446) return 'Patriarchs in Egypt';
  if (year < -1406) return 'Exodus & Wilderness';
  if (year < -1050) return 'Conquest & Judges';
  if (year < -931)  return 'United Monarchy';
  if (year < -722)  return 'Divided Kingdom';
  if (year < -586)  return 'Late Judah';
  if (year < -539)  return 'Babylonian Exile';
  if (year < -400)  return 'Persian Period';
  if (year < -332)  return 'Late Persian Period';
  if (year < -63)   return 'Hellenistic Period';
  if (year < 6)     return 'Roman Period (Late BC)';
  if (year < 30)    return 'Life of Christ';
  if (year < 70)    return 'Apostolic Age';
  if (year < 100)   return 'Late Apostolic Age';
  return 'Post-Apostolic';
}
