/* ============================================================
   citations-panel.js — Citation manager for sermon editor
   Stores references in IDB CitationRegistry.
   Formats in Chicago style (manual, no external lib needed).
   ============================================================ */
import { getDB } from '../../idb/schema.js';

// ── Chicago-style formatter ───────────────────────────────
function _formatChicago(c) {
  const author    = c.author    || 'Unknown Author';
  const title     = c.title     || 'Untitled';
  const year      = c.year      ? c.year   : 'n.d.';
  const publisher = c.publisher || '';
  const journal   = c.journal   || '';
  const url       = c.url       || '';

  switch (c.type) {
    case 'article':
      return `${author}. "${title}." ${journal ? `*${journal}*` : 'Journal'} (${year}).`;
    case 'website':
      return `${author}. "${title}." Accessed ${new Date().toLocaleDateString('en-ZA')}.${url ? ' ' + url : ''}`;
    case 'commentary':
      return `${author}. *${title}*. ${publisher ? publisher + ', ' : ''}${year}.`;
    default: // book
      return `${author}. *${title}*. ${publisher ? publisher + ', ' : ''}${year}.`;
  }
}

// ── IDB helpers ───────────────────────────────────────────
async function _loadCitations() {
  try {
    const db  = await getDB();
    const all = await db.getAll('CitationRegistry');
    return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch { return []; }
}

async function _saveCitation(data) {
  const db   = await getDB();
  const id   = data.citationId || crypto.randomUUID();
  const rec  = { ...data, citationId: id, createdAt: data.createdAt || Date.now() };
  await db.put('CitationRegistry', rec);
  return rec;
}

async function _deleteCitation(id) {
  const db = await getDB();
  await db.delete('CitationRegistry', id);
}

// ── Public API ────────────────────────────────────────────
export function openCitationsPanel(editor) {
  // Remove any existing panel
  document.getElementById('se-citations-panel')?.remove();

  const panel = document.createElement('div');
  panel.id        = 'se-citations-panel';
  panel.className = 'se-side-panel';

  panel.innerHTML = `
    <div class="se-side-panel__header">
      <h3 class="se-side-panel__title">Citations</h3>
      <button class="se-side-panel__close" id="se-cite-close" aria-label="Close">✕</button>
    </div>
    <div class="se-side-panel__body" id="se-cite-body">
      <p class="se-cite-loading">Loading…</p>
    </div>
    <div class="se-side-panel__footer">
      <button class="se-cite-add-btn" id="se-cite-add">+ Add Citation</button>
    </div>

    <!-- Add / Edit Form (hidden initially) -->
    <div class="se-cite-form" id="se-cite-form" hidden>
      <div class="se-side-panel__header">
        <h3 class="se-side-panel__title">New Citation</h3>
        <button class="se-side-panel__close" id="se-cite-form-close" aria-label="Cancel">✕</button>
      </div>
      <div class="se-cite-form__body">
        <label class="se-cite-field">
          <span>Type</span>
          <select id="se-cite-type">
            <option value="book">Book</option>
            <option value="commentary">Commentary</option>
            <option value="article">Journal Article</option>
            <option value="website">Website</option>
          </select>
        </label>
        <label class="se-cite-field">
          <span>Author(s)</span>
          <input type="text" id="se-cite-author" placeholder="Last, First" />
        </label>
        <label class="se-cite-field">
          <span>Title</span>
          <input type="text" id="se-cite-title" placeholder="Title of work" />
        </label>
        <label class="se-cite-field">
          <span>Year</span>
          <input type="text" id="se-cite-year" placeholder="2024" maxlength="4" style="width:6rem"/>
        </label>
        <label class="se-cite-field">
          <span>Publisher / Journal</span>
          <input type="text" id="se-cite-publisher" placeholder="Zondervan" />
        </label>
        <label class="se-cite-field" id="se-cite-url-row">
          <span>URL</span>
          <input type="url" id="se-cite-url" placeholder="https://…" />
        </label>
        <label class="se-cite-field">
          <span>Notes</span>
          <input type="text" id="se-cite-notes" placeholder="Page numbers, chapter, etc." />
        </label>
      </div>
      <div class="se-cite-form__footer">
        <button class="se-cite-save-btn" id="se-cite-save">Save Citation</button>
      </div>
    </div>`;

  // Mount inside the editor view container
  const editorView = document.getElementById('se-editor-view');
  if (editorView) editorView.appendChild(panel);
  else document.body.appendChild(panel);

  // Wire close
  panel.querySelector('#se-cite-close').addEventListener('click', () => panel.remove());

  // Wire Add button ↔ form toggle
  const form = panel.querySelector('#se-cite-form');
  panel.querySelector('#se-cite-add').addEventListener('click', () => {
    form.hidden = false;
    panel.querySelector('#se-cite-author').focus();
  });
  panel.querySelector('#se-cite-form-close').addEventListener('click', () => {
    form.hidden = true;
    _clearForm(panel);
  });

  // Show/hide URL field for website type
  panel.querySelector('#se-cite-type').addEventListener('change', e => {
    panel.querySelector('#se-cite-url-row').hidden = e.target.value !== 'website';
  });
  panel.querySelector('#se-cite-url-row').hidden = true;

  // Save citation
  panel.querySelector('#se-cite-save').addEventListener('click', async () => {
    const rec = {
      type:      panel.querySelector('#se-cite-type').value,
      author:    panel.querySelector('#se-cite-author').value.trim(),
      title:     panel.querySelector('#se-cite-title').value.trim(),
      year:      panel.querySelector('#se-cite-year').value.trim(),
      publisher: panel.querySelector('#se-cite-publisher').value.trim(),
      url:       panel.querySelector('#se-cite-url').value.trim(),
      notes:     panel.querySelector('#se-cite-notes').value.trim(),
    };
    if (!rec.title) { alert('Please enter a title.'); return; }
    await _saveCitation(rec);
    form.hidden = true;
    _clearForm(panel);
    await _renderList(panel, editor);
  });

  // Initial render
  _renderList(panel, editor);
}

async function _renderList(panel, editor) {
  const body      = panel.querySelector('#se-cite-body');
  const citations = await _loadCitations();

  if (citations.length === 0) {
    body.innerHTML = `<p class="se-cite-empty">No citations yet. Add one to get started.</p>`;
    return;
  }

  // Assign display numbers (order of creation, oldest first)
  const ordered = [...citations].reverse();

  body.innerHTML = ordered.map((c, i) => `
    <div class="se-cite-item" data-cid="${c.citationId}">
      <div class="se-cite-item__num">[${i + 1}]</div>
      <div class="se-cite-item__body">
        <p class="se-cite-item__formatted">${_esc(_formatChicago(c))}</p>
        ${c.notes ? `<p class="se-cite-item__notes">${_esc(c.notes)}</p>` : ''}
      </div>
      <div class="se-cite-item__actions">
        <button class="se-cite-item__insert" data-cid="${c.citationId}" data-label="${i + 1}"
                title="Insert footnote marker at cursor">Insert</button>
        <button class="se-cite-item__delete" data-cid="${c.citationId}"
                title="Delete citation" aria-label="Delete">✕</button>
      </div>
    </div>`).join('');

  // Insert button
  body.querySelectorAll('.se-cite-item__insert').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!editor) return;
      editor.chain().focus().insertContent({
        type: 'citationNote',
        attrs: { citationId: btn.dataset.cid, label: `[${btn.dataset.label}]` },
      }).run();
      panel.remove();
    });
  });

  // Delete button
  body.querySelectorAll('.se-cite-item__delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this citation?')) return;
      await _deleteCitation(btn.dataset.cid);
      await _renderList(panel, editor);
    });
  });
}

function _clearForm(panel) {
  ['#se-cite-author','#se-cite-title','#se-cite-year','#se-cite-publisher',
   '#se-cite-url','#se-cite-notes'].forEach(sel => {
    const el = panel.querySelector(sel);
    if (el) el.value = '';
  });
  panel.querySelector('#se-cite-type').value = 'book';
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}
