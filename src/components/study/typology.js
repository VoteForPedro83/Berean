/* ============================================================
   typology.js — Typology panel (Stage 3)
   OT type → NT antitype card pairs, sourced from data/typology.json
   Burgundy accent (--color-accent-burgundy) throughout.
   ============================================================ */

import { bus, EVENTS } from '../../state/eventbus.js';
import { navigateTo } from '../../router.js';

// NT books (OSIS IDs) — used to determine verse testament
const NT_BOOKS = new Set([
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL',
  '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
]);

const CATEGORY_LABELS = {
  person:      'Person',
  event:       'Event',
  object:      'Object',
  institution: 'Institution',
};

let _container = null;
let _pairs     = null;      // cached typology.json data
let _activeOsis = null;

export async function initTypology(containerEl) {
  _container = containerEl;
  _renderLoading();

  // Fetch typology data once
  try {
    const r = await fetch('/data/typology.json');
    if (r.ok) {
      const json = await r.json();
      _pairs = json.pairs || [];
    }
  } catch {
    _pairs = [];
  }

  _renderBrowse();

  // Filter when a chapter loads (book-level match — e.g. navigating to John 1)
  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    // Use the first verse of the chapter as the context reference
    const osisId = `${book}.${chapter}.1`;
    _activeOsis = osisId;
    _renderForVerse(osisId);
  });

  // Narrow further when a specific verse is selected
  bus.on(EVENTS.VERSE_SELECT, ({ osisId }) => {
    if (!osisId) return;
    _activeOsis = osisId;
    _renderForVerse(osisId);
  });
}

// ── Views ─────────────────────────────────────────────────────

function _renderLoading() {
  if (!_container) return;
  _container.innerHTML = `<div class="typ-loading">
    <div class="typ-sk-line wide"></div>
    <div class="typ-sk-line narrow"></div>
    <div class="typ-sk-line wide"></div>
  </div>`;
}

/** Show all pairs in a browsable list. */
function _renderBrowse() {
  if (!_container) return;
  if (!_pairs) { _renderLoading(); return; }

  _container.innerHTML = `
    <div class="typ-panel">
      <div class="typ-intro">
        <p class="typ-intro__text">Biblical types — OT persons, events, and institutions that foreshadow Christ and his work.</p>
      </div>
      <div class="typ-list">
        ${_pairs.map(p => _pairCard(p)).join('')}
      </div>
    </div>`;

  _wireCardClicks(_container);
}

/** Filter pairs by the selected verse. */
function _renderForVerse(osisId) {
  if (!_container || !_pairs) return;

  const book = osisId.split('.')[0];
  const isNT = NT_BOOKS.has(book);

  // Find pairs where the verse ref is in ot_refs (if OT book selected)
  // or nt_refs (if NT book selected)
  const matching = _pairs.filter(p => {
    if (isNT) return p.nt_refs.some(r => _refMatches(r, osisId));
    else      return p.ot_refs.some(r => _refMatches(r, osisId));
  });

  const [bk, ch, v] = osisId.split('.');
  const label = `${bk} ${ch}${v ? ':' + v : ''}`;

  if (!matching.length) {
    // No direct match — show full browse with a subtle note
    _container.innerHTML = `
      <div class="typ-panel">
        <div class="typ-intro">
          <p class="typ-intro__text">No typological connections found for <strong>${label}</strong>. Showing all types.</p>
        </div>
        <div class="typ-list">
          ${_pairs.map(p => _pairCard(p)).join('')}
        </div>
      </div>`;
  } else {
    _container.innerHTML = `
      <div class="typ-panel">
        <p class="typ-section-label">Types connected to ${label} <span class="typ-count">${matching.length}</span></p>
        <div class="typ-list">
          ${matching.map(p => _pairCard(p, isNT ? 'nt' : 'ot')).join('')}
        </div>
        <details class="typ-browse-more">
          <summary class="typ-browse-more__summary">Browse all types</summary>
          <div class="typ-list">
            ${_pairs.filter(p => !matching.includes(p)).map(p => _pairCard(p)).join('')}
          </div>
        </details>
      </div>`;
  }

  _wireCardClicks(_container);
}

// ── Card rendering ────────────────────────────────────────────

function _pairCard(pair, highlightSide = null) {
  const catLabel = CATEGORY_LABELS[pair.category] || pair.category;

  return `
    <article class="typ-card" data-pair-id="${pair.id}">
      <header class="typ-card__header">
        <span class="typ-card__category">${catLabel}</span>
      </header>
      <div class="typ-card__body">
        <!-- OT side -->
        <div class="typ-card__side typ-card__side--ot${highlightSide === 'ot' ? ' typ-card__side--active' : ''}">
          <p class="typ-card__side-tag">Type (OT)</p>
          <p class="typ-card__side-label">${_esc(pair.ot_label)}</p>
          <p class="typ-card__side-desc">${_esc(pair.ot_desc)}</p>
          <div class="typ-card__refs">
            ${pair.ot_refs.map(r => `<button class="typ-ref-btn" data-osis="${r}" type="button">${_formatRef(r)}</button>`).join('')}
          </div>
        </div>

        <div class="typ-card__arrow" aria-hidden="true">→</div>

        <!-- NT side -->
        <div class="typ-card__side typ-card__side--nt${highlightSide === 'nt' ? ' typ-card__side--active' : ''}">
          <p class="typ-card__side-tag">Antitype (NT)</p>
          <p class="typ-card__side-label">${_esc(pair.nt_label)}</p>
          <p class="typ-card__side-desc">${_esc(pair.nt_desc)}</p>
          <div class="typ-card__refs">
            ${pair.nt_refs.map(r => `<button class="typ-ref-btn" data-osis="${r}" type="button">${_formatRef(r)}</button>`).join('')}
          </div>
        </div>
      </div>

      <details class="typ-card__note-details">
        <summary class="typ-card__note-summary">Theological note</summary>
        <p class="typ-card__note-text">${_esc(pair.note)}</p>
      </details>
    </article>`;
}

function _wireCardClicks(root) {
  root.querySelectorAll('.typ-ref-btn[data-osis]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const osis = btn.dataset.osis;
      if (!osis) return;
      // Strip verse range suffix (e.g. GEN.22.1-8 → GEN.22.1)
      const [book, ch, v] = osis.split('.');
      const cleanV = v ? v.split('-')[0] : null;
      navigateTo({ book, chapter: parseInt(ch, 10), verse: cleanV ? parseInt(cleanV, 10) : 1 });
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Check whether a typology ref (e.g. "GEN.22.1" or "GEN.22.1-8")
 * matches a selected OSIS verse ID (e.g. "GEN.22.3").
 */
function _refMatches(ref, osisId) {
  // Simple chapter-level match: same book + chapter
  const [refBook, refCh] = ref.split('.');
  const [osisBook, osisCh] = osisId.split('.');
  return refBook === osisBook && refCh === osisCh;
}

/** Format OSIS ref for display: "GEN.22.1" → "Gen 22:1" */
function _formatRef(ref) {
  const SHORT = {
    GEN:'Gen',EXO:'Exo',LEV:'Lev',NUM:'Num',DEU:'Deu',JOS:'Jos',JDG:'Jdg',RUT:'Rut',
    '1SA':'1Sa','2SA':'2Sa','1KI':'1Ki','2KI':'2Ki','1CH':'1Ch','2CH':'2Ch',
    EZR:'Ezr',NEH:'Neh',EST:'Est',JOB:'Job',PSA:'Psa',PRO:'Pro',ECC:'Ecc',SNG:'Sng',
    ISA:'Isa',JER:'Jer',LAM:'Lam',EZK:'Ezk',DAN:'Dan',HOS:'Hos',JOL:'Jol',AMO:'Amo',
    OBA:'Oba',JON:'Jon',MIC:'Mic',NAH:'Nah',HAB:'Hab',ZEP:'Zep',HAG:'Hag',ZEC:'Zec',MAL:'Mal',
    MAT:'Mat',MRK:'Mrk',LUK:'Luk',JHN:'Jhn',ACT:'Act',ROM:'Rom',
    '1CO':'1Co','2CO':'2Co',GAL:'Gal',EPH:'Eph',PHP:'Php',COL:'Col',
    '1TH':'1Th','2TH':'2Th','1TI':'1Ti','2TI':'2Ti',TIT:'Tit',PHM:'Phm',
    HEB:'Heb',JAS:'Jas','1PE':'1Pe','2PE':'2Pe','1JN':'1Jn','2JN':'2Jn','3JN':'3Jn',JUD:'Jud',REV:'Rev',
  };
  const parts = ref.split('.');
  const book  = SHORT[parts[0]] || parts[0];
  if (parts.length === 1) return book;
  if (parts.length === 2) return `${book} ${parts[1]}`;
  // parts[2] might be "1-8"
  const v = parts[2].replace('-', '–');
  return `${book} ${parts[1]}:${v}`;
}

function _esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
