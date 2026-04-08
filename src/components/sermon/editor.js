/* ============================================================
   editor.js — TipTap sermon editor (Stage 5)
   Full rich-text editor with custom sermon nodes,
   sermon list management, and auto-save to IndexedDB.
   ============================================================ */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

import { ScriptureBlock }    from './nodes/scripture-block.js';
import { PointHeading }      from './nodes/point-heading.js';
import { ApplicationBlock }  from './nodes/application-block.js';
import { IllustrationBlock } from './nodes/illustration-block.js';
import { ClippingBlock }     from './nodes/clipping-block.js';
import { CitationNote }      from './nodes/citation-note.js';

import { createSermon, getSermon, updateSermon, deleteSermon, listSermons }
  from '../../idb/sermons.js';
import { openCitationsPanel }    from './citations-panel.js';
import { openIllustrationsPanel } from './illustrations-panel.js';
import { initPreachingCalendar }  from './preaching-calendar.js';
import { openClippingsTray, _updateBadge } from '../bible/clippings.js';
import { getClippingCount }       from '../../idb/clippings.js';
import { exportSermonText, exportSermonPdf, exportSermonMarkdown, exportSermonHtml } from './export.js';
import { launchPresentation } from './presentation.js';
import { bus, EVENTS }            from '../../state/eventbus.js';

// ── Module state ──────────────────────────────────────────
let _editor          = null;
let _container       = null;
let _currentSermonId = null;
let _autoSaveTimer   = null;
let _view            = 'list';   // 'list' | 'editor'

// ── Public API ────────────────────────────────────────────
export function initSermonEditor(containerEl) {
  _container = containerEl;
  _renderShell();
  _wireShellEvents();
  _showList();

  // Keep badge in sync with clippings added from the Bible reader
  bus.on(EVENTS.CLIPPING_ADDED, () => _updateBadge());
}

// ── Shell ─────────────────────────────────────────────────
function _renderShell() {
  _container.innerHTML = `
    <!-- ─── Editor view ──────────────────────────────── -->
    <div class="se-editor-view" id="se-editor-view" hidden>
      <div class="se-header">
        <button class="se-header__back" id="se-back" title="Back to sermon list" aria-label="Back to sermon list">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <input type="text" class="se-header__title" id="se-title"
               placeholder="Sermon Title" spellcheck="false" />
        <span class="se-header__status" id="se-status"></span>
        <div class="se-header__export">
          <button class="se-header__btn" id="se-export-txt" title="Export as TXT">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button class="se-header__btn" id="se-export-pdf" title="Export as PDF">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button class="se-header__btn" id="se-export-md" title="Export as Markdown">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button class="se-header__btn" id="se-export-html" title="Export as standalone HTML (offline)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
        </div>
        <button class="se-header__btn" id="se-present" title="Presentation mode">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        </button>
        <button class="se-header__btn se-header__btn--danger" id="se-delete" title="Delete sermon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      <div class="se-toolbar" id="se-toolbar">
        <div class="se-toolbar__group">
          <button data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
          <button data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
          <button data-cmd="strike" title="Strikethrough"><s>S</s></button>
        </div>
        <div class="se-toolbar__sep"></div>
        <div class="se-toolbar__group">
          <button data-cmd="heading" data-level="2" title="Heading 2">H2</button>
          <button data-cmd="heading" data-level="3" title="Heading 3">H3</button>
        </div>
        <div class="se-toolbar__sep"></div>
        <div class="se-toolbar__group">
          <button data-cmd="bulletList" title="Bullet list">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>
          </button>
          <button data-cmd="orderedList" title="Numbered list">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="3" y="7" font-size="8" fill="currentColor" font-family="sans-serif">1</text><text x="3" y="13" font-size="8" fill="currentColor" font-family="sans-serif">2</text><text x="3" y="19" font-size="8" fill="currentColor" font-family="sans-serif">3</text></svg>
          </button>
        </div>
        <div class="se-toolbar__sep"></div>
        <div class="se-toolbar__group se-toolbar__group--blocks">
          <button data-cmd="scriptureBlock" title="Insert Scripture quotation" class="se-toolbar__block-btn">
            <span class="se-toolbar__block-icon" style="color:var(--color-accent-gold)">&#x275D;</span> Scripture
          </button>
          <button data-cmd="pointMain" title="Insert main sermon point" class="se-toolbar__block-btn">
            <span class="se-toolbar__block-icon" style="color:var(--color-accent-gold)">I.</span> Point
          </button>
          <button data-cmd="pointSub" title="Insert sub-point" class="se-toolbar__block-btn">
            <span class="se-toolbar__block-icon" style="color:var(--color-ink-secondary)">a.</span> Sub
          </button>
          <button data-cmd="applicationBlock" title="Insert application / action step" class="se-toolbar__block-btn">
            <span class="se-toolbar__block-icon" style="color:var(--color-accent-sage)">&#x279C;</span> Apply
          </button>
          <button data-cmd="illustrationBlock" title="Insert illustration / story" class="se-toolbar__block-btn">
            <span class="se-toolbar__block-icon" style="color:var(--color-accent-burgundy)">&#x2736;</span> Illustrate
          </button>
        </div>
        <div class="se-toolbar__sep"></div>
        <div class="se-toolbar__group">
          <button data-cmd="openCitations" title="Citation manager — insert footnote reference" class="se-toolbar__block-btn">
            <span class="se-toolbar__block-icon" style="color:var(--color-ink-secondary)">&#x00B9;</span> Cite
          </button>
          <button data-cmd="openLibrary" title="Illustration library — insert saved illustration" class="se-toolbar__block-btn">
            <span class="se-toolbar__block-icon" style="color:var(--color-accent-sage)">&#x2605;</span> Library
          </button>
          <button data-cmd="openClippings" title="Clippings tray — verses saved from the Bible reader" class="se-toolbar__block-btn se-toolbar__block-btn--clippings">
            <span class="se-toolbar__block-icon" style="color:var(--color-accent-gold)">&#x2398;</span> Clippings
            <span class="se-clippings-badge" id="se-clippings-badge" hidden></span>
          </button>
        </div>
      </div>

      <div class="se-editor-scroll" id="se-editor-scroll">
        <div id="se-editor" class="se-editor"></div>
      </div>
    </div>

    <!-- ─── List view ────────────────────────────────── -->
    <div class="se-list-view" id="se-list-view">
      <div class="se-list-header">
        <h2 class="se-list-header__title">Sermon Builder</h2>
        <div class="se-list-header__tabs">
          <button class="se-list-tab se-list-tab--active" data-view="sermons">Sermons</button>
          <button class="se-list-tab" data-view="calendar">Calendar</button>
        </div>
        <button class="se-list-header__new" id="se-new-btn">+ New Sermon</button>
      </div>
      <div id="se-list-items"></div>
      <div id="se-calendar-view" hidden></div>
    </div>`;
}

// ── Wire shell events (buttons, toolbar) ──────────────────
function _wireShellEvents() {
  // Back to list
  document.getElementById('se-back')?.addEventListener('click', () => _showList());

  // New sermon from list
  document.getElementById('se-new-btn')?.addEventListener('click', () => _createAndOpen());

  // Export TXT
  document.getElementById('se-export-txt')?.addEventListener('click', async () => {
    if (!_editor || !_currentSermonId) return;
    const title = document.getElementById('se-title')?.value || 'Sermon';
    try {
      await exportSermonText(_editor, title);
    } catch (err) {
      alert('Failed to export: ' + err.message);
    }
  });

  // Export PDF
  document.getElementById('se-export-pdf')?.addEventListener('click', () => {
    if (!_editor || !_currentSermonId) return;
    try {
      exportSermonPdf(_editor, document.getElementById('se-title')?.value || 'Sermon');
    } catch (err) {
      alert('Failed to export PDF: ' + err.message);
    }
  });

  // Export Markdown
  document.getElementById('se-export-md')?.addEventListener('click', async () => {
    if (!_editor || !_currentSermonId) return;
    const title = document.getElementById('se-title')?.value || 'Sermon';
    try {
      await exportSermonMarkdown(_editor, title);
    } catch (err) {
      alert('Failed to export Markdown: ' + err.message);
    }
  });

  // Export HTML
  document.getElementById('se-export-html')?.addEventListener('click', async () => {
    if (!_editor || !_currentSermonId) return;
    const title = document.getElementById('se-title')?.value || 'Sermon';
    try {
      await exportSermonHtml(_editor, title);
    } catch (err) {
      alert('Failed to export HTML: ' + err.message);
    }
  });

  // Presentation mode
  document.getElementById('se-present')?.addEventListener('click', () => {
    if (!_editor) return;
    const title = document.getElementById('se-title')?.value || 'Sermon';
    const html = document.querySelector('.se-editor')?.innerHTML || '';
    launchPresentation(title, html);
  });

  // Delete sermon
  document.getElementById('se-delete')?.addEventListener('click', async () => {
    if (!_currentSermonId) return;
    if (!confirm('Delete this sermon? This cannot be undone.')) return;
    await deleteSermon(_currentSermonId);
    _currentSermonId = null;
    _showList();
  });

  // Title edit → save
  const titleInput = document.getElementById('se-title');
  titleInput?.addEventListener('input', () => {
    _scheduleTitleSave(titleInput.value);
  });

  // Toolbar commands
  document.getElementById('se-toolbar')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-cmd]');
    if (!btn || !_editor) return;
    _runToolbarCommand(btn.dataset.cmd, btn.dataset);
  });

  // Sermon list clicks
  document.getElementById('se-list-items')?.addEventListener('click', e => {
    const card = e.target.closest('[data-sermon-id]');
    if (!card) return;
    _openSermon(card.dataset.sermonId);
  });

  // List / Calendar tab switching
  let _calendarInited = false;
  document.querySelector('.se-list-view')?.addEventListener('click', e => {
    const tab = e.target.closest('.se-list-tab');
    if (!tab) return;
    const view = tab.dataset.view;
    document.querySelectorAll('.se-list-tab').forEach(t =>
      t.classList.toggle('se-list-tab--active', t.dataset.view === view));
    const listEl = document.getElementById('se-list-items');
    const calEl  = document.getElementById('se-calendar-view');
    const newBtn = document.getElementById('se-new-btn');
    if (view === 'calendar') {
      listEl?.setAttribute('hidden', '');
      newBtn?.setAttribute('hidden', '');
      calEl?.removeAttribute('hidden');
      if (!_calendarInited) {
        _calendarInited = true;
        initPreachingCalendar(calEl);
      }
    } else {
      calEl?.setAttribute('hidden', '');
      newBtn?.removeAttribute('hidden');
      listEl?.removeAttribute('hidden');
    }
  });
}

// ── Toolbar command dispatch ──────────────────────────────
function _runToolbarCommand(cmd, data) {
  const chain = _editor.chain().focus();

  switch (cmd) {
    case 'bold':        chain.toggleBold().run(); break;
    case 'italic':      chain.toggleItalic().run(); break;
    case 'strike':      chain.toggleStrike().run(); break;
    case 'heading':     chain.toggleHeading({ level: parseInt(data.level) }).run(); break;
    case 'bulletList':  chain.toggleBulletList().run(); break;
    case 'orderedList': chain.toggleOrderedList().run(); break;

    case 'scriptureBlock':
      chain.insertContent({
        type: 'scriptureBlock',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter verse reference and text...' }] }],
      }).run();
      break;

    case 'pointMain':
      chain.insertContent({
        type: 'pointHeading',
        attrs: { level: 'main' },
        content: [{ type: 'text', text: 'Main Point' }],
      }).run();
      break;

    case 'pointSub':
      chain.insertContent({
        type: 'pointHeading',
        attrs: { level: 'sub' },
        content: [{ type: 'text', text: 'Sub-point' }],
      }).run();
      break;

    case 'applicationBlock':
      chain.insertContent({
        type: 'applicationBlock',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Application: What should we do with this?' }] }],
      }).run();
      break;

    case 'illustrationBlock':
      chain.insertContent({
        type: 'illustrationBlock',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Illustration: Tell the story...' }] }],
      }).run();
      break;

    case 'openCitations':
      openCitationsPanel(_editor);
      break;

    case 'openLibrary':
      openIllustrationsPanel(_editor);
      break;

    case 'openClippings':
      openClippingsTray(_editor);
      break;
  }
}

// ── Sermon list view ──────────────────────────────────────
async function _showList() {
  _view = 'list';
  document.getElementById('se-editor-view')?.setAttribute('hidden', '');
  document.getElementById('se-list-view')?.removeAttribute('hidden');

  // Destroy editor to free memory
  if (_editor) { _editor.destroy(); _editor = null; }
  clearTimeout(_autoSaveTimer);
  _currentSermonId = null;

  const sermons = await listSermons();
  const listEl  = document.getElementById('se-list-items');
  if (!listEl) return;

  if (sermons.length === 0) {
    listEl.innerHTML = `
      <div class="se-list-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted)" stroke-width="1.25">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <p class="se-list-empty__title">No sermons yet</p>
        <p class="se-list-empty__body">Start writing your first sermon — notes, outlines, and full manuscripts all in one place.</p>
        <button class="se-list-empty__btn" id="se-empty-new">+ New Sermon</button>
      </div>`;
    document.getElementById('se-empty-new')?.addEventListener('click', () => _createAndOpen());
    return;
  }

  listEl.innerHTML = sermons.map(s => {
    const date = new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const words = s.wordCount ? `${s.wordCount.toLocaleString()} words` : 'Empty';
    return `
      <div class="se-sermon-card" data-sermon-id="${s.id}">
        <h3 class="se-sermon-card__title">${_esc(s.title)}</h3>
        <p class="se-sermon-card__meta">${s.osisAnchor ? _esc(s.osisAnchor) + ' · ' : ''}${date}</p>
        <p class="se-sermon-card__words">${words}</p>
      </div>`;
  }).join('');
}

// ── Create and open a new sermon ──────────────────────────
async function _createAndOpen() {
  const sermon = await createSermon({ title: 'Untitled Sermon' });
  await _openSermon(sermon.id);
}

// ── Open an existing sermon ───────────────────────────────
async function _openSermon(id) {
  const sermon = await getSermon(id);
  if (!sermon) return;

  _currentSermonId = id;
  _view = 'editor';

  document.getElementById('se-list-view')?.setAttribute('hidden', '');
  document.getElementById('se-editor-view')?.removeAttribute('hidden');

  // Set title
  const titleInput = document.getElementById('se-title');
  if (titleInput) titleInput.value = sermon.title;

  // Init TipTap editor
  if (_editor) _editor.destroy();

  _editor = new Editor({
    element: document.getElementById('se-editor'),
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      ScriptureBlock,
      PointHeading,
      ApplicationBlock,
      IllustrationBlock,
      ClippingBlock,
      CitationNote,
    ],
    content: sermon.content || '<p>Start writing your sermon here...</p>',
    editorProps: {
      attributes: {
        class: 'sermon-prosemirror',
        spellcheck: 'true',
      },
    },
    onUpdate: () => _scheduleContentSave(),
  });

  _setStatus('saved');

  // Show how many clippings are waiting in the tray
  getClippingCount().then(n => {
    const badge = document.getElementById('se-clippings-badge');
    if (!badge) return;
    badge.textContent = n > 0 ? String(n) : '';
    badge.hidden = n === 0;
  });
}

// ── Auto-save (debounced 3s) ──────────────────────────────
function _scheduleContentSave() {
  clearTimeout(_autoSaveTimer);
  _setStatus('unsaved');
  _autoSaveTimer = setTimeout(async () => {
    if (!_currentSermonId || !_editor) return;
    _setStatus('saving');
    try {
      const json = _editor.getJSON();
      const text = _editor.getText();
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      await updateSermon(_currentSermonId, { content: json, wordCount });
      _setStatus('saved');
    } catch (err) {
      console.error('[sermon] save failed:', err);
      _setStatus('error');
    }
  }, 3000);
}

let _titleSaveTimer = null;
function _scheduleTitleSave(title) {
  clearTimeout(_titleSaveTimer);
  _titleSaveTimer = setTimeout(async () => {
    if (!_currentSermonId) return;
    await updateSermon(_currentSermonId, { title });
  }, 1000);
}

// ── Status indicator ──────────────────────────────────────
function _setStatus(status) {
  const el = document.getElementById('se-status');
  if (!el) return;
  const map = {
    saved:   { text: 'Saved', cls: 'se-status--saved' },
    unsaved: { text: 'Unsaved', cls: 'se-status--unsaved' },
    saving:  { text: 'Saving...', cls: 'se-status--saving' },
    error:   { text: 'Save failed', cls: 'se-status--error' },
  };
  const s = map[status] || map.saved;
  el.textContent = s.text;
  el.className = `se-header__status ${s.cls}`;
}

// ── Helpers ───────────────────────────────────────────────
function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
