/* ============================================================
   word-study.js — Word Study Workspace (right panel)

   Shows when the user clicks a word in interlinear view:
   - Strong's full entry (lemma, definition, derivation)
   - Louw-Nida semantic domain
   - Concordance: all verses containing this Strong's number
   - Frequency histogram by book (ECharts)
   - Root/cognate tracing
   ============================================================ */

import * as echarts from 'echarts/core';
import { BarChart }         from 'echarts/charts';
import { GridComponent, TooltipComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer }   from 'echarts/renderers';
import { bus, EVENTS }      from '../../state/eventbus.js';
import { getStrongs, getLouwNida } from '../../db/lexicon.js';
import { getStrongsConcordance }   from '../../db/bible.js';
import { navigateTo }              from '../../router.js';

echarts.use([BarChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer]);

// ── State ─────────────────────────────────────────────────────────────────────

let _container    = null;
let _chartInstance = null;
let _currentStrongs = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initWordStudy() {
  // Use the dedicated word-study tab pane; fall back to right-panel for backwards compat
  _container = document.getElementById('rp-wordstudy') || document.getElementById('right-panel');
  if (!_container) return;

  // Listen for word clicks from interlinear
  bus.on(EVENTS.WORD_SELECTED, ({ strongs, lemma, gloss, language }) => {
    if (strongs) openWordStudy(strongs, { lemma, gloss, language });
  });
}

// ── Open ──────────────────────────────────────────────────────────────────────

export async function openWordStudy(strongsId, meta = {}) {
  if (!_container) return;
  _currentStrongs = strongsId;

  // Show loading skeleton
  renderSkeleton(strongsId, meta);

  // Fetch all data in parallel
  const [entry, lnDomains, concordance] = await Promise.all([
    getStrongs(strongsId),
    getLouwNida(strongsId),
    getStrongsConcordance(strongsId, 300),
  ]);

  if (_currentStrongs !== strongsId) return; // navigation changed while loading

  renderWordStudy({ strongsId, entry, lnDomains, concordance });
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function renderSkeleton(strongsId, { lemma, gloss, language } = {}) {
  _container.innerHTML = `
    <div class="ws-panel">
      <div class="ws-header">
        <div class="ws-header__id">${strongsId}</div>
        ${lemma ? `<div class="ws-header__lemma ${language || ''}">${lemma}</div>` : ''}
        ${gloss ? `<div class="ws-header__gloss">${gloss}</div>` : ''}
      </div>
      <div class="ws-skeleton">
        <div class="ws-skeleton__line ws-skeleton__line--wide"></div>
        <div class="ws-skeleton__line"></div>
        <div class="ws-skeleton__line ws-skeleton__line--narrow"></div>
      </div>
    </div>`;
}

// ── Full render ───────────────────────────────────────────────────────────────

function renderWordStudy({ strongsId, entry, lnDomains, concordance }) {
  const lang   = entry?.language || 'greek';
  const lemmaFont = lang === 'greek' ? '"Gentium Plus", serif' : '"Ezra SIL OT", serif';
  const lemmaDir  = lang === 'hebrew' ? 'dir="rtl" lang="he"' : 'lang="el"';

  // Frequency by book
  const byBook = buildByBook(concordance);
  const totalOcc = concordance.length;

  // Root/cognates: parse derivation field for other Strongs IDs
  const cognates = extractCognates(entry?.derivation || '');

  _container.innerHTML = `
    <div class="ws-panel">

      <!-- Header -->
      <div class="ws-header">
        <div class="ws-header__top">
          <span class="ws-header__id">${strongsId}</span>
          ${entry?.part_of_speech ? `<span class="ws-header__pos">${entry.part_of_speech}</span>` : ''}
          <button class="ws-close" id="ws-close" aria-label="Close word study">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ws-header__lemma-row">
          <span class="ws-header__lemma ${lang}" style="font-family:${lemmaFont}" ${lemmaDir}>
            ${entry?.lemma || ''}
          </span>
          ${entry?.transliteration ? `<span class="ws-header__translit">${entry.transliteration}</span>` : ''}
          ${entry?.pronunciation && entry.pronunciation !== entry.transliteration
            ? `<span class="ws-header__pron">(${entry.pronunciation})</span>` : ''}
        </div>
        <p class="ws-header__def">${entry?.definition || '<em>Definition loading…</em>'}</p>
      </div>

      <!-- KJV usage -->
      ${entry?.kjv_usage ? `
      <div class="ws-section">
        <h3 class="ws-section__title">KJV Rendered As</h3>
        <p class="ws-section__body">${escHtml(entry.kjv_usage)}</p>
      </div>` : ''}

      <!-- Derivation + cognates -->
      ${entry?.derivation ? `
      <div class="ws-section">
        <h3 class="ws-section__title">Derivation</h3>
        <p class="ws-section__body">${linkifyStrongs(escHtml(entry.derivation))}</p>
        ${cognates.length ? `
        <div class="ws-cognates">
          ${cognates.map(id => `<button class="ws-cognate-btn" data-strongs="${id}">${id}</button>`).join('')}
        </div>` : ''}
      </div>` : ''}

      <!-- Louw-Nida -->
      ${lnDomains.length ? `
      <div class="ws-section">
        <h3 class="ws-section__title">Louw-Nida Semantic Domain</h3>
        ${lnDomains.map(d => `
          <div class="ws-ln-domain">
            <span class="ws-ln-domain__num">${d.domain_number}</span>
            <span class="ws-ln-domain__name">${escHtml(d.domain_name || '')}${d.subdomain ? ` › ${escHtml(d.subdomain)}` : ''}</span>
            ${d.gloss ? `<span class="ws-ln-domain__gloss">"${escHtml(d.gloss)}"</span>` : ''}
          </div>`).join('')}
      </div>` : ''}

      <!-- Frequency -->
      <div class="ws-section">
        <h3 class="ws-section__title">
          Frequency
          <span class="ws-section__count">${totalOcc.toLocaleString()} occurrence${totalOcc !== 1 ? 's' : ''}</span>
        </h3>
        <div id="ws-chart" class="ws-chart" aria-label="Frequency by book"></div>
      </div>

      <!-- Concordance -->
      <div class="ws-section">
        <h3 class="ws-section__title">Concordance</h3>
        <div class="ws-concordance" id="ws-concordance">
          ${renderConcordanceList(concordance, strongsId)}
        </div>
      </div>

    </div>`;

  // Wire close button
  _container.querySelector('#ws-close')?.addEventListener('click', closeWordStudy);

  // Wire cognate buttons
  _container.querySelectorAll('.ws-cognate-btn').forEach(btn => {
    btn.addEventListener('click', () => openWordStudy(btn.dataset.strongs));
  });

  // Wire concordance verse links
  _container.querySelectorAll('.ws-conc-verse').forEach(btn => {
    btn.addEventListener('click', () => {
      const [b, ch, v] = btn.dataset.osis.split('.');
      navigateTo({ book: b, chapter: parseInt(ch), verse: parseInt(v) });
    });
  });

  // Build frequency chart after DOM is settled
  requestAnimationFrame(() => buildChart(byBook, lang));
}

// ── Close ─────────────────────────────────────────────────────────────────────

function closeWordStudy() {
  _currentStrongs = null;
  if (_chartInstance) { _chartInstance.dispose(); _chartInstance = null; }

  _container.innerHTML = `
    <div class="right-panel__placeholder">
      <p class="right-panel__placeholder-title">Word Study</p>
      <p class="right-panel__placeholder-body">
        Toggle interlinear (Ctrl+I) then click any Greek or Hebrew word to open its full study here.
      </p>
    </div>`;
}

// ── Concordance ───────────────────────────────────────────────────────────────

function renderConcordanceList(concordance, strongsId) {
  if (!concordance.length) {
    return '<p class="ws-conc-empty">No occurrences found in the database.</p>';
  }

  // Group by book
  const byBook = {};
  for (const v of concordance) {
    if (!byBook[v.book]) byBook[v.book] = [];
    byBook[v.book].push(v);
  }

  return Object.entries(byBook).map(([book, verses]) => `
    <details class="ws-conc-book" open>
      <summary class="ws-conc-book__header">
        <span class="ws-conc-book__name">${book}</span>
        <span class="ws-conc-book__count">${verses.length}</span>
      </summary>
      <div class="ws-conc-book__verses">
        ${verses.map(v => `
          <button class="ws-conc-verse" data-osis="${v.osisId}">
            <span class="ws-conc-verse__ref">${v.chapter}:${v.verse}</span>
            <span class="ws-conc-verse__text">${highlightStrongsWord(escHtml(v.text), strongsId)}</span>
          </button>`).join('')}
      </div>
    </details>`).join('');
}

// ── ECharts frequency histogram ───────────────────────────────────────────────

function buildByBook(concordance) {
  const counts = {};
  for (const v of concordance) {
    counts[v.book] = (counts[v.book] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function buildChart(byBook, lang) {
  const el = _container?.querySelector('#ws-chart') || document.getElementById('ws-chart');
  if (!el || byBook.length === 0) {
    if (el) el.style.display = 'none';
    return;
  }

  el.style.height = `${Math.max(120, Math.min(byBook.length * 22, 280))}px`;

  if (_chartInstance) _chartInstance.dispose();
  _chartInstance = echarts.init(el, null, { renderer: 'canvas' });

  const isDark = !document.body.classList.contains('light-mode');
  const gold   = '#D4AF37';
  const textColor = isDark ? '#A39E93' : '#3C3830';

  _chartInstance.setOption({
    backgroundColor: 'transparent',
    grid: { left: 52, right: 16, top: 8, bottom: 8, containLabel: false },
    xAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: { color: textColor, fontSize: 11 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: isDark ? '#3E3E3E' : '#D5D1C8' } },
    },
    yAxis: {
      type: 'category',
      data: byBook.map(([b]) => b),
      axisLabel: { color: textColor, fontSize: 11, fontFamily: '"Fira Code", monospace' },
      axisLine: { show: false },
      axisTick: { show: false },
      inverse: false,
    },
    series: [{
      type: 'bar',
      data: byBook.map(([, n]) => n),
      itemStyle: { color: gold, borderRadius: 2 },
      barMaxWidth: 18,
    }],
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark ? '#363636' : '#F4F2EC',
      borderColor: isDark ? '#3E3E3E' : '#D5D1C8',
      textStyle: { color: isDark ? '#E8E6E1' : '#1A1A1A', fontSize: 12 },
      formatter: params => `${params[0].name}: ${params[0].value} occurrence${params[0].value !== 1 ? 's' : ''}`,
    },
  });

  // Resize chart when the panel resizes
  new ResizeObserver(() => _chartInstance?.resize()).observe(el);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Wrap Strongs IDs in the derivation text with clickable buttons.
 * e.g. "from G1537 and G5055" → links on G1537 and G5055
 */
function linkifyStrongs(text) {
  return text.replace(/\b([GH]\d{1,5})\b/g,
    (m, id) => `<button class="ws-cognate-btn" data-strongs="${id}">${id}</button>`
  );
}

function extractCognates(derivation) {
  const matches = derivation.match(/\b[GH]\d{1,5}\b/g);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Very light highlight — wraps nothing (we don't know which word matched
 * in a multi-word verse text without re-querying). Just returns as-is.
 */
function highlightStrongsWord(text) {
  return text;
}
