/* ============================================================
   topical.js — Nave's Topical Bible + Bible dictionary (Stage 3)
   ============================================================ */

import { bus, EVENTS }    from '../../state/eventbus.js';
import { getTopicsForVerse, searchTopics, getTopicVerses, searchDictionary, getDictionaryEntry } from '../../db/topical.js';
import { navigateTo }     from '../../router.js';

const SOURCE_LABELS = {
  easton:    "Easton's Bible Dictionary",
  smith:     "Smith's Bible Dictionary",
  hitchcock: "Hitchcock's Bible Names",
};

let _container   = null;
let _activeOsis  = null;
let _searchTimer = null;

export function initTopical(containerEl) {
  _container = containerEl;
  _renderHome();

  // When a verse is selected show topics for that verse
  bus.on(EVENTS.VERSE_SELECT, ({ osisId }) => {
    if (!osisId) return;
    _activeOsis = osisId;
    _loadVerseTopics(osisId);
  });
}

// ── Home view ─────────────────────────────────────────────────

function _renderHome() {
  _container.innerHTML = `
    <div class="tp-panel">
      <div class="tp-search-bar">
        <input id="tp-search-input" class="tp-search-input" type="search"
               placeholder="Search topics or Bible terms…" autocomplete="off"/>
        <button id="tp-search-btn" class="tp-search-btn" type="button" aria-label="Search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </div>
      <div id="tp-content" class="tp-content">
        <p class="tp-hint">Select a verse to see related topics, or search above.</p>
      </div>
    </div>`;

  const input = _container.querySelector('#tp-search-input');
  const btn   = _container.querySelector('#tp-search-btn');

  input.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => _doSearch(input.value.trim()), 300);
  });
  btn.addEventListener('click', () => _doSearch(input.value.trim()));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') _doSearch(input.value.trim()); });
}

function _contentEl() {
  return _container?.querySelector('#tp-content');
}

// ── Verse topics ──────────────────────────────────────────────

async function _loadVerseTopics(osisId) {
  const el = _contentEl();
  if (!el) return;
  el.innerHTML = `<div class="tp-loading"><div class="tp-sk-line wide"></div><div class="tp-sk-line narrow"></div></div>`;

  const [book, ch, v] = osisId.split('.');
  const label = `${book} ${ch}:${v}`;

  const topics = await getTopicsForVerse(osisId);

  if (!topics.length) {
    el.innerHTML = `<div class="tp-empty">
      <p class="tp-empty__msg">No topics found for <strong>${label}</strong>.</p>
      <p class="tp-empty__hint">Try searching by topic name above.</p>
    </div>`;
    return;
  }

  el.innerHTML = `<div class="tp-verse-topics">
    <p class="tp-section-title">Topics for ${label} <span class="tp-count">${topics.length}</span></p>
    ${topics.map(t => `
      <button class="tp-topic-btn" data-topic-id="${t.topic_id}" type="button">
        <span class="tp-topic-btn__name">${t.topic_name}</span>
        <svg class="tp-topic-btn__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`).join('')}
  </div>`;

  el.querySelectorAll('.tp-topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = parseInt(btn.dataset.topicId, 10);
      const name = btn.querySelector('.tp-topic-btn__name').textContent;
      _openTopic(id, name);
    });
  });
}

// ── Topic detail ──────────────────────────────────────────────

async function _openTopic(topicId, topicName) {
  const el = _contentEl();
  if (!el) return;
  el.innerHTML = `<div class="tp-loading"><div class="tp-sk-line wide"></div><div class="tp-sk-line narrow"></div><div class="tp-sk-line narrow"></div></div>`;

  const verses = await getTopicVerses(topicId);

  const backHtml = `<button class="tp-back-btn" id="tp-back" type="button">← Back</button>`;

  if (!verses.length) {
    el.innerHTML = `${backHtml}<div class="tp-empty"><p class="tp-empty__msg">No verses found for this topic.</p></div>`;
    el.querySelector('#tp-back')?.addEventListener('click', () => {
      if (_activeOsis) _loadVerseTopics(_activeOsis);
      else el.innerHTML = `<p class="tp-hint">Select a verse to see related topics.</p>`;
    });
    return;
  }

  el.innerHTML = `${backHtml}
    <div class="tp-topic-detail">
      <p class="tp-section-title">${topicName} <span class="tp-count">${verses.length} verses</span></p>
      <div class="tp-verse-list">
        ${verses.map(r => {
          const [book, ch, v] = r.osis_id.split('.');
          const BOOK_SHORT = { GEN:'Gen',EXO:'Exo',LEV:'Lev',NUM:'Num',DEU:'Deu',JOS:'Jos',JDG:'Jdg',RUT:'Rut','1SA':'1Sa','2SA':'2Sa','1KI':'1Ki','2KI':'2Ki','1CH':'1Ch','2CH':'2Ch',EZR:'Ezr',NEH:'Neh',EST:'Est',JOB:'Job',PSA:'Psa',PRO:'Pro',ECC:'Ecc',SNG:'Sng',ISA:'Isa',JER:'Jer',LAM:'Lam',EZK:'Ezk',DAN:'Dan',HOS:'Hos',JOL:'Jol',AMO:'Amo',OBA:'Oba',JON:'Jon',MIC:'Mic',NAH:'Nah',HAB:'Hab',ZEP:'Zep',HAG:'Hag',ZEC:'Zec',MAL:'Mal',MAT:'Mat',MRK:'Mrk',LUK:'Luk',JHN:'Jhn',ACT:'Act',ROM:'Rom','1CO':'1Co','2CO':'2Co',GAL:'Gal',EPH:'Eph',PHP:'Php',COL:'Col','1TH':'1Th','2TH':'2Th','1TI':'1Ti','2TI':'2Ti',TIT:'Tit',PHM:'Phm',HEB:'Heb',JAS:'Jas','1PE':'1Pe','2PE':'2Pe','1JN':'1Jn','2JN':'2Jn','3JN':'3Jn',JUD:'Jud',REV:'Rev' };
          const short = BOOK_SHORT[book] || book;
          return `<button class="tp-verse-link" data-osis="${r.osis_id}" type="button">${short} ${ch}:${v}</button>`;
        }).join('')}
      </div>
    </div>`;

  el.querySelector('#tp-back')?.addEventListener('click', () => {
    if (_activeOsis) _loadVerseTopics(_activeOsis);
    else el.innerHTML = `<p class="tp-hint">Select a verse to see related topics.</p>`;
  });

  el.querySelectorAll('.tp-verse-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const [book, ch, v] = btn.dataset.osis.split('.');
      navigateTo({ book, chapter: parseInt(ch, 10), verse: v ? parseInt(v, 10) : 1 });
    });
  });
}

// ── Search ────────────────────────────────────────────────────

async function _doSearch(term) {
  if (!term) {
    const el = _contentEl();
    if (el) el.innerHTML = `<p class="tp-hint">Select a verse to see related topics.</p>`;
    return;
  }

  const el = _contentEl();
  if (!el) return;
  el.innerHTML = `<div class="tp-loading"><div class="tp-sk-line wide"></div><div class="tp-sk-line narrow"></div></div>`;

  const [topics, dictEntries] = await Promise.all([
    searchTopics(term, 15).catch(() => []),
    searchDictionary(term, 8).catch(() => []),
  ]);

  let html = '';

  if (topics.length) {
    html += `<div class="tp-search-section">
      <p class="tp-section-title">Nave's Topics <span class="tp-count">${topics.length}</span></p>
      ${topics.map(t => `
        <button class="tp-topic-btn" data-topic-id="${t.topic_id}" type="button">
          <span class="tp-topic-btn__name">${t.topic_name}</span>
          <svg class="tp-topic-btn__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>`).join('')}
    </div>`;
  }

  if (dictEntries.length) {
    html += `<div class="tp-search-section">
      <p class="tp-section-title">Dictionary</p>
      ${dictEntries.map(e => {
        const source = SOURCE_LABELS[e.source] || e.source;
        return `<details class="tp-dict-entry">
          <summary class="tp-dict-entry__term">${e.term} <span class="tp-dict-source">${source}</span></summary>
          <div class="tp-dict-entry__def">${e.definition_html}</div>
        </details>`;
      }).join('')}
    </div>`;
  }

  if (!topics.length && !dictEntries.length) {
    html = `<div class="tp-empty"><p class="tp-empty__msg">No results for "<strong>${_esc(term)}</strong>".</p></div>`;
  }

  el.innerHTML = html;

  el.querySelectorAll('.tp-topic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = parseInt(btn.dataset.topicId, 10);
      const name = btn.querySelector('.tp-topic-btn__name').textContent;
      _openTopic(id, name);
    });
  });
}

function _esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
