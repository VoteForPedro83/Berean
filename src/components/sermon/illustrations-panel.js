/* ============================================================
   illustrations-panel.js — Illustration library for sermon editor
   Stores illustrations in IDB IllustrationLibrary.
   Users add their own stories, stats, anecdotes, analogies.
   ============================================================ */
import { getDB } from '../../idb/schema.js';

// ── IDB helpers ───────────────────────────────────────────
async function _loadIllustrations(query = '') {
  try {
    const db  = await getDB();
    let   all = await db.getAll('IllustrationLibrary');
    all = all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(i =>
      i.title?.toLowerCase().includes(q) ||
      i.body?.toLowerCase().includes(q)  ||
      i.topic?.toLowerCase().includes(q));
  } catch { return []; }
}

async function _saveIllustration(data) {
  const db  = await getDB();
  const id  = data.id || crypto.randomUUID();
  const rec = { ...data, id, createdAt: data.createdAt || Date.now() };
  await db.put('IllustrationLibrary', rec);
  return rec;
}

async function _deleteIllustration(id) {
  const db = await getDB();
  await db.delete('IllustrationLibrary', id);
}

// ── Public API ────────────────────────────────────────────
export function openIllustrationsPanel(editor) {
  document.getElementById('se-illustrations-panel')?.remove();

  const panel = document.createElement('div');
  panel.id        = 'se-illustrations-panel';
  panel.className = 'se-side-panel';

  panel.innerHTML = `
    <div class="se-side-panel__header">
      <h3 class="se-side-panel__title">Illustration Library</h3>
      <button class="se-side-panel__close" id="se-illus-close" aria-label="Close">✕</button>
    </div>
    <div class="se-side-panel__search">
      <input type="search" id="se-illus-search" placeholder="Search illustrations…"
             autocomplete="off" />
    </div>
    <div class="se-side-panel__body" id="se-illus-body">
      <p class="se-illus-loading">Loading…</p>
    </div>
    <div class="se-side-panel__footer">
      <button class="se-illus-add-btn" id="se-illus-add">+ Add Illustration</button>
    </div>

    <!-- Add / Edit Form (hidden initially) -->
    <div class="se-illus-form" id="se-illus-form" hidden>
      <div class="se-side-panel__header">
        <h3 class="se-side-panel__title">New Illustration</h3>
        <button class="se-side-panel__close" id="se-illus-form-close" aria-label="Cancel">✕</button>
      </div>
      <div class="se-illus-form__body">
        <label class="se-cite-field">
          <span>Title</span>
          <input type="text" id="se-illus-title" placeholder="Short memorable title" />
        </label>
        <label class="se-cite-field">
          <span>Type</span>
          <select id="se-illus-type">
            <option value="story">Personal Story</option>
            <option value="analogy">Analogy</option>
            <option value="statistic">Statistic / Fact</option>
            <option value="quote">Quote</option>
            <option value="historical">Historical Event</option>
          </select>
        </label>
        <label class="se-cite-field">
          <span>Topic / Tag</span>
          <input type="text" id="se-illus-topic" placeholder="e.g. faith, grace, suffering" />
        </label>
        <label class="se-cite-field">
          <span>Content</span>
          <textarea id="se-illus-body" rows="5"
                    placeholder="The illustration content…"></textarea>
        </label>
        <label class="se-cite-field">
          <span>Source</span>
          <input type="text" id="se-illus-source" placeholder="Book, article, or personal" />
        </label>
      </div>
      <div class="se-illus-form__footer">
        <button class="se-illus-save-btn" id="se-illus-save">Save Illustration</button>
      </div>
    </div>`;

  const editorView = document.getElementById('se-editor-view');
  if (editorView) editorView.appendChild(panel);
  else document.body.appendChild(panel);

  // Wire close
  panel.querySelector('#se-illus-close').addEventListener('click', () => panel.remove());

  // Wire add form
  const form = panel.querySelector('#se-illus-form');
  panel.querySelector('#se-illus-add').addEventListener('click', () => {
    form.hidden = false;
    panel.querySelector('#se-illus-title').focus();
  });
  panel.querySelector('#se-illus-form-close').addEventListener('click', () => {
    form.hidden = true;
    _clearForm(panel);
  });

  // Save
  panel.querySelector('#se-illus-save').addEventListener('click', async () => {
    const rec = {
      title:  panel.querySelector('#se-illus-title').value.trim(),
      type:   panel.querySelector('#se-illus-type').value,
      topic:  panel.querySelector('#se-illus-topic').value.trim(),
      body:   panel.querySelector('#se-illus-body').value.trim(),
      source: panel.querySelector('#se-illus-source').value.trim(),
    };
    if (!rec.title || !rec.body) { alert('Please enter a title and content.'); return; }
    await _saveIllustration(rec);
    form.hidden = true;
    _clearForm(panel);
    await _renderList(panel, editor, '');
  });

  // Search
  let _searchTimer = null;
  panel.querySelector('#se-illus-search').addEventListener('input', e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => _renderList(panel, editor, e.target.value), 250);
  });

  _renderList(panel, editor, '');
}

async function _renderList(panel, editor, query) {
  const body  = panel.querySelector('#se-illus-body');
  const items = await _loadIllustrations(query);

  if (items.length === 0) {
    body.innerHTML = query
      ? `<p class="se-illus-empty">No illustrations match "${_esc(query)}".</p>`
      : `<p class="se-illus-empty">No illustrations yet. Add one to get started.</p>`;
    return;
  }

  const TYPE_LABELS = {
    story: 'Story', analogy: 'Analogy', statistic: 'Stat',
    quote: 'Quote', historical: 'History',
  };

  body.innerHTML = items.map(ill => `
    <div class="se-illus-item" data-id="${ill.id}">
      <div class="se-illus-item__hd">
        <span class="se-illus-item__type">${TYPE_LABELS[ill.type] || ill.type}</span>
        <strong class="se-illus-item__title">${_esc(ill.title)}</strong>
        ${ill.topic ? `<span class="se-illus-item__topic">${_esc(ill.topic)}</span>` : ''}
      </div>
      <p class="se-illus-item__preview">${_esc(ill.body.slice(0, 120))}${ill.body.length > 120 ? '…' : ''}</p>
      ${ill.source ? `<p class="se-illus-item__source">— ${_esc(ill.source)}</p>` : ''}
      <div class="se-illus-item__actions">
        <button class="se-illus-item__insert" data-id="${ill.id}">Insert into Sermon</button>
        <button class="se-illus-item__delete" data-id="${ill.id}" aria-label="Delete">✕</button>
      </div>
    </div>`).join('');

  // Insert
  body.querySelectorAll('.se-illus-item__insert').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ill = items.find(i => i.id === btn.dataset.id);
      if (!ill || !editor) return;
      editor.chain().focus().insertContent({
        type: 'illustrationBlock',
        attrs: { source: ill.source || '', sourceUrl: '' },
        content: ill.body.split('\n').filter(Boolean).map(line => ({
          type: 'paragraph',
          content: [{ type: 'text', text: line }],
        })),
      }).run();
      panel.remove();
    });
  });

  // Delete
  body.querySelectorAll('.se-illus-item__delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this illustration?')) return;
      await _deleteIllustration(btn.dataset.id);
      const q = panel.querySelector('#se-illus-search')?.value || '';
      await _renderList(panel, editor, q);
    });
  });
}

function _clearForm(panel) {
  ['#se-illus-title','#se-illus-topic','#se-illus-body','#se-illus-source'].forEach(sel => {
    const el = panel.querySelector(sel);
    if (el) el.value = '';
  });
  if (panel.querySelector('#se-illus-type')) panel.querySelector('#se-illus-type').value = 'story';
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
