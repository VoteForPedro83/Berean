/* ============================================================
   commentaries.js — Commentary accordion panel (Stage 3)
   Listens for CHAPTER_LOADED, renders all available sources
   in stacked accordion sections with scroll-sync.
   ============================================================ */

import { bus, EVENTS }         from '../../state/eventbus.js';
import { getCommentaries }     from '../../db/commentaries.js';
import { streamAiResponse }    from '../../ai/stream.js';
import { commentarySummaryPrompt } from '../../ai/prompts.js';
import { TRANSLATION_LICENCES }    from '../../ai/context.js';
import { state }               from '../../state/study-mode.js';
import { getBook }             from '../../data/books.js';

// Full display names for known abbreviations
const SOURCE_LABELS = {
  CALVIN:   { name: 'Calvin\'s Commentaries', short: 'Calvin' },
  GENEVA:   { name: 'Geneva Bible Notes', short: 'Geneva' },
  TRAPP:    { name: 'Trapp\'s Commentary', short: 'Trapp' },
  POOLE:    { name: 'Matthew Poole\'s Commentary', short: 'Poole' },
  ALFORD:   { name: 'Alford\'s Greek Testament', short: 'Alford' },
  MHCC:     { name: 'Matthew Henry Concise', short: 'MH Concise' },
  MHC:      { name: 'Matthew Henry Complete', short: 'MHC' },
  JFB:      { name: 'Jamieson, Fausset & Brown', short: 'JFB' },
  BARNES:   { name: "Barnes' Notes", short: 'Barnes' },
  RYLE:     { name: "Ryle's Expository Thoughts", short: 'Ryle' },
  SPURG:    { name: 'Spurgeon\'s Commentary', short: 'Spurgeon' },
  SPURGEON: { name: 'Spurgeon\'s Commentary', short: 'Spurgeon' },
  LUTHER:   { name: 'Luther\'s Commentary', short: 'Luther' },
  EDWARDS:  { name: 'Jonathan Edwards', short: 'Edwards' },
  PINK:     { name: 'A.W. Pink\'s Commentary', short: 'Pink' },
  OWEN:     { name: 'John Owen\'s Commentary', short: 'Owen' },
  CAMB:     { name: 'Cambridge Bible Commentary', short: 'Cambridge' },
  MACL:     { name: 'MacLaren\'s Expositions', short: 'MacLaren' },
  MACK:     { name: 'MacKnight\'s Epistles', short: 'MacKnight' },
  CLARKE:   { name: 'Adam Clarke\'s Commentary', short: 'Clarke' },
  TSK:      { name: 'Treasury of Scripture Knowledge', short: 'TSK' },
};

// Preferred display order (Reformed-first), others appended alphabetically
const PREFERRED_ORDER = [
  'CALVIN', 'GENEVA', 'TRAPP', 'POOLE',
  'ALFORD', 'MHCC', 'MHC', 'JFB', 'BARNES',
  'RYLE', 'SPURG', 'SPURGEON', 'LUTHER',
  'EDWARDS', 'PINK', 'OWEN', 'CAMB', 'MACL', 'MACK', 'CLARKE', 'TSK',
];

let _container  = null;   // .commentary-panel element
let _current    = null;   // { book, chapter }
let _observer   = null;   // IntersectionObserver for active verse highlight
let _pauseTimer = null;   // setTimeout handle for scroll-sync pause

export function initCommentaries(containerEl) {
  _container = containerEl;
  _render({ loading: true });

  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    _current = { book, chapter };
    _loadChapter(book, chapter);
  });

  // When a verse is selected, scroll commentary to that verse
  bus.on(EVENTS.VERSE_SELECT, ({ verse }) => {
    if (_current) _scrollToVerse(verse);
  });
}

// ── Load & render ─────────────────────────────────────────────

async function _loadChapter(book, chapter) {
  _render({ loading: true });

  const rows = await getCommentaries(book, chapter);

  if (!rows.length) {
    _render({ empty: true });
    return;
  }

  // Group by source_abbr
  const bySource = {};
  for (const row of rows) {
    if (!bySource[row.source_abbr]) bySource[row.source_abbr] = [];
    bySource[row.source_abbr].push(row);
  }

  _render({ sources: bySource });
  _setupScrollSync();
  _wireAiButtons(bySource);
}

// ── AI Summarise ──────────────────────────────────────────────

function _wireAiButtons(bySource) {
  if (!_container) return;

  _container.addEventListener('click', e => {
    const btn = e.target.closest('.comm-ai-btn');
    if (!btn) return;
    e.stopPropagation();   // Don't toggle <details>

    const abbr     = btn.dataset.source;
    const entries  = bySource[abbr];
    const outputEl = document.getElementById(`comm-ai-${abbr}`);
    if (!outputEl || !entries) return;

    // If already has content, toggle it
    if (!outputEl.hidden && outputEl.dataset.loaded === '1') {
      outputEl.hidden = true;
      btn.textContent = '✦ Summarise';
      return;
    }

    btn.textContent   = '✦ Summarising…';
    btn.disabled      = true;
    outputEl.hidden   = false;
    outputEl.innerHTML = '<p class="comm-ai-loading">Generating AI summary…<span class="ai-cursor">▋</span></p>';

    // Build plain-text excerpt from all entries (public domain — always permitted)
    const excerpt = entries.slice(0, 8).map(e => {
      const ref = e.verse_start === e.verse_end
        ? `v.${e.verse_start}` : `vv.${e.verse_start}–${e.verse_end}`;
      // Strip HTML tags from commentary content
      const text = e.html_content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return `[${ref}] ${text}`;
    }).join('\n\n');

    const meta = getBook(state.book);
    const passage = {
      humanRef:   `${meta?.name ?? state.book} ${state.chapter}`,
      osisId:     `${state.book}.${state.chapter}.1`,
      verseCount: 1,
      textWeb:    '',
      isNT:       meta?.testament === 'NT',
      isOT:       meta?.testament === 'OT',
    };

    const label = (SOURCE_LABELS[abbr] || { name: abbr }).name;
    const prompt = commentarySummaryPrompt(passage, TRANSLATION_LICENCES.WEB, excerpt, label);

    let full = '';
    streamAiResponse(prompt.user, prompt.system, {
      provider: 'gemini',
      onChunk: chunk => {
        full += chunk;
        outputEl.innerHTML = `<div class="comm-ai-result">${_mdToHtml(full)}<span class="ai-cursor">▋</span></div>`;
      },
      onDone: text => {
        outputEl.innerHTML     = `<div class="comm-ai-result">${_mdToHtml(text)}</div>`;
        outputEl.dataset.loaded = '1';
        btn.textContent = '✦ Hide summary';
        btn.disabled    = false;
      },
      onError: err => {
        outputEl.innerHTML = `<p class="comm-ai-error">AI error: ${_esc(err.message)}</p>`;
        btn.textContent    = '✦ Summarise';
        btn.disabled       = false;
      },
    });
  }, { once: false });
}

function _mdToHtml(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>')
    .replace(/(⚠️[^\n]+)/g,    '<span class="comm-ai-disclaimer">$1</span>')
    .replace(/\n\n+/g, '<br><br>')
    .replace(/\n/g,    '<br>');
}

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── DOM ───────────────────────────────────────────────────────

function _render(state) {
  if (!_container) return;

  if (state.loading) {
    _container.innerHTML = `<div class="comm-loading">
      <div class="comm-skeleton"><div class="comm-sk-line wide"></div><div class="comm-sk-line narrow"></div><div class="comm-sk-line wide"></div></div>
      <div class="comm-skeleton"><div class="comm-sk-line wide"></div><div class="comm-sk-line narrow"></div></div>
    </div>`;
    return;
  }

  if (state.empty) {
    _container.innerHTML = `<div class="comm-empty">
      <p class="comm-empty__title">No commentary data</p>
      <p class="comm-empty__body">Commentary database is empty. Run <code>node scripts/build-commentaries.js</code> to populate it.</p>
    </div>`;
    return;
  }

  const { sources } = state;
  // Build ordered source list: preferred order first, then any unknown sources alphabetically
  const sourceOrder = [
    ...PREFERRED_ORDER.filter(s => sources[s]),
    ...Object.keys(sources).filter(s => !PREFERRED_ORDER.includes(s)).sort(),
  ];

  const html = sourceOrder.map((abbr, idx) => {
    const entries = sources[abbr];
    const label   = SOURCE_LABELS[abbr] || { name: abbr, short: abbr };
    const isOpen  = idx === 0; // first source open by default

    const entriesHtml = entries.map(e => {
      const verseLabel = e.verse_start === e.verse_end
        ? `v.${e.verse_start}`
        : `vv.${e.verse_start}–${e.verse_end}`;
      return `<div class="comm-entry" data-verse="${e.verse_start}" data-verse-end="${e.verse_end}">
        <span class="comm-entry__ref">${verseLabel}</span>
        <div class="comm-entry__text">${e.html_content}</div>
      </div>`;
    }).join('');

    return `<details class="comm-source" ${isOpen ? 'open' : ''} data-source="${abbr}">
      <summary class="comm-source__header">
        <span class="comm-source__name">${label.name}</span>
        <span class="comm-source__count">${entries.length} entries</span>
        <button class="comm-ai-btn" data-source="${abbr}" title="AI summary of this commentary"
                aria-label="AI summary of ${label.name}">✦ Summarise</button>
      </summary>
      <div class="comm-ai-output" id="comm-ai-${abbr}" hidden></div>
      <div class="comm-source__body">${entriesHtml}</div>
    </details>`;
  }).join('');

  _container.innerHTML = html || `<div class="comm-empty"><p class="comm-empty__title">No commentary data</p></div>`;
}

// ── Scroll sync ───────────────────────────────────────────────
// Highlights commentary entries as the user scrolls the Bible pane.
// Pauses for 5 seconds if user manually scrolls the commentary pane.

function _setupScrollSync() {
  if (_observer) { _observer.disconnect(); _observer = null; }

  // Pause sync if user scrolls the commentary pane manually
  _container.addEventListener('scroll', _onCommentaryScroll, { passive: true });
}

function _onCommentaryScroll() {
  clearTimeout(_pauseTimer);
  _pauseTimer = setTimeout(() => { /* resume sync */ }, 5000);
}

function _scrollToVerse(verse) {
  if (!_container) return;
  // Don't scroll if user manually scrolled recently
  if (_pauseTimer) {
    clearTimeout(_pauseTimer);
    _pauseTimer = setTimeout(() => { _pauseTimer = null; }, 5000);
    return;
  }

  // Find the entry nearest to this verse in the open source
  const openSource = _container.querySelector('details[open]');
  if (!openSource) return;

  const entries = openSource.querySelectorAll('.comm-entry');
  let best = null;
  let bestDist = Infinity;

  for (const entry of entries) {
    const vs  = parseInt(entry.dataset.verse, 10);
    const ve  = parseInt(entry.dataset.verseEnd, 10);
    const dist = verse >= vs && verse <= ve ? 0 : Math.min(Math.abs(verse - vs), Math.abs(verse - ve));
    if (dist < bestDist) { bestDist = dist; best = entry; }
  }

  if (best) {
    // Remove previous highlight
    _container.querySelectorAll('.comm-entry--active').forEach(el => el.classList.remove('comm-entry--active'));
    best.classList.add('comm-entry--active');
    best.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
