/* ============================================================
   panels.js — Split.js resizable two-pane layout
   ============================================================ */
import Split from 'split.js';
import { bus, EVENTS } from '../../state/eventbus.js';

let splitInstance = null;

/** True when viewport is narrow enough to use single-pane mobile layout */
export function isMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

export function initPanels() {
  const left  = document.getElementById('bible-pane');
  const right = document.getElementById('right-panel');
  if (!left || !right) return;

  if (isMobile()) {
    // Mobile: single-pane stacked layout — no Split.js
    document.getElementById('main-content')?.classList.add('main-content--mobile');
    return;
  }

  _initSplit();

  // Re-init on orientation change / window resize crossing the breakpoint
  const mq = window.matchMedia('(max-width: 768px)');
  mq.addEventListener('change', e => {
    if (e.matches) {
      // Switched to mobile — destroy split
      splitInstance?.destroy();
      splitInstance = null;
      document.getElementById('main-content')?.classList.add('main-content--mobile');
      // Ensure bible pane is visible when switching to mobile
      left.removeAttribute('hidden');
      right.removeAttribute('hidden');
    } else {
      // Switched back to desktop — restore split
      document.getElementById('main-content')?.classList.remove('main-content--mobile');
      _initSplit();
    }
  });
}

function _initSplit() {
  const left  = document.getElementById('bible-pane');
  const right = document.getElementById('right-panel');
  if (!left || !right) return;
  splitInstance = Split(['#bible-pane', '#right-panel'], {
    sizes:      [62, 38],
    minSize:    [320, 260],
    gutterSize: 6,
    snapOffset: 0,
    cursor:     'col-resize',
    gutter(index, direction) {
      const el = document.createElement('div');
      el.className = `gutter gutter-${direction}`;
      el.setAttribute('aria-hidden', 'true');
      return el;
    },
    onDragEnd(sizes) {
      bus.emit(EVENTS.PANEL_RESIZE, { sizes });
    },
  });
}

/** Collapse right panel to 0 (useful for focus reading). */
export function collapseRight() {
  if (!isMobile()) splitInstance?.setSizes([100, 0]);
}

/** Reset to default sizes. */
export function resetSizes() {
  if (!isMobile()) splitInstance?.setSizes([62, 38]);
}
