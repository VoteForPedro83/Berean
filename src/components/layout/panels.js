/* ============================================================
   panels.js — Split.js resizable two-pane layout
   ============================================================ */
import Split from 'split.js';
import { bus, EVENTS } from '../../state/eventbus.js';

let splitInstance = null;

export function initPanels() {
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
  splitInstance?.setSizes([100, 0]);
}

/** Reset to default sizes. */
export function resetSizes() {
  splitInstance?.setSizes([62, 38]);
}
