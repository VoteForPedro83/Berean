/* ============================================================
   interlinear.js — Interlinear word stack component
   Renders Greek/Hebrew word stacks with Tippy.js Strong's popups.

   Usage:
     initInterlinear()             — call once at startup
     toggleInterlinear()           — show/hide interlinear view
     renderInterlinearChapter(verses) — builds word stacks for a chapter
   ============================================================ */

import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { bus, EVENTS } from '../../state/eventbus.js';
import { getVerseWords } from '../../db/bible.js';
import { getEnrichedStrongs, initLexiconDb, getLexiconGlossBatch } from '../../db/lexicon.js';
import { parseHash } from '../../router.js';

// ── State ─────────────────────────────────────────────────────────────────────

let _interlinearActive = false;
let _chapterEl        = null;   // The #chapter-content element
let _tippyInstances   = [];     // Track instances for cleanup
let _activePopup      = null;   // Currently visible Tippy instance

// ── Init ──────────────────────────────────────────────────────────────────────

export function initInterlinear() {
  // Start loading the lexicon DB in the background
  initLexiconDb();

  // Escape key closes the active Strong's popup
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _activePopup) {
      _activePopup.hide();
      _activePopup = null;
    }
  });

  // Listen for toggle event (from Ctrl+I shortcut or button)
  document.addEventListener('berean:toggle-interlinear', toggleInterlinear);

  // Re-render when a new chapter loads
  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter, verses }) => {
    if (_interlinearActive) {
      // Small delay to let the reading pane DOM settle
      setTimeout(() => buildInterlinearChapter(verses), 50);
    }
  });
}

// ── Toggle ────────────────────────────────────────────────────────────────────

export function toggleInterlinear() {
  _interlinearActive = !_interlinearActive;

  const btn = document.getElementById('toggle-interlinear');
  if (btn) {
    btn.setAttribute('aria-pressed', String(_interlinearActive));
    btn.style.color = _interlinearActive
      ? 'var(--color-accent-gold)'
      : '';
  }

  if (_interlinearActive) {
    // Trigger rebuild on the currently loaded chapter
    document.dispatchEvent(new CustomEvent('berean:interlinear-on'));
  } else {
    destroyInterlinear();
    document.dispatchEvent(new CustomEvent('berean:interlinear-off'));
  }
}

export function isInterlinearActive() { return _interlinearActive; }

// ── Build interlinear for current chapter ─────────────────────────────────────

/**
 * Called after a chapter is rendered in text mode.
 * Fetches words for each verse and replaces the text spans with word stacks.
 */
export async function buildInterlinearChapter(verses) {
  _chapterEl = document.getElementById('chapter-content');
  if (!_chapterEl) return;

  destroyTippyInstances();

  // Fetch all verse word data in parallel
  const verseData = await Promise.all(
    verses.map(async v => {
      const osisId = v.osisId || `${v.book}.${v.chapter}.${v.verse}`;
      const words  = await getVerseWords(osisId);
      return { osisId, words: words || [] };
    })
  );

  // Collect all strongs IDs that are missing a gloss — batch-fetch from lexicon
  const missingGlossIds = new Set();
  for (const { words } of verseData) {
    for (const w of words) {
      if (!w.english_gloss && w.strongs) missingGlossIds.add(w.strongs);
    }
  }
  const fallbackGlosses = missingGlossIds.size
    ? await getLexiconGlossBatch([...missingGlossIds])
    : new Map();

  // Patch gloss into words missing it
  for (const { words } of verseData) {
    for (const w of words) {
      if (!w.english_gloss && w.strongs && fallbackGlosses.has(w.strongs)) {
        w.english_gloss = fallbackGlosses.get(w.strongs);
      }
    }
  }

  // Build DOM for each verse
  for (const { osisId, words } of verseData) {
    const verseEl = document.getElementById(`v-${osisId}`);
    if (!verseEl) continue;
    const textEl = verseEl.querySelector('.verse-text');
    if (!textEl) continue;

    if (!words.length) {
      // NT verse with no Greek words in morphgnt.sqlite3 — this means the verse
      // is absent from the SBLGNT critical text (a later scribal addition).
      // Show an explanatory note rather than silently leaving plain text.
      // Common examples: John 5:4, Mark 16:9-20, John 7:53-8:11 (partial).
      const isNT = osisId.match(/^(MAT|MRK|LUK|JHN|ACT|ROM|1CO|2CO|GAL|EPH|PHP|COL|1TH|2TH|1TI|2TI|TIT|PHM|HEB|JAS|1PE|2PE|1JN|2JN|3JN|JUD|REV)\./);
      if (isNT) {
        const note = document.createElement('div');
        note.className = 'interlinear-absent-note';
        note.setAttribute('role', 'note');
        note.innerHTML = `
          <span class="absent-icon" aria-hidden="true">※</span>
          <span>This verse is absent from the SBLGNT critical Greek text. It appears in later manuscripts but is not found in the earliest witnesses (e.g. Papyrus 66, Papyrus 75, Codex Sinaiticus, Codex Vaticanus). Most modern critical editions bracket or omit it.</span>
        `;
        textEl.after(note);
      }
      continue;
    }

    const lang = words[0]?.language || 'greek';
    const row  = buildInterlinearRow(words, lang, osisId);
    textEl.replaceWith(row);
  }

  // Wire Tippy after all DOM updates
  wireStrongsPopups();
}

// ── Tear down ─────────────────────────────────────────────────────────────────

function destroyInterlinear() {
  destroyTippyInstances();

  // Re-emit the current passage so reading-pane renders plain text.
  // Use the URL hash as the single source of truth — avoids stale _current.
  const passage = parseHash(window.location.hash);
  bus.emit(EVENTS.NAVIGATE, passage);
}

function destroyTippyInstances() {
  _tippyInstances.forEach(t => t.destroy());
  _tippyInstances = [];
}

// ── Build interlinear row HTML ─────────────────────────────────────────────────

function buildInterlinearRow(words, lang, verseOsis) {
  const row = document.createElement('div');
  row.className = 'interlinear-row';
  row.dataset.lang    = lang;
  row.dataset.verseOsis = verseOsis;

  if (lang === 'hebrew') {
    row.setAttribute('dir', 'rtl');
  }

  for (const w of words) {
    row.appendChild(buildWordStack(w));
  }

  return row;
}

function buildWordStack(word) {
  const lang        = word.language || 'greek';
  const isHapax     = word.is_hapax === 1 || word.is_hapax === true;
  const strongsId   = word.strongs || '';

  const stack = document.createElement('div');
  stack.className   = 'word-stack';
  stack.tabIndex    = 0;
  stack.role        = 'button';
  stack.dataset.strongs = strongsId;
  if (isHapax) stack.dataset.hapax = 'true';

  // Build accessible label
  const parts = [
    word.surface_text && `Word: ${word.surface_text}`,
    lang === 'greek' ? 'Greek' : 'Hebrew',
    word.morphology && `morphology: ${word.morphology}`,
    strongsId && `Strong's ${strongsId}`,
    word.english_gloss && `meaning: ${word.english_gloss}`,
  ].filter(Boolean);
  stack.setAttribute('aria-label', parts.join(', '));

  // Source text (Greek or Hebrew)
  const src = document.createElement('bdi');
  src.className = `source-text ${lang}`;
  src.setAttribute('aria-hidden', 'true');
  if (lang === 'hebrew') {
    src.setAttribute('dir', 'rtl');
    src.setAttribute('lang', 'he');
  } else {
    src.setAttribute('lang', 'el');
  }
  src.textContent = word.surface_text || '';

  // Transliteration
  const translit = document.createElement('span');
  translit.className = 'transliteration';
  translit.setAttribute('aria-hidden', 'true');
  translit.textContent = word.transliteration || '';

  // English gloss
  const gloss = document.createElement('span');
  gloss.className = 'english-gloss';
  gloss.setAttribute('aria-hidden', 'true');
  gloss.textContent = word.english_gloss || '';

  // Morphology tag
  const morph = document.createElement('span');
  morph.className = 'morph-tag';
  morph.setAttribute('aria-hidden', 'true');
  morph.textContent = word.morphology || '';

  // Strong's number (clickable)
  const sn = document.createElement('span');
  sn.className = 'strongs-number';
  sn.setAttribute('aria-hidden', 'true');
  sn.textContent = strongsId;

  stack.append(src, translit, gloss, morph, sn);
  return stack;
}

// ── Tippy Strong's Popups ─────────────────────────────────────────────────────

function wireStrongsPopups() {
  if (!_chapterEl) return;

  const stacks = _chapterEl.querySelectorAll('.word-stack[data-strongs]');

  stacks.forEach(stack => {
    const strongsId = stack.dataset.strongs;
    if (!strongsId) return;

    const instance = tippy(stack, {
      content:   '<div class="strongs-popup__loading">Loading…</div>',
      allowHTML: true,
      theme:     'strongs',
      trigger:   'click',
      touch:     ['hold', 400],  // long-press on mobile opens the popup
      interactive: true,
      placement:   'top',
      maxWidth:    380,
      appendTo:    document.body,
      onShow(inst) {
        // Hide any other open popup first
        if (_activePopup && _activePopup !== inst) _activePopup.hide();
        _activePopup = inst;
        // Prevent double-loading
        if (inst._loaded) return;
        inst._loaded = true;
        stack.dataset.active = 'true';
        loadStrongsContent(inst, strongsId);
      },
      onHide(inst) {
        stack.dataset.active = '';
        if (_activePopup === inst) _activePopup = null;
      },
    });

    // Also fire word-selected event for the right panel
    stack.addEventListener('click', () => {
      bus.emit(EVENTS.WORD_SELECTED, {
        strongs:    strongsId,
        lemma:      stack.querySelector('.source-text')?.textContent,
        gloss:      stack.querySelector('.english-gloss')?.textContent,
        language:   stack.dataset.lang || 'greek',
        verseOsis:  stack.closest('.interlinear-row')?.dataset.verseOsis,
      });
    });

    // Keyboard activation
    stack.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        instance.show();
      }
    });

    _tippyInstances.push(instance);
  });
}

async function loadStrongsContent(tippyInstance, strongsId) {
  // Use getEnrichedStrongs — prefers Thayer's (Greek) or Enhanced BDB (Hebrew)
  // over bare Strong's definitions where available
  const entry = await getEnrichedStrongs(strongsId);

  if (!entry) {
    tippyInstance.setContent(
      `<div class="strongs-popup">
         <div class="strongs-popup__header">
           <span class="strongs-popup__id">${strongsId}</span>
         </div>
         <p class="strongs-popup__definition" style="color:var(--color-ink-muted)">
           Definition not available — lexicon database loading…
         </p>
       </div>`
    );
    return;
  }

  const lang       = entry.language;
  const lemmaClass = lang === 'greek' ? 'greek' : 'hebrew';
  const lemmaDir   = lang === 'hebrew' ? 'dir="rtl" lang="he"' : 'lang="el"';
  const lemmaFont  = lang === 'greek'  ? '"Gentium Plus", serif' : '"Ezra SIL OT", serif';

  // Source label: Thayer's, Enhanced BDB, or Strong's
  const sourceLabels = {
    thayers: "Thayer's Greek Lexicon",
    bdb:     'Enhanced Brown-Driver-Briggs',
    strongs: "Strong's Concordance",
  };
  const sourceLabel = sourceLabels[entry.source] || "Strong's Concordance";

  // Prefer the enriched long definition; fall back through tiers
  const defText   = (entry.long_def || entry.short_def || entry.definition || '')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const kjvText   = (entry.kjv_usage  || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const derivText = (entry.derivation || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cogText   = (entry.cognates   || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const twotText  = entry.twot_number ? `TWOT: ${entry.twot_number}` : '';

  const html = `
    <div class="strongs-popup">
      <div class="strongs-popup__header">
        <span class="strongs-popup__id">${strongsId}</span>
        <span class="strongs-popup__lemma ${lemmaClass}"
              style="font-family:${lemmaFont}"
              ${lemmaDir}>${entry.lemma || ''}</span>
        ${entry.transliteration
          ? `<span class="strongs-popup__transliteration">${entry.transliteration}</span>`
          : ''}
        ${entry.pronunciation && entry.pronunciation !== entry.transliteration
          ? `<span class="strongs-popup__transliteration" style="opacity:.7">(${entry.pronunciation})</span>`
          : ''}
      </div>

      <div class="strongs-popup__tabs" role="tablist">
        <button class="strongs-popup__tab" data-active="true"
                data-tab="def" role="tab" aria-selected="true">Definition</button>
        <button class="strongs-popup__tab"
                data-tab="kjv" role="tab" aria-selected="false">KJV usage</button>
        ${derivText ? `<button class="strongs-popup__tab" data-tab="deriv" role="tab" aria-selected="false">Derivation</button>` : ''}
      </div>

      <div class="strongs-popup__panel" data-panel="def">
        <p class="strongs-popup__definition">${defText || '<em style="color:var(--color-ink-muted)">No definition available</em>'}</p>
        ${cogText ? `<p class="strongs-popup__cognates">Related: ${cogText}</p>` : ''}
        ${twotText ? `<p class="strongs-popup__cognates">${twotText}</p>` : ''}
        <p class="strongs-popup__source">Source: ${sourceLabel}</p>
      </div>
      <div class="strongs-popup__panel" data-panel="kjv" hidden>
        <p class="strongs-popup__definition">${kjvText || '<em style="color:var(--color-ink-muted)">No KJV data</em>'}</p>
      </div>
      ${derivText ? `
      <div class="strongs-popup__panel" data-panel="deriv" hidden>
        <p class="strongs-popup__definition">${derivText}</p>
      </div>` : ''}
    </div>`;

  tippyInstance.setContent(html);

  // Wire tab clicks (must happen after setContent updates the DOM)
  const box = tippyInstance.popper;
  box.querySelectorAll('.strongs-popup__tab').forEach(tab => {
    tab.addEventListener('click', () => {
      box.querySelectorAll('.strongs-popup__tab').forEach(t => {
        t.dataset.active = 'false';
        t.setAttribute('aria-selected', 'false');
      });
      box.querySelectorAll('.strongs-popup__panel').forEach(p => { p.hidden = true; });

      tab.dataset.active = 'true';
      tab.setAttribute('aria-selected', 'true');
      const panel = box.querySelector(`[data-panel="${tab.dataset.tab}"]`);
      if (panel) panel.hidden = false;
    });
  });
}
