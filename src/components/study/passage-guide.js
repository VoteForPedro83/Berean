/* ============================================================
   passage-guide.js — Multi-section AI passage study guide
   Right-panel tab: "Guide"

   Fires 5 parallel AI streaming queries for the selected passage:
   1. Historical Context
   2. Literary Structure
   3. Cross-References
   4. Theological Themes
   5. Original Language Notes

   Results render progressively as each stream completes.
   Results are persisted to IndexedDB so they survive navigation
   and page reloads. In-memory cache provides fast same-session access.

   Architecture note: STAGES.md specified "parallel Web Workers"
   but the bottleneck here is network I/O (AI API streaming), not
   CPU. Web Workers add complexity for zero benefit when the work
   is I/O-bound. Five parallel streamAiResponse() calls on the
   main thread achieve identical parallelism with less code.
   ============================================================ */
import { bus, EVENTS }          from '../../state/eventbus.js';
import { state }                from '../../state/study-mode.js';
import { getChapter }           from '../../db/bible.js';
import { streamAiResponse }     from '../../ai/stream.js';
import { buildAiContext, SYSTEM_PROMPT, TRANSLATION_LICENCES } from '../../ai/context.js';
import { getBook }              from '../../data/books.js';
import { savePassageGuide,
         loadPassageGuide,
         deletePassageGuide }   from '../../idb/passage-guides.js';

// ── Section definitions ──────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'context',   label: 'Historical Context',    icon: '\u2295',  // ⊕
    prompt: (ref, ctx) =>
      `Provide the historical and cultural context for ${ref}.

${ctx}

Cover:
1. **Author, audience, and occasion** — who wrote this, to whom, when, and why
2. **Sociopolitical and religious background** relevant to this passage
3. **Position in the book's argument** — how this passage fits in the larger flow
4. **OT background or Second Temple context** the original audience would have known

Be specific and cite sources where possible. Keep it concise — this is a study aid, not a lecture.` },

  { id: 'structure', label: 'Literary Structure',    icon: '\u229E',  // ⊞
    prompt: (ref, ctx) =>
      `Analyse the literary structure of ${ref}.

${ctx}

Cover:
1. **Genre and literary form** — narrative, discourse, poetry, apocalyptic, epistle, etc.
2. **Internal structure** — chiasm, parallelism, inclusio, or other rhetorical patterns
3. **Key discourse markers and transitions** — conjunctions, particles, shifts in address
4. **Unit boundaries** — how this passage relates to what comes before and after
5. **Rhetorical strategy** — what is being emphasised and how

Use indented outlines where helpful.` },

  { id: 'crossrefs', label: 'Cross-References',      icon: '\u21D4',  // ⇔
    prompt: (ref, ctx) =>
      `Identify the 8-10 most theologically significant cross-references for ${ref}.

${ctx}

For each cross-reference:
- Give the exact reference (e.g. Romans 8:28)
- Classify the connection: **direct quotation**, **allusion**, **verbal parallel**, **thematic parallel**, or **typological fulfilment**
- Explain in 1-2 sentences why this connection matters for interpreting the passage

Prioritise connections the original biblical author intended over later theological associations. Only suggest references you are confident exist.` },

  { id: 'themes',    label: 'Theological Themes',    icon: '\u2726',  // ✦
    prompt: (ref, ctx) =>
      `Identify the major theological themes in ${ref}.

${ctx}

For each theme:
1. **State the theme clearly**
2. **Show how it appears in this specific passage**
3. **Trace its redemptive-historical trajectory** — OT roots, NT development, eschatological fulfilment
4. **Note denominational differences** — Reformed, Wesleyan, Catholic, etc. — without endorsing any view

Focus on themes that would be most fruitful for preaching.` },

  { id: 'language',  label: 'Original Language Notes', icon: '\u03B1\u03B2', // αβ
    prompt: (ref, ctx) =>
      `Analyse the key Greek or Hebrew terms in ${ref}.

${ctx}

Choose 4-6 words that matter most for interpretation. For each:
1. **Original term** (transliterated) and Strong's number if known
2. **Core semantic range** — major meanings in biblical usage
3. **Author's word choice** — why this word rather than a synonym
4. **Grammar that matters** — tense, voice, mood, case, and why it affects meaning
5. **Key parallel passage** — one other verse where the same word appears with related theological force

Keep explanations accessible to a pastor, not a linguist.` },
];

// ── Module state ─────────────────────────────────────────────────────────────

let _container  = null;
let _passage    = null;
let _cache      = new Map();   // "JHN.3.16" → { context: "...", ... }
let _abortList  = [];          // active AbortControllers

// ── Public init ──────────────────────────────────────────────────────────────

export function initPassageGuide(containerEl) {
  _container = containerEl;

  // Seed from current state (lazy-init may have missed earlier events)
  if (state.book && state.chapter) {
    _passage = { book: state.book, chapter: state.chapter, verse: state.verse || 1 };
  }

  _renderPlaceholder();

  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    _passage = { book, chapter, verse: state.verse || 1 };
    _renderPlaceholder();
  });

  bus.on(EVENTS.VERSE_SELECT, ({ book, chapter, verse }) => {
    _passage = { book, chapter, verse };
    _renderPlaceholder();
  });

  bus.on(EVENTS.VERSE_RANGE_SELECT, ({ book, chapter, verseStart, verseEnd }) => {
    _passage = { book, chapter, verse: verseStart, verseEnd };
    _renderPlaceholder();
  });
}

// ── Cache key ────────────────────────────────────────────────────────────────

function _cacheKey(p) {
  return p.verseEnd && p.verseEnd !== p.verse
    ? `${p.book}.${p.chapter}.${p.verse}-${p.verseEnd}`
    : `${p.book}.${p.chapter}.${p.verse}`;
}

function _passageLabel(p) {
  const meta = getBook(p.book);
  const name = meta?.name ?? p.book;
  if (p.verseEnd && p.verseEnd !== p.verse) {
    return `${name} ${p.chapter}:${p.verse}\u2013${p.verseEnd}`;
  }
  return `${name} ${p.chapter}:${p.verse}`;
}

// ── Placeholder / cached view ────────────────────────────────────────────────

async function _renderPlaceholder() {
  if (!_container) return;
  _abortAll();

  const ref = _passage ? _passageLabel(_passage) : 'a passage';
  const key = _passage ? _cacheKey(_passage) : null;

  // Check in-memory cache first (fast), then IDB (persistent)
  let saved = key && _cache.has(key) ? { sections: _cache.get(key), fromMemory: true } : null;
  if (!saved && key) {
    try { saved = await loadPassageGuide(key); } catch { /* db not ready */ }
  }

  if (saved) {
    _renderSavedGuide(key, ref, saved);
    return;
  }

  _container.innerHTML = `
    <div class="pg">
      <div class="pg__header">
        <h3 class="pg__title">Passage Guide</h3>
        <p class="pg__ref">${_esc(ref)}</p>
      </div>
      <p class="pg__desc">
        Generate a comprehensive study guide with five parallel analyses:
        historical context, literary structure, cross-references, theological themes,
        and original language notes.
      </p>
      <button class="pg__run-btn" id="pg-run-btn">▶ Generate Guide</button>
      <p class="pg__note">Requires an AI API key — add a free Gemini key in <strong>Settings → AI API Keys</strong>.</p>
    </div>`;

  document.getElementById('pg-run-btn')?.addEventListener('click', _runGuide);
}

function _renderSavedGuide(key, ref, saved) {
  const sections  = saved.sections ?? saved; // compat: IDB record has .sections, in-memory has flat obj
  const dateStr   = saved.generatedAt ? new Date(saved.generatedAt).toLocaleDateString() : '';
  const passLabel = saved.passageLabel ?? ref;

  _container.innerHTML = `
    <div class="pg">
      <div class="pg__header">
        <h3 class="pg__title">Passage Guide</h3>
        <p class="pg__ref">${_esc(passLabel)}</p>
      </div>
      <div class="pg__saved-bar">
        ${dateStr ? `<span class="pg__saved-date">Saved ${_esc(dateStr)}</span>` : ''}
        <button class="pg__export-btn" id="pg-export-btn" title="Export as Markdown">↓ Export</button>
        <button class="pg__regen-btn" id="pg-regen-btn">↺ Regenerate</button>
      </div>
      ${SECTIONS.map(s => `
        <details class="pg__section pg__section--done" open>
          <summary class="pg__section-header">
            <span class="pg__section-icon">${s.icon}</span>
            <span class="pg__section-label">${_esc(s.label)}</span>
          </summary>
          <div class="pg__section-body">${_renderMd(sections[s.id] || '')}</div>
        </details>`).join('')}
      <footer class="pg__disclaimer">
        AI-generated research assistance — verify all claims against scripture.
      </footer>
    </div>`;

  document.getElementById('pg-regen-btn')?.addEventListener('click', async () => {
    _cache.delete(key);
    try { await deletePassageGuide(key); } catch { /* ok */ }
    _runGuide();
  });

  document.getElementById('pg-export-btn')?.addEventListener('click', () => {
    _exportGuide(passLabel, sections);
  });
}

// _renderCachedSections replaced by _renderSavedGuide above

// ── Run all 5 sections in parallel ───────────────────────────────────────────

async function _runGuide() {
  if (!_passage || !_container) return;
  _abortAll();

  const ref = _passageLabel(_passage);
  const key = _cacheKey(_passage);

  // Fetch verse data
  const verses = await getChapter(_passage.book, _passage.chapter);
  if (!verses.length) return;

  const verseEnd = _passage.verseEnd ?? _passage.verse;
  const selected = verses.filter(v => v.verse >= _passage.verse && v.verse <= verseEnd);
  if (!selected.length) return;

  const combinedText = selected.map(v => `[${v.verse}] ${v.text}`).join(' ');
  const translation  = TRANSLATION_LICENCES.WEB;

  const passage = {
    humanRef:   ref,
    osisId:     `${_passage.book}.${_passage.chapter}.${_passage.verse}`,
    verseCount: selected.length,
    text:       combinedText,
    textWeb:    combinedText,
    isNT:       getBook(_passage.book)?.testament === 'NT',
    isOT:       getBook(_passage.book)?.testament === 'OT',
    words:      [],
  };

  const { userMessage, basisLabel } = buildAiContext(passage, translation);
  const contextBlock = `${userMessage}\n\n${basisLabel}`;

  // ── Render skeleton with all 5 section placeholders ──
  _container.innerHTML = `
    <div class="pg">
      <div class="pg__header">
        <h3 class="pg__title">Passage Guide</h3>
        <p class="pg__ref">${_esc(ref)}</p>
        <button class="pg__stop-btn" id="pg-stop-btn">\u25A0 Stop All</button>
      </div>
      ${SECTIONS.map(s => `
        <details class="pg__section" id="pg-sec-${s.id}" open>
          <summary class="pg__section-header">
            <span class="pg__section-icon">${s.icon}</span>
            <span class="pg__section-label">${_esc(s.label)}</span>
            <span class="pg__section-status pg__section-status--loading"
                  id="pg-st-${s.id}">generating\u2026</span>
          </summary>
          <div class="pg__section-body" id="pg-bd-${s.id}">
            <div class="pg__spinner"></div>
          </div>
        </details>`).join('')}
      <footer class="pg__disclaimer">
        AI-generated research assistance \u2014 verify all claims against scripture.
      </footer>
    </div>`;

  document.getElementById('pg-stop-btn')?.addEventListener('click', () => {
    _abortAll();
    _container.querySelectorAll('.pg__section-status--loading').forEach(el => {
      el.textContent = 'stopped';
      el.className = 'pg__section-status pg__section-status--error';
    });
  });

  // ── Fire all 5 streams in parallel ──
  const results = {};

  for (const section of SECTIONS) {
    const bodyEl   = document.getElementById(`pg-bd-${section.id}`);
    const statusEl = document.getElementById(`pg-st-${section.id}`);
    let full = '';

    const userPrompt = section.prompt(ref, contextBlock);

    const ctrl = streamAiResponse(userPrompt, SYSTEM_PROMPT, {
      provider: 'gemini',
      onChunk: (chunk) => {
        full += chunk;
        if (bodyEl) bodyEl.innerHTML = _renderMd(full) + '<span class="pg__cursor">\u258B</span>';
      },
      onDone: (text) => {
        results[section.id] = text;
        if (bodyEl) bodyEl.innerHTML = _renderMd(text);
        if (statusEl) {
          statusEl.textContent = 'done';
          statusEl.className = 'pg__section-status pg__section-status--done';
        }
        // When all 5 complete: cache in memory + persist to IDB + add export button
        if (Object.keys(results).length === SECTIONS.length) {
          _cache.set(key, { ...results });
          savePassageGuide(key, _passage.book, ref, { ...results }).catch(() => {});
          document.getElementById('pg-stop-btn')?.remove();
          _addPostGenerationButtons(key, ref, results);
        }
      },
      onError: (err) => {
        const isNoKey = err.message.toLowerCase().includes('no api key') || err.message.toLowerCase().includes('no key');
        if (bodyEl) bodyEl.innerHTML = isNoKey
          ? `<p class="pg__error">${_esc(err.message)}</p>
             <p class="pg__error-hint">Get a free Gemini key at <strong>aistudio.google.com</strong> — takes 30 seconds.</p>
             <button class="pg__settings-btn" id="pg-settings-btn-${Date.now()}">⚙ Open Settings</button>`
          : `<p class="pg__error">${_esc(err.message)}</p>`;
        if (statusEl) {
          statusEl.textContent = 'error';
          statusEl.className = 'pg__section-status pg__section-status--error';
        }
        bodyEl?.querySelector('[id^="pg-settings-btn"]')?.addEventListener('click', () => {
          import('../../state/eventbus.js').then(({ bus, EVENTS }) => bus.emit(EVENTS.MODAL_OPEN, 'settings'));
        });
      },
    });

    _abortList.push(ctrl);
  }
}

// ── Abort ────────────────────────────────────────────────────────────────────

function _abortAll() {
  _abortList.forEach(c => c?.abort());
  _abortList = [];
}

// ── Minimal Markdown renderer ────────────────────────────────────────────────

function _renderMd(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4 class="pg__h4">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 class="pg__h3">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="pg__li">$1</li>')
    .replace(/^[-\u2022]\s+(.+)$/gm, '<li class="pg__li pg__li--bullet">$1</li>')
    .replace(/^---+$/gm, '<hr class="pg__hr"/>')
    .replace(/\n\n+/g, '</p><p class="pg__p">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p class="pg__p">')
    .replace(/$/, '</p>');
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Post-generation: add Export button to live guide ─────

function _addPostGenerationButtons(key, ref, sections) {
  const footer = _container?.querySelector('.pg__disclaimer');
  if (!footer) return;

  const bar = document.createElement('div');
  bar.className = 'pg__saved-bar';
  bar.innerHTML = `
    <span class="pg__saved-date">Saved ${new Date().toLocaleDateString()}</span>
    <button class="pg__export-btn" title="Export as Markdown">↓ Export</button>`;
  bar.querySelector('.pg__export-btn')?.addEventListener('click', () => _exportGuide(ref, sections));
  footer.before(bar);
}

// ── Export ────────────────────────────────────────────────

function _exportGuide(passageLabel, sections) {
  const lines = [
    `# Passage Guide — ${passageLabel}`,
    `_Generated ${new Date().toLocaleString()} in Berean_`,
    '',
  ];
  for (const s of SECTIONS) {
    lines.push(`## ${s.label}`, '', sections[s.id] || '_Not generated_', '');
  }
  lines.push('---', '_AI-generated research assistance — verify all claims against scripture._');
  _download(`berean-guide-${passageLabel.replace(/\s+/g, '-')}.md`, lines.join('\n'));
}

function _download(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
