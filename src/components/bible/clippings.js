/* ============================================================
   clippings.js — Clippings Tray panel
   Opens as a slide-in panel inside the sermon editor.
   Lists all IDB clippings, lets pastor insert them as
   ClippingBlock nodes or delete them.
   ============================================================ */
import { getAllClippings, deleteClipping } from '../../idb/clippings.js';

const PANEL_ID = 'se-clippings-panel';

/**
 * Open (or re-open) the Clippings Tray beside the sermon editor.
 * @param {import('@tiptap/core').Editor} editor — active TipTap instance
 */
export async function openClippingsTray(editor) {
  // Toggle: if already open, close it
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id        = PANEL_ID;
  panel.className = 'se-side-panel';

  panel.innerHTML = `
    <div class="se-side-panel__header">
      <h3 class="se-side-panel__title">Clippings Tray</h3>
      <button class="se-side-panel__close" aria-label="Close clippings tray">✕</button>
    </div>
    <p class="se-side-panel__hint">
      Select verses in the Bible reader and tap <strong>Clippings</strong> to save them here.
      Click <strong>Insert</strong> to drop a clipping into your sermon.
    </p>
    <div class="se-side-panel__list" id="clippings-list"></div>`;

  document.body.appendChild(panel);

  panel.querySelector('.se-side-panel__close').addEventListener('click', () => panel.remove());

  await _renderList(panel, editor);
}

async function _renderList(panel, editor) {
  const listEl = panel.querySelector('#clippings-list');
  if (!listEl) return;

  const clips = await getAllClippings();

  if (clips.length === 0) {
    listEl.innerHTML = `<p class="se-side-panel__empty">No clippings yet. Select verses in the Bible reader and press <strong>Clippings</strong>.</p>`;
    return;
  }

  listEl.innerHTML = clips.map(c => `
    <div class="se-clipping-card" data-clip-id="${_esc(c.clipId)}">
      <div class="se-clipping-card__ref">${_esc(c.reference)}</div>
      <div class="se-clipping-card__text">${_esc(_truncate(c.text, 120))}</div>
      <div class="se-clipping-card__actions">
        <button class="se-clipping-card__btn se-clipping-card__btn--insert"
                data-clip-id="${_esc(c.clipId)}">Insert</button>
        <button class="se-clipping-card__btn se-clipping-card__btn--delete"
                data-clip-id="${_esc(c.clipId)}" aria-label="Delete clipping">Delete</button>
      </div>
    </div>`).join('');

  // Build a quick lookup by clipId
  const byId = Object.fromEntries(clips.map(c => [c.clipId, c]));

  listEl.addEventListener('click', async e => {
    const btn    = e.target.closest('[data-clip-id]');
    if (!btn) return;
    const clipId = btn.dataset.clipId;
    const clip   = byId[clipId];

    if (btn.classList.contains('se-clipping-card__btn--insert') && clip) {
      _insertClipping(editor, clip);
      // Remove from tray after insert so it doesn't get inserted twice
      await deleteClipping(clipId);
      const panel = document.getElementById(PANEL_ID);
      if (panel) await _renderList(panel, editor);
      _updateBadge();
    }

    if (btn.classList.contains('se-clipping-card__btn--delete')) {
      await deleteClipping(clipId);
      const panel = document.getElementById(PANEL_ID);
      if (panel) await _renderList(panel, editor);
      _updateBadge();
    }
  });
}

/** Insert a ClippingBlock node into TipTap at the current cursor. */
function _insertClipping(editor, clip) {
  if (!editor) return;
  editor.chain().focus().insertContent({
    type: 'clippingBlock',
    attrs: {
      osisId:      clip.osisId,
      source:      clip.reference,
      attribution: clip.reference,
      isAI:        false,
    },
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: clip.text }],
    }],
  }).run();
}

/** Refresh the badge count on the toolbar Clippings button. */
export function _updateBadge() {
  import('../../idb/clippings.js').then(({ getClippingCount }) => {
    getClippingCount().then(n => {
      const badge = document.getElementById('se-clippings-badge');
      if (!badge) return;
      badge.textContent = n > 0 ? String(n) : '';
      badge.hidden = n === 0;
    });
  });
}

// ── Helpers ────────────────────────────────────────────────

function _esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _truncate(str, max) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max).trimEnd() + '…';
}
