/* ============================================================
   creator.js — Study Session Creator

   Opened from the sermon editor. Lets the pastor create a
   shareable Bible study pack from their sermon:
   - Title + passage auto-populated from sermon
   - Scripture text included
   - Sermon outline extracted from TipTap JSON
   - Discussion questions (free-form)
   - Leader notes
   - Publish → QR code + share URL
   ============================================================ */
import { createStudyPack, updateStudyPack, listStudyPacks, deleteStudyPack }
  from '../../idb/study-packs.js';
import { getSermon, listSermons } from '../../idb/sermons.js';
import { getChapter }             from '../../db/bible.js';
import { getBook }                from '../../data/books.js';
import { state }                  from '../../state/study-mode.js';
import { publishStudyPack }       from './publisher.js';
import { renderQrCode }           from './qr-display.js';

let _container = null;
let _view      = 'list';   // 'list' | 'editor' | 'share'
let _currentPack = null;

// ── Public API ───────────────────────────────────────────────

export function initStudySessionCreator(containerEl) {
  _container = containerEl;
  _showList();
}

// ── List view ────────────────────────────────────────────────

async function _showList() {
  _view = 'list';
  _currentPack = null;

  const packs   = await listStudyPacks();
  const sermons = await listSermons();

  _container.innerHTML = `
    <div class="ss">
      <div class="ss__header">
        <h2 class="ss__title">Study Sessions</h2>
        <button class="ss__new-btn" id="ss-new">+ New Study</button>
      </div>
      ${sermons.length === 0 ? `
        <p class="ss__empty">Create a sermon first, then come back here to turn it into a shareable study session.</p>
      ` : ''}
      ${packs.length === 0 && sermons.length > 0 ? `
        <p class="ss__empty">No study sessions yet. Click "+ New Study" to create one from a sermon.</p>
      ` : ''}
      ${packs.map(p => {
        const date = new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        return `
          <div class="ss__card" data-pack-id="${p.id}">
            <div class="ss__card-main">
              <h3 class="ss__card-title">${_esc(p.title)}</h3>
              <p class="ss__card-meta">${_esc(p.passage)} · ${date} · ${p.status}</p>
            </div>
            <div class="ss__card-actions">
              <button class="ss__card-btn ss__card-btn--share" data-action="share" data-id="${p.id}" title="Share">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
              <button class="ss__card-btn ss__card-btn--delete" data-action="delete" data-id="${p.id}" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  // Wire events
  document.getElementById('ss-new')?.addEventListener('click', () => _showSermonPicker());

  _container.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) {
      // Click on card → open editor
      const card = e.target.closest('[data-pack-id]');
      if (card) _openEditor(card.dataset.packId);
      return;
    }

    const id = btn.dataset.id;
    if (btn.dataset.action === 'share') {
      e.stopPropagation();
      _openEditor(id, true);  // Go straight to share view
    }
    if (btn.dataset.action === 'delete') {
      e.stopPropagation();
      if (confirm('Delete this study session?')) {
        await deleteStudyPack(id);
        _showList();
      }
    }
  });
}

// ── Sermon picker (create new pack from a sermon) ────────────

async function _showSermonPicker() {
  const sermons = await listSermons();
  if (sermons.length === 0) {
    _container.innerHTML = `
      <div class="ss">
        <p class="ss__empty">You need to create a sermon first before making a study session.</p>
        <button class="ss__back-btn" id="ss-back-to-list">Back</button>
      </div>`;
    document.getElementById('ss-back-to-list')?.addEventListener('click', () => _showList());
    return;
  }

  _container.innerHTML = `
    <div class="ss">
      <div class="ss__header">
        <button class="ss__back-btn" id="ss-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <h2 class="ss__title">Choose a Sermon</h2>
      </div>
      <p class="ss__desc">Select a sermon to base your study session on:</p>
      ${sermons.map(s => {
        const date = new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `
          <div class="ss__card ss__card--pick" data-sermon-id="${s.id}">
            <h3 class="ss__card-title">${_esc(s.title)}</h3>
            <p class="ss__card-meta">${s.osisAnchor ? _esc(s.osisAnchor) + ' · ' : ''}${date}</p>
          </div>`;
      }).join('')}
    </div>`;

  document.getElementById('ss-back')?.addEventListener('click', () => _showList());

  _container.addEventListener('click', async e => {
    const card = e.target.closest('[data-sermon-id]');
    if (!card) return;
    await _createFromSermon(card.dataset.sermonId);
  }, { once: true });
}

// ── Create a new study pack from a sermon ────────────────────

async function _createFromSermon(sermonId) {
  const sermon = await getSermon(sermonId);
  if (!sermon) return;

  // Extract outline from TipTap JSON
  const outline = _extractOutline(sermon.content);

  // Get current passage text if available
  let scripture = '';
  let passage = sermon.osisAnchor || '';
  if (state.book && state.chapter) {
    const verses = await getChapter(state.book, state.chapter);
    if (verses.length) {
      scripture = verses.map(v => `[${v.verse}] ${v.text}`).join(' ');
      const bookMeta = getBook(state.book);
      passage = passage || `${bookMeta?.name || state.book} ${state.chapter}`;
    }
  }

  const pack = await createStudyPack({
    title: sermon.title || 'Study Session',
    passage,
    osisRef: sermon.osisAnchor || (state.book ? `${state.book}.${state.chapter}.1` : ''),
    scripture,
    sections: [
      { type: 'outline',    heading: 'Sermon Outline',       items: outline },
      { type: 'discussion', heading: 'Discussion Questions', items: ['', '', ''] },
      { type: 'notes',      heading: 'Leader Notes',         body: '' },
    ],
    sermonId,
  });

  await _openEditor(pack.id);
}

// ── Editor view ──────────────────────────────────────────────

async function _openEditor(packId, jumpToShare = false) {
  const pack = typeof packId === 'string'
    ? (await (await import('../../idb/study-packs.js')).getStudyPack(packId))
    : packId;
  if (!pack) { _showList(); return; }

  _currentPack = pack;
  _view = 'editor';

  _container.innerHTML = `
    <div class="ss">
      <div class="ss__header">
        <button class="ss__back-btn" id="ss-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <input type="text" class="ss__title-input" id="ss-title"
               value="${_esc(pack.title)}" placeholder="Study Title" />
      </div>

      <label class="ss__label">Passage</label>
      <input type="text" class="ss__input" id="ss-passage"
             value="${_esc(pack.passage)}" placeholder="e.g., John 3:16-21" />

      <label class="ss__label">Scripture Text</label>
      <textarea class="ss__textarea ss__textarea--scripture" id="ss-scripture"
                rows="4" placeholder="Paste or auto-fill passage text">${_esc(pack.scripture)}</textarea>

      ${pack.sections.map((sec, i) => _renderSection(sec, i)).join('')}

      <div class="ss__add-section">
        <button class="ss__add-btn" id="ss-add-questions">+ Discussion Questions</button>
        <button class="ss__add-btn" id="ss-add-notes">+ Leader Notes</button>
        <button class="ss__add-btn" id="ss-add-application">+ Application</button>
        <button class="ss__add-btn" id="ss-add-prayer">+ Prayer Points</button>
      </div>

      <div class="ss__footer">
        <button class="ss__publish-btn" id="ss-publish">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share Study Session
        </button>
      </div>

      <div id="ss-share-area"></div>
    </div>`;

  // Wire events
  document.getElementById('ss-back')?.addEventListener('click', () => {
    _saveEditorState();
    _showList();
  });

  document.getElementById('ss-publish')?.addEventListener('click', () => _publishAndShow());

  // Add-section buttons
  document.getElementById('ss-add-questions')?.addEventListener('click', () => _addSection('discussion', 'Discussion Questions'));
  document.getElementById('ss-add-notes')?.addEventListener('click', () => _addSection('notes', 'Leader Notes'));
  document.getElementById('ss-add-application')?.addEventListener('click', () => _addSection('application', 'Application'));
  document.getElementById('ss-add-prayer')?.addEventListener('click', () => _addSection('prayer', 'Prayer Points'));

  // Inline add-question buttons
  _container.querySelectorAll('.ss__add-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionIdx = parseInt(btn.dataset.section);
      _addItemToSection(sectionIdx);
    });
  });

  if (jumpToShare) _publishAndShow();
}

function _renderSection(sec, idx) {
  if (sec.type === 'outline' || sec.type === 'discussion') {
    const items = (sec.items || []).map((item, i) => `
      <div class="ss__item-row">
        <span class="ss__item-num">${i + 1}.</span>
        <input type="text" class="ss__item-input" data-section="${idx}" data-item="${i}"
               value="${_esc(item)}" placeholder="${sec.type === 'outline' ? 'Point' : 'Question'}..." />
        <button class="ss__item-remove" data-section="${idx}" data-remove="${i}" title="Remove">&times;</button>
      </div>`).join('');

    return `
      <fieldset class="ss__section" data-section-idx="${idx}">
        <legend class="ss__section-legend">${_esc(sec.heading)}</legend>
        ${items}
        <button class="ss__add-item" data-section="${idx}">+ Add ${sec.type === 'outline' ? 'Point' : 'Question'}</button>
      </fieldset>`;
  }

  // Notes / application / prayer — free-form textarea
  return `
    <fieldset class="ss__section" data-section-idx="${idx}">
      <legend class="ss__section-legend">${_esc(sec.heading)}</legend>
      <textarea class="ss__textarea" data-section="${idx}" data-body="1"
                rows="4" placeholder="Type here...">${_esc(sec.body || '')}</textarea>
    </fieldset>`;
}

// ── Save editor state to IDB ─────────────────────────────────

async function _saveEditorState() {
  if (!_currentPack) return;

  const title = document.getElementById('ss-title')?.value || _currentPack.title;
  const passage = document.getElementById('ss-passage')?.value || '';
  const scripture = document.getElementById('ss-scripture')?.value || '';

  // Collect sections from DOM
  const sections = _currentPack.sections.map((sec, idx) => {
    if (sec.type === 'outline' || sec.type === 'discussion') {
      const inputs = _container.querySelectorAll(`[data-section="${idx}"][data-item]`);
      const items = Array.from(inputs).map(inp => inp.value);
      return { ...sec, items };
    }
    const textarea = _container.querySelector(`[data-section="${idx}"][data-body]`);
    return { ...sec, body: textarea?.value || '' };
  });

  _currentPack = await updateStudyPack(_currentPack.id, {
    title, passage, scripture, sections,
  });
}

// ── Add section / item ───────────────────────────────────────

async function _addSection(type, heading) {
  if (!_currentPack) return;
  await _saveEditorState();

  const newSection = type === 'discussion' || type === 'outline'
    ? { type, heading, items: [''] }
    : { type, heading, body: '' };

  _currentPack.sections.push(newSection);
  _currentPack = await updateStudyPack(_currentPack.id, { sections: _currentPack.sections });
  _openEditor(_currentPack.id);
}

async function _addItemToSection(sectionIdx) {
  if (!_currentPack) return;
  await _saveEditorState();

  const sec = _currentPack.sections[sectionIdx];
  if (sec && sec.items) {
    sec.items.push('');
    _currentPack = await updateStudyPack(_currentPack.id, { sections: _currentPack.sections });
    _openEditor(_currentPack.id);
  }
}

// ── Publish and show QR ──────────────────────────────────────

async function _publishAndShow() {
  await _saveEditorState();
  if (!_currentPack) return;

  _currentPack = await updateStudyPack(_currentPack.id, { status: 'published' });

  const shareArea = document.getElementById('ss-share-area');
  if (!shareArea) return;

  shareArea.innerHTML = '<p class="ss__publishing">Publishing...</p>';

  try {
    const { url, method } = await publishStudyPack(_currentPack);
    shareArea.innerHTML = '';
    await renderQrCode(shareArea, url);

    // Add method note
    const note = document.createElement('p');
    note.className = 'ss__share-note';
    note.textContent = method === 'kv'
      ? 'Stored on server. Link works even if this browser is closed.'
      : 'Encoded in the URL. No server needed — works offline.';
    shareArea.appendChild(note);
  } catch (err) {
    console.error('[study-session] publish error:', err);
    shareArea.innerHTML = `<p class="ss__error">Failed to publish: ${_esc(err?.message || String(err))}</p>`;
  }
}

// ── Extract outline from TipTap JSON ─────────────────────────

function _extractOutline(content) {
  if (!content || !content.content) return [];
  const points = [];

  for (const node of content.content) {
    if (node.type === 'pointHeading') {
      const text = _extractText(node);
      if (text) points.push(text);
    }
  }
  return points.length > 0 ? points : [''];
}

function _extractText(node) {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(n => _extractText(n)).join('');
}

// ── Helpers ──────────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
