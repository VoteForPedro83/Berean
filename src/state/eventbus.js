/* ============================================================
   eventbus.js — Vanilla JS Pub/Sub event bus
   All inter-component communication goes through here.
   ============================================================ */

const listeners = new Map();

export const bus = {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => this.off(event, fn);
  },

  /** Unsubscribe from an event. */
  off(event, fn) {
    listeners.get(event)?.delete(fn);
  },

  /** Publish an event with optional data. */
  emit(event, data) {
    listeners.get(event)?.forEach(fn => {
      try { fn(data); }
      catch (err) { console.error(`[bus] Error in handler for "${event}":`, err); }
    });
  },

  /** Subscribe once — auto-removes after first call. */
  once(event, fn) {
    const wrapped = (data) => { fn(data); this.off(event, wrapped); };
    this.on(event, wrapped);
  },
};

/* ── Event name constants ────────────────────────────────── */
export const EVENTS = {
  NAVIGATE:          'navigate',
  CHAPTER_LOADED:    'chapter:loaded',
  THEME_CHANGE:      'theme:change',
  LANG_CHANGE:       'lang:change',
  FONT_SIZE_CHANGE:  'fontsize:change',
  SIDEBAR_TOGGLE:    'sidebar:toggle',
  PANEL_RESIZE:      'panel:resize',
  VERSE_SELECT:      'verse:select',
  VERSE_RANGE_SELECT:'verse:range-select',
  VERSE_BOOKMARK:    'verse:bookmark',
  VERSE_COPY:        'verse:copy',
  WORD_CLICK:        'word:click',
  WORD_SELECTED:     'word:selected',
  STRONGS_LOOKUP:    'strongs:lookup',
  MODAL_OPEN:        'modal:open',
  MODAL_CLOSE:       'modal:close',
  TOAST:             'toast',
  AI_REQUEST:        'ai:request',
  AI_CHUNK:          'ai:chunk',
  AI_DONE:           'ai:done',
  AI_ERROR:          'ai:error',
  CLIPPING_ADDED:    'clipping:added',
  ENTITY_SELECTED:   'entity:selected',   // { type:'person'|'place', id, name, source:'graph'|'timeline' }
  ENTITY_CLEARED:    'entity:cleared',    // selection dismissed — restore full-opacity reading pane
};
