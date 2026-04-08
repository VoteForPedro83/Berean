/* ============================================================
   ai-panel.js — AI Translation/Paraphrase + Analysis panel
   Right panel tab (6th tab): "AI"

   Modes:
     plain      — plain modern English paraphrase
     expository — expanded expository paraphrase
     devotional — warm devotional paraphrase
     afrikaans  — contemporary Afrikaans translation
     analysis   — structured exegetical analysis (Obs/Interp/App)

   All AI calls are BYOK. No copyrighted text is ever transmitted.
   Requires: user has added a key in Settings, or uses free Gemini.
   ============================================================ */

import { bus, EVENTS }          from '../../state/eventbus.js';
import { state }                from '../../state/study-mode.js';
import { getVerse, getChapter } from '../../db/bible.js';
import { streamAiResponse }     from '../../ai/stream.js';
import { paraphrasePrompt, passageAnalysisPrompt } from '../../ai/prompts.js';
import { TRANSLATION_LICENCES } from '../../ai/context.js';
import { hasApiKey }            from '../../idb/byok.js';
import { saveAiNote,
         loadAiNotesForPassage } from '../../idb/ai-notes.js';
import { getBook }              from '../../data/books.js';

let _container  = null;
let _passage    = null;   // current { book, chapter, verse, verseEnd? }
let _abort      = null;   // AbortController for active stream

const MODES = [
  { id: 'plain',      label: 'Plain English',  icon: '✦' },
  { id: 'expository', label: 'Expository',     icon: '⊞' },
  { id: 'devotional', label: 'Devotional',     icon: '♡' },
  { id: 'afrikaans',  label: 'Afrikaans',      icon: 'Af' },
  { id: 'analysis',   label: 'Analysis',       icon: '⊛' },
];

let _mode = 'plain';

export function initAiPanel(containerEl) {
  _container = containerEl;
  _renderPlaceholder();

  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    _passage = { book, chapter, verse: state.verse || 1 };
    _renderPlaceholder();
  });

  bus.on(EVENTS.VERSE_SELECT, ({ book, chapter, verse }) => {
    _passage = { book, chapter, verse };
    _renderPlaceholder();
  });

  // Multi-verse range selection (from selection bar or direct click)
  bus.on(EVENTS.VERSE_RANGE_SELECT, ({ book, chapter, verseStart, verseEnd, osisIds }) => {
    _passage = { book, chapter, verse: verseStart, verseEnd, osisIds };
    _renderPlaceholder();
  });
}

// ── Placeholder (before AI is invoked) ───────────────────────────────────────

async function _renderPlaceholder() {
  if (!_container) return;
  _abort?.abort();

  const ref     = _passage ? _passageLabel(_passage) : 'a passage';
  const osisRef = _passage ? `${_passage.book}.${_passage.chapter}.${_passage.verse}` : null;

  // Load any saved notes for this passage
  let savedNotes = [];
  if (osisRef) {
    try { savedNotes = await loadAiNotesForPassage(osisRef); } catch { /* db not ready */ }
  }

  const savedHtml = savedNotes.length ? `
    <div class="ai-saved-notes">
      <p class="ai-saved-notes__label">Saved for ${_esc(ref)}:</p>
      ${savedNotes.map(n => `
        <div class="ai-saved-note" data-note-ref="${_esc(n.osisRef)}" data-note-mode="${_esc(n.mode)}">
          <span class="ai-saved-note__mode">${_esc(n.modeName)}</span>
          <span class="ai-saved-note__date">${new Date(n.generatedAt).toLocaleDateString()}</span>
          <button class="ai-saved-note__view" data-note-ref="${_esc(n.osisRef)}" data-note-mode="${_esc(n.mode)}">View</button>
          <button class="ai-saved-note__export" data-content="${_esc(n.content)}" data-label="${_esc(n.passageLabel)}" data-mode="${_esc(n.modeName)}">↓</button>
        </div>`).join('')}
    </div>` : '';

  _container.innerHTML = `
    <div class="ai-panel">
      <div class="ai-modes" role="tablist" aria-label="AI mode">
        ${MODES.map(m => `
          <button class="ai-mode-btn${m.id === _mode ? ' ai-mode-btn--active' : ''}"
                  data-mode="${_esc(m.id)}" role="tab"
                  aria-selected="${m.id === _mode}" title="${_esc(m.label)}">
            <span class="ai-mode-btn__icon">${m.icon}</span>
            <span class="ai-mode-btn__label">${_esc(m.label)}</span>
          </button>`).join('')}
      </div>
      <div class="ai-placeholder">
        <p class="ai-placeholder__ref">${_esc(ref)}</p>
        <p class="ai-placeholder__hint">${_modeHint(_mode)}</p>
        <button class="ai-run-btn" id="ai-run-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Run AI
        </button>
        <p class="ai-byok-note">Uses your API key from Settings. Get a free Gemini key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" class="ai-byok-link">aistudio.google.com</a>.</p>
        ${savedHtml}
      </div>
    </div>`;

  // Mode tabs
  _container.querySelectorAll('.ai-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _mode = btn.dataset.mode;
      _container.querySelectorAll('.ai-mode-btn').forEach(b => {
        b.classList.toggle('ai-mode-btn--active', b.dataset.mode === _mode);
        b.setAttribute('aria-selected', b.dataset.mode === _mode);
      });
      _container.querySelector('.ai-placeholder__hint').textContent = _modeHint(_mode);
    });
  });

  document.getElementById('ai-run-btn')?.addEventListener('click', _runAi);

  // View saved note inline
  _container.querySelectorAll('.ai-saved-note__view').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = savedNotes.find(n => n.osisRef === btn.dataset.noteRef && n.mode === btn.dataset.noteMode);
      if (note) _renderSavedNote(note);
    });
  });

  // Export saved note
  _container.querySelectorAll('.ai-saved-note__export').forEach(btn => {
    btn.addEventListener('click', () => {
      _downloadNote(btn.dataset.label, btn.dataset.mode, btn.dataset.content);
    });
  });
}

// ── AI invocation ─────────────────────────────────────────────────────────────

async function _runAi() {
  if (!_passage) return;

  _abort?.abort();
  _renderStreaming();

  // Fetch chapter verses
  const verses = await getChapter(_passage.book, _passage.chapter);
  if (!verses.length) { _renderError('No verse data found.'); return; }

  // Determine which verses to use: range or single
  const verseEnd = _passage.verseEnd ?? _passage.verse;
  const selected = verses.filter(v => v.verse >= _passage.verse && v.verse <= verseEnd);
  if (!selected.length) { _renderError('No verse data found for this selection.'); return; }

  const combinedText = selected.map(v => `[${v.verse}] ${v.text}`).join(' ');

  const meta = getBook(_passage.book);
  const passage = {
    humanRef:   _passageLabel(_passage),
    osisId:     `${_passage.book}.${_passage.chapter}.${_passage.verse}`,
    verseCount: selected.length,
    text:       combinedText,
    textWeb:    combinedText,
    isNT:       meta?.testament === 'NT',
    isOT:       meta?.testament === 'OT',
    words:      [],
  };

  const translation = TRANSLATION_LICENCES.WEB;

  let prompt;
  if (_mode === 'analysis') {
    prompt = passageAnalysisPrompt(passage, translation, '', []);
  } else {
    prompt = paraphrasePrompt(passage, translation, _mode);
  }

  const output = _container.querySelector('#ai-output');
  let   full   = '';

  _abort = streamAiResponse(prompt.user, prompt.system, {
    provider: 'gemini',
    onChunk: (chunk) => {
      full += chunk;
      if (output) output.innerHTML = _renderMarkdown(full) + '<span class="ai-cursor">▋</span>';
    },
    onDone: (text) => {
      if (output) output.innerHTML = _renderMarkdown(text);
      _container.querySelector('.ai-stop-btn')?.remove();
      // Save to IDB
      const osisRef    = `${_passage.book}.${_passage.chapter}.${_passage.verse}`;
      const modeName   = MODES.find(m => m.id === _mode)?.label ?? _mode;
      const passLabel  = _passageLabel(_passage);
      saveAiNote(osisRef, _passage.book, _mode, modeName, passLabel, text).catch(() => {});
      _renderRerunBtn(text, passLabel, modeName);
    },
    onError: (err) => {
      _renderError(err.message);
    },
  });
}

// ── Streaming state ───────────────────────────────────────────────────────────

function _renderStreaming() {
  const ref = _passage ? _passageLabel(_passage) : '';
  _container.innerHTML = `
    <div class="ai-panel">
      <div class="ai-stream-header">
        <span class="ai-stream-label">${_esc(MODES.find(m => m.id === _mode)?.label || _mode)} — ${_esc(ref)}</span>
        <button class="ai-stop-btn" id="ai-stop-btn" title="Stop generating">■ Stop</button>
      </div>
      <div class="ai-output" id="ai-output">
        <span class="ai-cursor">▋</span>
      </div>
    </div>`;

  document.getElementById('ai-stop-btn')?.addEventListener('click', () => {
    _abort?.abort();
    _container.querySelector('.ai-cursor')?.remove();
    _renderRerunBtn();
  });
}

function _renderRerunBtn(content = null, passLabel = '', modeName = '') {
  const header = _container.querySelector('.ai-stream-header');
  if (!header) return;

  const rerunBtn = document.createElement('button');
  rerunBtn.className = 'ai-rerun-btn';
  rerunBtn.textContent = '↺ Regenerate';
  rerunBtn.addEventListener('click', _runAi);
  header.appendChild(rerunBtn);

  if (content) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'ai-export-btn';
    exportBtn.textContent = '↓ Export';
    exportBtn.title = 'Export as Markdown';
    exportBtn.addEventListener('click', () => _downloadNote(passLabel, modeName, content));
    header.appendChild(exportBtn);
  }

  const backBtn = document.createElement('button');
  backBtn.className = 'ai-back-btn';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', _renderPlaceholder);
  header.appendChild(backBtn);
}

function _renderSavedNote(note) {
  if (!_container) return;
  _container.innerHTML = `
    <div class="ai-panel">
      <div class="ai-stream-header">
        <span class="ai-stream-label">${_esc(note.modeName)} — ${_esc(note.passageLabel)}</span>
        <span class="ai-saved-badge">Saved ${new Date(note.generatedAt).toLocaleDateString()}</span>
      </div>
      <div class="ai-output">${_renderMarkdown(note.content)}</div>
    </div>`;

  const header = _container.querySelector('.ai-stream-header');
  const exportBtn = document.createElement('button');
  exportBtn.className = 'ai-export-btn';
  exportBtn.textContent = '↓ Export';
  exportBtn.addEventListener('click', () => _downloadNote(note.passageLabel, note.modeName, note.content));
  header.appendChild(exportBtn);

  const backBtn = document.createElement('button');
  backBtn.className = 'ai-back-btn';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', _renderPlaceholder);
  header.appendChild(backBtn);
}

function _downloadNote(passageLabel, modeName, content) {
  const header = `# ${modeName} — ${passageLabel}\n_Generated in Berean_\n\n`;
  const blob = new Blob([header + content], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `berean-${modeName.toLowerCase()}-${(passageLabel).replace(/[^a-z0-9]/gi, '-')}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function _renderError(msg) {
  if (!_container) return;
  const isNoKey = msg.toLowerCase().includes('no api key') || msg.toLowerCase().includes('no key');
  _container.innerHTML = `
    <div class="ai-panel">
      <div class="ai-error">
        <p class="ai-error__title">AI error</p>
        <p class="ai-error__body">${_esc(msg)}</p>
        ${isNoKey
          ? `<p class="ai-error__hint">A free Google Gemini key takes about 30 seconds to get at <strong>aistudio.google.com</strong>.</p>
             <button class="ai-run-btn" id="ai-settings-btn">⚙ Open Settings</button>`
          : `<p class="ai-error__hint">If you hit a rate limit, wait a moment and retry. Gemini's free tier allows ~1,500 requests/day.</p>
             <button class="ai-run-btn" id="ai-retry-btn">↺ Retry</button>`
        }
      </div>
    </div>`;
  document.getElementById('ai-retry-btn')?.addEventListener('click', _runAi);
  document.getElementById('ai-settings-btn')?.addEventListener('click', () => {
    import('../../state/eventbus.js').then(({ bus, EVENTS }) => bus.emit(EVENTS.MODAL_OPEN, 'settings'));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _passageLabel(p) {
  const meta = getBook(p.book);
  const name = meta?.name ?? p.book;
  if (p.verseEnd && p.verseEnd !== p.verse) {
    return `${name} ${p.chapter}:${p.verse}–${p.verseEnd}`;
  }
  return `${name} ${p.chapter}:${p.verse}`;
}

function _modeHint(mode) {
  const hints = {
    plain:      'Rewrite this passage in clear, simple modern English.',
    expository: 'Expand into an expository paraphrase that makes the theology explicit.',
    devotional: 'A warm, devotional paraphrase for personal Bible reading.',
    afrikaans:  'Translate into contemporary South African Afrikaans.',
    analysis:   'Structured exegesis: Observations → Interpretation → Application.',
  };
  return hints[mode] || '';
}

/**
 * Very minimal Markdown → HTML renderer for AI output.
 */
function _renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4 class="ai-h4">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 class="ai-h3">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/^\d+\.\s+(.+)$/gm, '<li class="ai-li">$1</li>')
    .replace(/^[-•]\s+(.+)$/gm, '<li class="ai-li ai-li--bullet">$1</li>')
    .replace(/^---+$/gm, '<hr class="ai-hr"/>')
    .replace(/(⚠️[^\n]+)/g, '<p class="ai-disclaimer">$1</p>')
    .replace(/\n\n+/g, '</p><p class="ai-p">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p class="ai-p">')
    .replace(/$/, '</p>');
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
