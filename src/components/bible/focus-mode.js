/* ============================================================
   focus-mode.js — Focus/fullscreen reading mode (Stage 5)
   Hides sidebar + right panel for distraction-free reading.
   Keyboard shortcut: F
   ============================================================ */

let _active = false;

export function initFocusMode() {
  // Nothing to init — toggle is called directly
}

export function toggleFocusMode() {
  _active = !_active;
  document.body.classList.toggle('focus-mode', _active);

  // Update button state if it exists
  const btn = document.getElementById('btn-focus-mode');
  if (btn) {
    btn.setAttribute('aria-pressed', String(_active));
    btn.title = _active ? 'Exit focus mode (F)' : 'Focus mode — hide panels (F)';
    btn.classList.toggle('reading-pane__action-btn--active', _active);
  }

  // Optional: request true fullscreen when entering focus
  if (_active) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }
}

export function isFocusModeActive() {
  return _active;
}

// Exit focus mode when user presses Escape (native fullscreen already does this,
// but we also need to handle the CSS-only focus state)
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && _active) {
    _active = false;
    document.body.classList.remove('focus-mode');
    const btn = document.getElementById('btn-focus-mode');
    if (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.title = 'Focus mode — hide panels (F)';
      btn.classList.remove('reading-pane__action-btn--active');
    }
  }
});
