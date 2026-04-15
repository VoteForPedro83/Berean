/* ============================================================
   verse.js — Individual verse renderer + multi-verse selection
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';
import { toast } from '../layout/toast.js';
import { toggleBookmark } from '../../idb/byok.js';
import { navigateTo } from '../../router.js';
import { getBook } from '../../data/books.js';
import { addClipping } from '../../idb/clippings.js';

// ── Multi-verse selection state ──────────────────────────────
let _selectedOsisIds = [];  // ordered array of OSIS IDs
let _anchorOsis      = null; // verse that was clicked first
let _selectionBarEl  = null;

export function clearVerseSelection() {
  _selectedOsisIds = [];
  _anchorOsis      = null;
  _updateSelectionVisuals();
  _hideSelectionBar();
}

export function getSelectedOsisIds() {
  return [..._selectedOsisIds];
}

/**
 * Render a single verse as an HTML string.
 * The parent reading-pane wires up delegation after inserting.
 */
export function renderVerse({ osisId, verse, text, isTarget = false }) {
  return `
    <div class="verse-container${isTarget ? ' verse-container--target' : ''}"
         data-osis="${osisId}" id="v-${osisId}">
      <button class="verse-number" data-action="verse-menu" data-osis="${osisId}"
              aria-label="Verse ${verse} options" title="Click to select verse">
        ${verse}
      </button>
      <span class="verse-text">${escapeHtml(text)}</span>
    </div>`;
}

/** Wire event delegation on the chapter container. */
export function wireVerseEvents(container) {
  if (!container) return;

  // Track touch movement so slow scrolls don't trigger selection
  let _touchMoved = false, _touchStartX = 0, _touchStartY = 0;
  container.addEventListener('touchstart', e => {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
    _touchMoved  = false;
  }, { passive: true });
  container.addEventListener('touchmove', e => {
    if (Math.abs(e.touches[0].clientX - _touchStartX) > 8 ||
        Math.abs(e.touches[0].clientY - _touchStartY) > 8) {
      _touchMoved = true;
    }
  }, { passive: true });

  container.addEventListener('click', async e => {
    // If finger moved (scroll gesture), ignore this synthetic click
    if (_touchMoved) { _touchMoved = false; return; }

    // In interlinear mode verse selection is disabled — only word stacks respond
    if (document.querySelector('#chapter-content .interlinear-row')) return;

    // Ignore clicks inside an open menu or the selection bar itself
    if (e.target.closest('.verse-menu') || e.target.closest('.selection-bar')) return;

    // Verse number button — always the primary trigger
    const btn = e.target.closest('[data-action="verse-menu"]');
    if (btn) {
      _handleVerseClick(btn, btn.dataset.osis);
      return;
    }

    // Verse text or anywhere else inside a verse container — also triggers selection
    const vc = e.target.closest('.verse-container[data-osis]');
    if (vc) {
      _handleVerseClick(vc, vc.dataset.osis);
      return;
    }

    // Click in chapter whitespace — close dropdown, keep selection
    removeMenu();
  });
}

// ── Verse click / selection logic ────────────────────────────

function _handleVerseClick(anchor, osisId) {
  const [book, chStr, vStr] = (osisId || '').split('.');
  const verse   = parseInt(vStr, 10) || 1;
  const chapter = parseInt(chStr, 10) || 1;

  if (_selectedOsisIds.includes(osisId)) {
    // Already selected — toggle off
    _selectedOsisIds = _selectedOsisIds.filter(id => id !== osisId);
    _updateSelectionVisuals();
    if (_selectedOsisIds.length === 0) {
      _anchorOsis = null;
      _hideSelectionBar();
    } else {
      const [b, c] = (_selectedOsisIds[0] || '').split('.');
      _showSelectionBar(b, parseInt(c, 10));
    }
    return;
  }

  // Not yet selected — toggle on
  _selectedOsisIds.push(osisId);
  if (!_anchorOsis) _anchorOsis = osisId;
  bus.emit(EVENTS.VERSE_SELECT, { osisId, book, chapter, verse });
  _updateSelectionVisuals();
  _showSelectionBar(book, chapter);
}

// ── Visual selection highlight ────────────────────────────────

function _updateSelectionVisuals() {
  // Remove all existing highlights
  document.querySelectorAll('.verse-container--selected').forEach(el => {
    el.classList.remove('verse-container--selected');
  });
  // Add highlight to selected verses
  _selectedOsisIds.forEach(osis => {
    document.getElementById(`v-${osis}`)?.classList.add('verse-container--selected');
  });
}

// ── Selection bar ─────────────────────────────────────────────

function _showSelectionBar(book, chapter) {
  const count = _selectedOsisIds.length;
  if (count === 0) return;

  const [, , vStart] = (_selectedOsisIds[0] || '').split('.');
  const barLabel = count === 1 ? `Verse ${vStart}` : `${count} verses`;

  const innerHtml = `
    <span class="selection-bar__label">${_esc(barLabel)}</span>
    <div class="selection-bar__actions">
      <button class="selection-bar__btn" data-sel-action="ask-ai"      title="Send to AI panel">Ask AI</button>
      <button class="selection-bar__btn" data-sel-action="copy"        title="Copy verse text">Copy</button>
      <button class="selection-bar__btn" data-sel-action="bookmark"    title="Bookmark all">Bookmark</button>
      <button class="selection-bar__btn" data-sel-action="clippings"   title="Send to clippings">Clippings</button>
      <button class="selection-bar__btn selection-bar__btn--clear" data-sel-action="clear" title="Clear selection" aria-label="Clear selection">✕</button>
    </div>`;

  // If bar already exists, update its content in-place (no flash)
  if (_selectionBarEl) {
    _selectionBarEl.innerHTML = innerHtml;
    return;
  }

  _selectionBarEl = document.createElement('div');
  _selectionBarEl.className = 'selection-bar';
  _selectionBarEl.setAttribute('role', 'toolbar');
  _selectionBarEl.setAttribute('aria-label', 'Verse selection actions');
  _selectionBarEl.innerHTML = innerHtml;

  // Insert at top of reading scroll area so it doesn't overlap verse text
  const scrollEl = document.getElementById('reading-scroll');
  if (scrollEl) {
    scrollEl.prepend(_selectionBarEl);
  } else {
    document.body.appendChild(_selectionBarEl);
  }

  _selectionBarEl.addEventListener('click', async e => {
    const btn    = e.target.closest('[data-sel-action]');
    if (!btn) return;
    const action = btn.dataset.selAction;

    if (action === 'clear') {
      clearVerseSelection();
    }

    if (action === 'ask-ai') {
      // Emit range event (AI panel will update), then switch to AI tab
      const count2 = _selectedOsisIds.length;
      const [b, c, vs] = (_selectedOsisIds[0] || '').split('.');
      const [, , ve]   = (_selectedOsisIds[count2 - 1] || '').split('.');
      bus.emit(EVENTS.VERSE_RANGE_SELECT, {
        osisIds:    [..._selectedOsisIds],
        book:       b,
        chapter:    parseInt(c, 10),
        verseStart: parseInt(vs, 10),
        verseEnd:   parseInt(ve, 10),
      });
      // Switch to AI tab
      document.getElementById('tab-ai')?.click();
    }

    if (action === 'copy') {
      const texts = _selectedOsisIds
        .map(osis => {
          const el = document.querySelector(`#v-${osis} .verse-text`);
          const [, , v] = osis.split('.');
          return el ? `[${v}] ${el.textContent.trim()}` : '';
        })
        .filter(Boolean)
        .join(' ');
      if (texts) {
        await navigator.clipboard.writeText(texts).catch(() => {});
        toast(`${_selectedOsisIds.length === 1 ? 'Verse' : _selectedOsisIds.length + ' verses'} copied`, 'info');
      }
    }

    if (action === 'bookmark') {
      for (const osis of _selectedOsisIds) {
        await toggleBookmark(osis);
      }
      toast(
        _selectedOsisIds.length === 1
          ? 'Verse bookmarked'
          : `${_selectedOsisIds.length} verses bookmarked`,
        'info'
      );
    }

    if (action === 'clippings') {
      const texts = _selectedOsisIds
        .map(osis => {
          const el = document.querySelector(`#v-${osis} .verse-text`);
          const [, , v] = osis.split('.');
          return el ? `[${v}] ${el.textContent.trim()}` : '';
        })
        .filter(Boolean)
        .join(' ');

      const count2   = _selectedOsisIds.length;
      const [b, c, vs] = (_selectedOsisIds[0] || '').split('.');
      const [, , ve]   = (_selectedOsisIds[count2 - 1] || '').split('.');
      const bookName   = getBook(b)?.name ?? b;
      const reference  = count2 === 1
        ? `${bookName} ${c}:${vs}`
        : `${bookName} ${c}:${vs}–${ve}`;

      await addClipping({
        osisId:    _selectedOsisIds[0],
        osisEnd:   _selectedOsisIds[count2 - 1],
        reference,
        text:      texts,
      });
      bus.emit(EVENTS.CLIPPING_ADDED, { count: count2 });
      toast(`${count2 === 1 ? 'Verse' : count2 + ' verses'} added to clippings`, 'info');
    }
  });
}

function _hideSelectionBar() {
  _selectionBarEl?.remove();
  _selectionBarEl = null;
}

// ── Verse action menu (single verse) ─────────────────────────
let _menuEl = null;

function showVerseMenu(anchor, osisId) {
  removeMenu();

  // Check if this verse has NT-OT quote data (set by reading-pane markNtOtQuotes)
  const container  = anchor.closest('[data-ntot-refs]');
  const ntotRefs   = container?.dataset?.ntotRefs;
  let parsedNtot   = null;
  try { if (ntotRefs) parsedNtot = JSON.parse(ntotRefs); } catch { /* ignore */ }

  _menuEl = document.createElement('div');
  _menuEl.className = 'verse-menu';
  _menuEl.setAttribute('role', 'menu');

  // OT source items — shown at top when available
  const ntotHtml = parsedNtot?.length
    ? parsedNtot.map(r => {
        const [book, ch, v] = r.ot.split('.');
        const label = `${_osisShort(book)} ${ch}${v ? ':' + v : ''}`;
        const relLabel = r.rel === 'quotation' ? 'Quotation' : r.rel === 'allusion' ? 'Allusion' : 'Echo';
        return `<button class="verse-menu__item verse-menu__item--ntot" data-menu-action="nav-ot" data-ot-osis="${r.ot}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          OT ${relLabel}: ${label}
        </button>`;
      }).join('')
    : '';
  const ntotSep = parsedNtot?.length
    ? `<div class="verse-menu__sep"></div>`
    : '';

  _menuEl.innerHTML = `
    ${ntotHtml}${ntotSep}
    <button class="verse-menu__item" data-menu-action="bookmark" data-osis="${osisId}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      Bookmark
    </button>
    <button class="verse-menu__item" data-menu-action="copy" data-osis="${osisId}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy verse
    </button>
    <button class="verse-menu__item" data-menu-action="clippings" data-osis="${osisId}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Send to clippings
    </button>`;

  // Position near the verse number
  const rect = anchor.getBoundingClientRect();
  _menuEl.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:500;`;
  document.body.appendChild(_menuEl);

  _menuEl.addEventListener('click', async e => {
    const btn = e.target.closest('[data-menu-action]');
    if (!btn) return;
    const action = btn.dataset.menuAction;
    const osis   = btn.dataset.osis;

    if (action === 'bookmark') {
      const added = await toggleBookmark(osis);
      toast(added ? 'Verse bookmarked' : 'Bookmark removed', 'info');
      bus.emit(EVENTS.VERSE_BOOKMARK, { osisId: osis, isBookmarked: added });
    }
    if (action === 'copy') {
      const textEl = document.querySelector(`#v-${osis} .verse-text`);
      if (textEl) {
        await navigator.clipboard.writeText(textEl.textContent.trim()).catch(() => {});
        toast('Copied to clipboard', 'info');
      }
    }
    if (action === 'clippings') {
      const textEl  = document.querySelector(`#v-${osis} .verse-text`);
      const text    = textEl ? textEl.textContent.trim() : '';
      const [b, c, v] = (osis || '').split('.');
      const bookName  = getBook(b)?.name ?? b;
      const reference = `${bookName} ${c}:${v}`;

      await addClipping({ osisId: osis, osisEnd: osis, reference, text });
      bus.emit(EVENTS.CLIPPING_ADDED, { count: 1 });
      toast('Verse added to clippings', 'info');
    }
    if (action === 'nav-ot') {
      const otOsis = btn.dataset.otOsis;
      if (otOsis) {
        const [book, ch, v] = otOsis.split('.');
        navigateTo({ book, chapter: parseInt(ch, 10), verse: v ? parseInt(v, 10) : 1 });
      }
    }
    removeMenu();
  });

  // Close on outside click
  setTimeout(() => document.addEventListener('click', removeMenu, { once: true }), 10);
}

function removeMenu() {
  _menuEl?.remove();
  _menuEl = null;
}

// ── Helpers ───────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const _OSIS_SHORT = {
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

function _osisShort(book) {
  return _OSIS_SHORT[book] || book;
}
