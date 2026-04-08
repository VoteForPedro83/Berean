/* ============================================================
   crossrefs.js — Cross-reference panel (Stage 3)
   Shows top cross-references + NT-OT quotes for active verse.
   Chain navigation: follow A→B→C with breadcrumb trail.
   ============================================================ */

import { bus, EVENTS }    from '../../state/eventbus.js';
import { getCrossRefs, getNtOtQuotes } from '../../db/crossrefs.js';
import { navigateTo }     from '../../router.js';

// Short OSIS → display name
const BOOK_NAMES = {
  GEN:'Genesis',EXO:'Exodus',LEV:'Leviticus',NUM:'Numbers',DEU:'Deuteronomy',
  JOS:'Joshua',JDG:'Judges',RUT:'Ruth','1SA':'1 Samuel','2SA':'2 Samuel',
  '1KI':'1 Kings','2KI':'2 Kings','1CH':'1 Chronicles','2CH':'2 Chronicles',
  EZR:'Ezra',NEH:'Nehemiah',EST:'Esther',JOB:'Job',PSA:'Psalms',PRO:'Proverbs',
  ECC:'Ecclesiastes',SNG:'Song of Solomon',ISA:'Isaiah',JER:'Jeremiah',
  LAM:'Lamentations',EZK:'Ezekiel',DAN:'Daniel',HOS:'Hosea',JOL:'Joel',
  AMO:'Amos',OBA:'Obadiah',JON:'Jonah',MIC:'Micah',NAH:'Nahum',HAB:'Habakkuk',
  ZEP:'Zephaniah',HAG:'Haggai',ZEC:'Zechariah',MAL:'Malachi',
  MAT:'Matthew',MRK:'Mark',LUK:'Luke',JHN:'John',ACT:'Acts',
  ROM:'Romans','1CO':'1 Corinthians','2CO':'2 Corinthians',GAL:'Galatians',
  EPH:'Ephesians',PHP:'Philippians',COL:'Colossians','1TH':'1 Thessalonians',
  '2TH':'2 Thessalonians','1TI':'1 Timothy','2TI':'2 Timothy',TIT:'Titus',
  PHM:'Philemon',HEB:'Hebrews',JAS:'James','1PE':'1 Peter','2PE':'2 Peter',
  '1JN':'1 John','2JN':'2 John','3JN':'3 John',JUD:'Jude',REV:'Revelation',
};

/** Strip range suffixes so "JHN.1.1-John" or "GEN.1.1-8" → "JHN.1.1" / "GEN.1.1" */
function _sanitizeOsis(osis) {
  if (!osis) return osis;
  const parts = osis.split('.');
  if (parts.length < 3) return osis;
  // Keep only the numeric start of the verse part (strip "-end" or "-Book" suffixes)
  const verseStart = parts[2].split('-')[0];
  return `${parts[0]}.${parts[1]}.${verseStart}`;
}

function osisLabel(osis) {
  const clean = _sanitizeOsis(osis);
  const [book, ch, v] = clean.split('.');
  const name = BOOK_NAMES[book] || book;
  return v ? `${name} ${ch}:${v}` : ch ? `${name} ${ch}` : name;
}

let _container   = null;
let _activeVerse = null;

// ── Chain state ───────────────────────────────────────────────
// _chain holds the breadcrumb trail: [{osisId, label}]
// When chain mode is active, _chain.length > 0.
let _chain = [];

export function initCrossRefs(containerEl) {
  _container = containerEl;
  _render({ empty: true, emptyMsg: 'Select a verse to see cross-references.' });

  bus.on(EVENTS.VERSE_SELECT, ({ osisId }) => {
    if (!osisId) return;
    // A new verse selection resets the chain
    _chain = [];
    _activeVerse = osisId;
    _loadVerse(osisId);
  });
}

// ── Load & render ─────────────────────────────────────────────

async function _loadVerse(osisId) {
  _render({ loading: true });

  const [xrefs, quotes] = await Promise.all([
    getCrossRefs(osisId, 15),
    getNtOtQuotes(osisId),
  ]);

  // Fetch verse text for the selected verse + all referenced verses
  // Sanitize OSIS IDs to strip malformed range suffixes (e.g. "JHN.1.1-John" → "JHN.1.1")
  const allOsisIds = [
    osisId,
    ...xrefs.map(r => _sanitizeOsis(r.target_osis)),
    ...quotes.asNt.map(r => _sanitizeOsis(r.ot_osis)),
    ...quotes.asOt.map(r => _sanitizeOsis(r.nt_osis)),
  ];

  let verseMap = {};
  try {
    verseMap = await _fetchVersePreviews(allOsisIds);
  } catch { /* previews optional */ }

  _render({ osisId, xrefs, quotes, verseMap });
}

/** Fetch verse text for a list of OSIS IDs using the bible db. */
async function _fetchVersePreviews(osisIds) {
  const map = {};
  try {
    const { getVerseBatch } = await import('../../db/bible.js');
    const rows = await getVerseBatch(osisIds);
    for (const row of rows) map[row.osis_id] = row.text_web;
  } catch {
    // getVerseBatch not exported — silently skip previews
  }
  return map;
}

// ── DOM ───────────────────────────────────────────────────────

function _render(state) {
  if (!_container) return;

  if (state.loading) {
    _container.innerHTML = `<div class="xr-loading">
      <div class="xr-skeleton"><div class="xr-sk-line wide"></div><div class="xr-sk-line narrow"></div></div>
      <div class="xr-skeleton"><div class="xr-sk-line wide"></div><div class="xr-sk-line narrow"></div></div>
      <div class="xr-skeleton"><div class="xr-sk-line wide"></div></div>
    </div>`;
    return;
  }

  if (state.empty) {
    _container.innerHTML = `<div class="xr-empty"><p class="xr-empty__msg">${state.emptyMsg || 'No cross-references found.'}</p></div>`;
    return;
  }

  const { osisId, xrefs, quotes, verseMap } = state;
  const label = osisLabel(osisId);

  // ── Breadcrumb bar (shown when chain depth > 0) ──
  const crumbHtml = _chain.length
    ? `<div class="xr-chain-bar">
        ${_chain.map((c, i) =>
          `<button class="xr-crumb" data-crumb-idx="${i}" type="button">${c.label}</button>
           <span class="xr-crumb-sep" aria-hidden="true">→</span>`
        ).join('')}
        <span class="xr-crumb xr-crumb--current">${label}</span>
        <button class="xr-chain-exit" type="button" title="Exit chain">✕</button>
      </div>`
    : '';

  const verseText = verseMap[osisId] || '';

  let html = `<div class="xr-panel">
    <div class="xr-header">
      <span class="xr-header__ref">${label}</span>
      ${!_chain.length ? `<span class="xr-header__hint">Click → to follow a chain</span>` : ''}
    </div>
    ${verseText ? `<p class="xr-verse-text">${_esc(verseText)}</p>` : ''}
    ${crumbHtml}`;

  // ── NT-OT quotations ──
  const hasNtOt = quotes.asNt.length > 0 || quotes.asOt.length > 0;
  if (hasNtOt) {
    html += `<details class="xr-section" open>
      <summary class="xr-section__title">NT–OT Connections</summary>
      <div class="xr-section__body">`;

    for (const q of quotes.asNt) {
      const cleanOsis = _sanitizeOsis(q.ot_osis);
      const refLabel  = osisLabel(cleanOsis);
      const preview   = verseMap[cleanOsis] || '';
      const relTag    = _relTag(q.relationship);
      html += _xrItem(cleanOsis, refLabel, preview, relTag, 'ot', false);
    }
    for (const q of quotes.asOt) {
      const cleanOsis = _sanitizeOsis(q.nt_osis);
      const refLabel  = osisLabel(cleanOsis);
      const preview   = verseMap[cleanOsis] || '';
      const relTag    = _relTag(q.relationship) + ' (NT)';
      html += _xrItem(cleanOsis, refLabel, preview, relTag, 'nt', false);
    }

    html += `</div></details>`;
  }

  // ── Standard cross-references ──
  if (xrefs.length) {
    html += `<details class="xr-section" ${!hasNtOt ? 'open' : ''}>
      <summary class="xr-section__title">Cross-References <span class="xr-section__count">${xrefs.length}</span></summary>
      <div class="xr-section__body">`;

    for (const xr of xrefs) {
      const cleanOsis = _sanitizeOsis(xr.target_osis);
      const refLabel  = osisLabel(cleanOsis);
      const preview   = verseMap[cleanOsis] || '';
      const votesTag  = xr.votes > 0 ? `${xr.votes}` : '';
      html += _xrItem(cleanOsis, refLabel, preview, votesTag, '', true);
    }

    html += `</div></details>`;
  }

  if (!hasNtOt && !xrefs.length) {
    html += `<div class="xr-empty"><p class="xr-empty__msg">No cross-references found for ${label}.</p></div>`;
  }

  html += `</div>`;
  _container.innerHTML = html;

  // ── Wire verse navigation clicks ──
  _container.querySelectorAll('.xr-item').forEach(el => {
    el.addEventListener('click', e => {
      // Ignore click if it came from the chain-follow button
      if (e.target.closest('.xr-chain-btn')) return;
      const osis = _sanitizeOsis(el.dataset.osis);
      if (!osis) return;
      const [book, ch, v] = osis.split('.');
      navigateTo({ book, chapter: parseInt(ch, 10), verse: v ? parseInt(v, 10) : 1 });
    });
  });

  // ── Wire chain-follow buttons ──
  _container.querySelectorAll('.xr-chain-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const targetOsis = _sanitizeOsis(btn.dataset.chainTarget);
      if (!targetOsis) return;
      // Push current verse onto breadcrumb trail
      _chain.push({ osisId: osisId, label });
      // Load the target verse's cross-refs (without resetting the chain)
      _activeVerse = targetOsis;
      _loadVerse(targetOsis);
    });
  });

  // ── Wire breadcrumb buttons ──
  _container.querySelectorAll('.xr-crumb[data-crumb-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.crumbIdx, 10);
      const crumb = _chain[idx];
      if (!crumb) return;
      // Trim chain back to this point
      _chain = _chain.slice(0, idx);
      _activeVerse = crumb.osisId;
      _loadVerse(crumb.osisId);
    });
  });

  // ── Wire chain exit ──
  _container.querySelector('.xr-chain-exit')?.addEventListener('click', () => {
    // Return to the first verse in the chain (the original starting point)
    const origin = _chain.length > 0 ? _chain[0].osisId : _activeVerse;
    _chain = [];
    _activeVerse = origin;
    if (origin) _loadVerse(origin);
  });
}

function _relTag(rel) {
  if (rel === 'quotation') return 'Quotation';
  if (rel === 'allusion')  return 'Allusion';
  if (rel === 'echo')      return 'Echo';
  return rel || '';
}

/**
 * @param {boolean} showChainBtn - whether to show the → chain-follow button
 */
function _xrItem(osis, refLabel, preview, tag, type, showChainBtn) {
  const bookClass = type === 'ot' ? 'xr-item--ot' : type === 'nt' ? 'xr-item--nt' : '';
  const tagHtml   = tag ? `<span class="xr-item__tag">${tag}</span>` : '';
  const prevHtml  = preview
    ? `<span class="xr-item__preview">${_truncate(preview, 80)}</span>`
    : '';
  const chainBtn  = showChainBtn
    ? `<button class="xr-chain-btn" data-chain-target="${osis}" type="button"
               title="Follow chain from this verse" aria-label="Follow chain from ${refLabel}">→</button>`
    : '';

  return `<div class="xr-item-wrap">
    <button class="xr-item ${bookClass}" data-osis="${osis}" type="button">
      <span class="xr-item__ref">${refLabel}</span>
      ${tagHtml}
      ${prevHtml}
    </button>
    ${chainBtn}
  </div>`;
}

function _esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _truncate(str, max) {
  if (!str) return '';
  const s = str.replace(/<[^>]+>/g, '').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}
