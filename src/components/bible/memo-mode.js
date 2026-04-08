/* ============================================================
   memo-mode.js — Memorisation mode: blur verse texts (Stage 5)
   Click a verse to progressively reveal it. Press M to toggle.
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';

let _active  = false;
let _handler = null;   // click handler attached to chapter-content

export function initMemoMode() {
  // Re-blur all verses when a new chapter loads
  bus.on(EVENTS.CHAPTER_LOADED, () => {
    if (_active) _applyBlur();
  });
}

export function toggleMemoMode() {
  _active = !_active;
  const btn = document.getElementById('btn-memo-mode');
  if (btn) {
    btn.setAttribute('aria-pressed', String(_active));
    btn.title = _active ? 'Exit memorisation mode (M)' : 'Memorisation mode (M)';
    btn.classList.toggle('reading-pane__action-btn--active', _active);
  }

  if (_active) {
    _applyBlur();
    _showBar();
    _attachClickHandler();
  } else {
    _removeBlur();
    _hideBar();
    _detachClickHandler();
  }
}

export function isMemoModeActive() {
  return _active;
}

// ── Blur / reveal ─────────────────────────────────────────
function _applyBlur() {
  document.querySelectorAll('.verse-container').forEach(v => {
    v.classList.add('memo-blurred');
    v.classList.remove('memo-revealed');
  });
}

function _removeBlur() {
  document.querySelectorAll('.verse-container').forEach(v => {
    v.classList.remove('memo-blurred', 'memo-revealed');
  });
}

// ── Click handler (reveal / re-blur on click) ─────────────
function _attachClickHandler() {
  _handler = e => {
    const container = e.target.closest('.verse-container');
    if (!container) return;
    if (container.classList.contains('memo-blurred')) {
      container.classList.remove('memo-blurred');
      container.classList.add('memo-revealed');
    } else if (container.classList.contains('memo-revealed')) {
      // Second click re-blurs
      container.classList.remove('memo-revealed');
      container.classList.add('memo-blurred');
    }
  };
  document.getElementById('chapter-content')?.addEventListener('click', _handler);
}

function _detachClickHandler() {
  if (_handler) {
    document.getElementById('chapter-content')?.removeEventListener('click', _handler);
    _handler = null;
  }
}

// ── Notification bar ──────────────────────────────────────
function _showBar() {
  let bar = document.getElementById('memo-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'memo-bar';
    bar.className = 'memo-bar';
    bar.innerHTML = `
      <span class="memo-bar__label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
        Memorisation mode — click a verse to reveal
      </span>
      <button class="memo-bar__reset" id="memo-reset">Reset all</button>`;
    // Insert before reading scroll
    const scroll = document.getElementById('reading-scroll');
    scroll?.parentNode?.insertBefore(bar, scroll);
  }
  bar.removeAttribute('hidden');

  document.getElementById('memo-reset')?.addEventListener('click', () => {
    _applyBlur();
  });
}

function _hideBar() {
  document.getElementById('memo-bar')?.setAttribute('hidden', '');
}
