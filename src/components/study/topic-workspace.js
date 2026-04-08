/* ============================================================
   topic-workspace.js — Topic Study Workspace

   A curated verse collection panel. The pastor can:
   - Create named topics (e.g. "Grace", "Resurrection")
   - Add verses by OSIS reference or drag from reading pane
   - Reorder verses within a topic with SortableJS
   - Add personal notes to each verse
   - Export topic as a text file or study session

   Stored in IDB TopicWorkspace store.
   Rendered as a sidebar view (sidebar nav item).
   ============================================================ */

import { getDB }   from '../../idb/schema.js';
import { bus, EVENTS } from '../../state/eventbus.js';
import { getChapter }  from '../../db/bible.js';
import { BOOK_MAP }    from '../../data/books.js';

// ── IDB helpers ───────────────────────────────────────────

async function listTopics() {
  try {
    const db = await getDB();
    const all = await db.getAll('TopicWorkspace');
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

async function getTopic(id) {
  const db = await getDB();
  return db.get('TopicWorkspace', id);
}

async function saveTopic(topic) {
  const db = await getDB();
  topic.updatedAt = Date.now();
  await db.put('TopicWorkspace', topic);
  return topic;
}

async function deleteTopic(id) {
  const db = await getDB();
  await db.delete('TopicWorkspace', id);
}

function _newId() {
  return crypto.randomUUID().slice(0, 8);
}

// ── Module state ──────────────────────────────────────────

let _container   = null;
let _view        = 'list';  // 'list' | 'editor'
let _currentId   = null;
let _sortable    = null;

// ── Public API ────────────────────────────────────────────

export function initTopicWorkspace(containerEl) {
  _container = containerEl;
  _showList();
}

// ── List view ─────────────────────────────────────────────

async function _showList() {
  _view = 'list';
  _currentId = null;
  const topics = await listTopics();

  _container.innerHTML = `
    <div class="tw">
      <div class="tw__header">
        <h2 class="tw__title">Topic Studies</h2>
        <button class="tw__new-btn" id="tw-new">+ New Topic</button>
      </div>
      ${topics.length === 0 ? `
        <p class="tw__empty">No topics yet. Click "+ New Topic" to start curating verses by theme.</p>
      ` : topics.map(t => `
        <div class="tw__card" data-topic-id="${t.id}">
          <div class="tw__card-body">
            <h3 class="tw__card-name">${_esc(t.name)}</h3>
            <p class="tw__card-meta">${t.verses?.length ?? 0} verse${t.verses?.length === 1 ? '' : 's'}</p>
          </div>
          <div class="tw__card-actions">
            <button class="tw__icon-btn tw__icon-btn--delete" data-delete="${t.id}" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>`).join('')}
    </div>`;

  document.getElementById('tw-new')?.addEventListener('click', _createTopic);

  _container.addEventListener('click', async e => {
    const del = e.target.closest('[data-delete]');
    if (del) {
      e.stopPropagation();
      if (confirm('Delete this topic?')) { await deleteTopic(del.dataset.delete); _showList(); }
      return;
    }
    const card = e.target.closest('[data-topic-id]');
    if (card) _openEditor(card.dataset.topicId);
  });
}

async function _createTopic() {
  const name = prompt('Topic name (e.g. "Grace", "Resurrection"):');
  if (!name?.trim()) return;
  const topic = await saveTopic({ id: _newId(), name: name.trim(), verses: [], updatedAt: 0 });
  _openEditor(topic.id);
}

// ── Editor view ───────────────────────────────────────────

async function _openEditor(id) {
  const topic = await getTopic(id);
  if (!topic) { _showList(); return; }
  _currentId = id;
  _view = 'editor';

  _container.innerHTML = `
    <div class="tw">
      <div class="tw__header">
        <button class="tw__back-btn" id="tw-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <input type="text" class="tw__name-input" id="tw-name" value="${_esc(topic.name)}" />
        <button class="tw__export-btn" id="tw-export" title="Export as text">↓</button>
      </div>

      <div class="tw__add-row">
        <input type="text" class="tw__ref-input" id="tw-ref-input"
               placeholder="Add verse (e.g. John 3:16)" />
        <button class="tw__add-verse-btn" id="tw-add-verse">Add</button>
      </div>

      <div class="tw__verse-list" id="tw-verse-list">
        ${topic.verses.length === 0
          ? '<p class="tw__empty" id="tw-empty-msg">No verses yet. Type a reference above to add one.</p>'
          : topic.verses.map((v, i) => _renderVerseCard(v, i)).join('')}
      </div>
    </div>`;

  document.getElementById('tw-back')?.addEventListener('click', async () => {
    await _saveCurrentState();
    _showList();
  });

  document.getElementById('tw-name')?.addEventListener('change', _saveCurrentState);

  document.getElementById('tw-add-verse')?.addEventListener('click', _addVerseFromInput);
  document.getElementById('tw-ref-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _addVerseFromInput();
  });

  document.getElementById('tw-export')?.addEventListener('click', () => _exportTopic(topic));

  // Note editing
  _container.addEventListener('input', e => {
    if (e.target.matches('.tw__verse-note')) _debouncedSave();
  });

  // Delete verse
  _container.addEventListener('click', async e => {
    const btn = e.target.closest('[data-remove-verse]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.removeVerse);
    await _saveCurrentState();
    const t = await getTopic(_currentId);
    if (!t) return;
    t.verses.splice(idx, 1);
    await saveTopic(t);
    _openEditor(_currentId);
  });

  // SortableJS for drag reorder
  _initSortable();
}

function _renderVerseCard(v, i) {
  return `
    <div class="tw__verse-card" data-verse-idx="${i}">
      <div class="tw__verse-header">
        <span class="tw__verse-ref">${_esc(v.ref)}</span>
        <button class="tw__icon-btn" data-remove-verse="${i}" title="Remove">×</button>
      </div>
      <p class="tw__verse-text">${_esc(v.text || '')}</p>
      <textarea class="tw__verse-note" rows="2"
                placeholder="Notes…" data-idx="${i}">${_esc(v.note || '')}</textarea>
    </div>`;
}

async function _addVerseFromInput() {
  const input = document.getElementById('tw-ref-input');
  const raw = input?.value?.trim();
  if (!raw) return;

  // Parse "Book Chapter:Verse" — simplified parser
  const match = raw.match(/^(.+?)\s+(\d+)(?::(\d+))?$/);
  if (!match) { _flash('Use format: Book Chapter:Verse (e.g. John 3:16)'); return; }

  const bookRaw  = match[1].trim();
  const chapter  = parseInt(match[2]);
  const verse    = match[3] ? parseInt(match[3]) : null;

  // Find book by name
  let bookOsis = null;
  for (const [osis, meta] of BOOK_MAP) {
    if (meta.name.toLowerCase().startsWith(bookRaw.toLowerCase()) ||
        meta.abbr.toLowerCase() === bookRaw.toLowerCase()) {
      bookOsis = osis;
      break;
    }
  }
  if (!bookOsis) { _flash(`Book not found: "${bookRaw}"`); return; }

  const ref = verse
    ? `${BOOK_MAP.get(bookOsis).name} ${chapter}:${verse}`
    : `${BOOK_MAP.get(bookOsis).name} ${chapter}`;

  // Fetch verse text
  let text = '';
  try {
    const verses = await getChapter(bookOsis, chapter);
    if (verse) {
      text = verses.find(v => v.verse === verse)?.text || '';
    } else {
      text = verses.map(v => `[${v.verse}] ${v.text}`).join(' ');
    }
  } catch { /* text stays empty */ }

  const topic = await getTopic(_currentId);
  if (!topic) return;
  topic.verses.push({ ref, osisRef: `${bookOsis}.${chapter}.${verse ?? 1}`, text, note: '' });
  await saveTopic(topic);

  if (input) input.value = '';

  // Re-render verse list only
  const list = document.getElementById('tw-verse-list');
  if (list) list.innerHTML = topic.verses.map((v, i) => _renderVerseCard(v, i)).join('');
  _initSortable();
}

let _saveTimer = null;
function _debouncedSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_saveCurrentState, 800);
}

async function _saveCurrentState() {
  if (!_currentId) return;
  const topic = await getTopic(_currentId);
  if (!topic) return;

  const nameEl = document.getElementById('tw-name');
  if (nameEl) topic.name = nameEl.value || topic.name;

  // Collect notes from textareas
  _container.querySelectorAll('.tw__verse-note').forEach(ta => {
    const idx = parseInt(ta.dataset.idx);
    if (!isNaN(idx) && topic.verses[idx]) topic.verses[idx].note = ta.value;
  });

  await saveTopic(topic);
}

async function _initSortable() {
  const list = document.getElementById('tw-verse-list');
  if (!list) return;
  if (_sortable) { _sortable.destroy(); _sortable = null; }
  try {
    const { default: Sortable } = await import('sortablejs');
    _sortable = new Sortable(list, {
      animation: 150,
      handle: '.tw__verse-ref',
      ghostClass: 'tw__verse-card--ghost',
      onEnd: async ({ oldIndex, newIndex }) => {
        if (oldIndex === newIndex) return;
        const topic = await getTopic(_currentId);
        if (!topic) return;
        const [moved] = topic.verses.splice(oldIndex, 1);
        topic.verses.splice(newIndex, 0, moved);
        await saveTopic(topic);
        // Update data-idx on textareas without full re-render
        list.querySelectorAll('.tw__verse-note').forEach((ta, i) => {
          ta.dataset.idx = i;
        });
      },
    });
  } catch { /* SortableJS failed — drag-to-reorder unavailable */ }
}

async function _exportTopic(topicOrId) {
  const topic = typeof topicOrId === 'string' ? await getTopic(topicOrId) : topicOrId;
  if (!topic) return;

  let txt = `${topic.name}\n${'='.repeat(topic.name.length)}\n\n`;
  for (const v of topic.verses) {
    txt += `${v.ref}\n${v.text || ''}\n`;
    if (v.note) txt += `Note: ${v.note}\n`;
    txt += '\n';
  }

  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `${topic.name.replace(/\s+/g,'_')}.txt`,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _flash(msg) {
  const input = document.getElementById('tw-ref-input');
  if (!input) return;
  input.placeholder = msg;
  setTimeout(() => { input.placeholder = 'Add verse (e.g. John 3:16)'; }, 2500);
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
