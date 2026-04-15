/* ============================================================
   main.js — Berean app entry point  (Stage 1)
   ============================================================ */
import './styles/fonts.css';
import './styles/theme.css';
import './styles/interlinear.css';
import './styles/print.css';
import Mousetrap from 'mousetrap';

import { bus, EVENTS }            from './state/eventbus.js';
import { applyStoredPreferences, toggleTheme, state } from './state/study-mode.js';
import { initRouter, parseHash, navigateTo }  from './router.js';
import { initDB }                 from './idb/schema.js';
import { initBibleDb }            from './db/bible.js';
import { initToast, toast }       from './components/layout/toast.js';
import { initSidebar }            from './components/layout/sidebar.js';
import { initCommandPalette, openCommandPalette } from './components/layout/command-palette.js';
import { initPanels }             from './components/layout/panels.js';
import { initReadingPane }        from './components/bible/reading-pane.js';
import { initParallel }           from './components/bible/parallel.js';
import { initSearchPanel, showSearchPanel, hideSearchPanel } from './components/layout/search-panel.js';
import { initInterlinear, buildInterlinearChapter, isInterlinearActive } from './components/bible/interlinear.js';
import { initWordStudy }          from './components/study/word-study.js';
import { initCommentaries }       from './components/study/commentaries.js';
import { initCrossRefs }          from './components/study/crossrefs.js';
import { initTopical }            from './components/study/topical.js';
import { initTypology }           from './components/study/typology.js';
import { initAiPanel }            from './components/study/ai-panel.js';
import { initCommentaryDb }       from './db/commentaries.js';
import { initCrossRefsDb }        from './db/crossrefs.js';
import { initTopicalDb }          from './db/topical.js';
import { initSettingsModal }      from './components/settings/byok-modal.js';
import { initOnboarding }         from './components/settings/onboarding.js';
import { initBookmarks }          from './components/bible/bookmarks.js';
import { toggleFocusMode }        from './components/bible/focus-mode.js';
import { initMemoMode, toggleMemoMode } from './components/bible/memo-mode.js';
import { initHighlights }         from './components/bible/highlights.js';

async function bootstrap() {
  // 0. Check if this is a special URL before booting the normal app
  const hash = window.location.hash;
  const path = window.location.pathname;

  // Presentation display window (#pres-display)
  if (hash.startsWith('#pres-display')) {
    const { tryRenderDisplayWindow } = await import('./components/sermon/presentation.js');
    tryRenderDisplayWindow();
    return;
  }

  // Study session participant view (#study=... or /s/:id)
  if (hash.startsWith('#study=') || path.startsWith('/s/')) {
    const { tryRenderParticipantView } = await import('./components/study-session/participant.js');
    const handled = await tryRenderParticipantView();
    if (handled) return;  // Participant view rendered — skip normal app boot
  }

  // 1. Apply saved theme/font before first paint
  applyStoredPreferences();

  // 2. Render the app shell HTML
  renderShell();

  // 3. Init IndexedDB (non-blocking)
  initDB().catch(err => console.warn('[idb] init failed:', err));

  // 3b. Start loading the Bible database in the background
  // This begins the HTTP fetch immediately so it's ready by the time the user
  // navigates to a chapter that isn't in the mock data.
  initBibleDb().catch(err => console.warn('[bible.js] db init failed:', err));

  // 4. Init layout components
  initToast();
  initSidebar();
  initCommandPalette();
  initPanels();
  initMobileTopBar();

  // 5. Init Bible reading pane + Stage 2 + Stage 4 components
  initReadingPane();
  initInterlinear();
  initParallel();  // pre-warm translations_cc DB
  initSearchPanel();

  // Search panel show/hide
  const biblePane   = document.getElementById('bible-pane');
  const searchPanel = document.getElementById('search-panel');
  bus.on('search:open',  () => { biblePane?.setAttribute('hidden', ''); searchPanel?.removeAttribute('hidden'); showSearchPanel(); });
  bus.on('search:close', () => { searchPanel?.setAttribute('hidden', ''); biblePane?.removeAttribute('hidden'); });

  // View switching — maps tab, sermon editor, study sessions
  const sermonView       = document.getElementById('sermon-view');
  const studySessionView = document.getElementById('study-session-view');
  const topicsView       = document.getElementById('topics-view');
  const journalView      = document.getElementById('journal-view');
  let _sermonInited       = false;
  let _studySessionInited = false;
  let _topicsInited       = false;
  let _journalInited      = false;

  bus.on('view:change', ({ dest }) => {
    // Maps → activate Map tab in right panel (stays in study mode)
    if (dest === 'maps') {
      document.getElementById('tab-map')?.click();
      return;
    }

    // Sermon → hide bible pane, show sermon editor
    if (dest === 'sermon') {
      biblePane?.setAttribute('hidden', '');
      studySessionView?.setAttribute('hidden', '');
      topicsView?.setAttribute('hidden', '');
      journalView?.setAttribute('hidden', '');
      sermonView?.removeAttribute('hidden');
      if (!_sermonInited) {
        _sermonInited = true;
        import('./components/sermon/editor.js').then(({ initSermonEditor }) => {
          initSermonEditor(sermonView);
        });
      }
      return;
    }

    // Study session → hide bible pane, show study session creator
    if (dest === 'study-session') {
      biblePane?.setAttribute('hidden', '');
      sermonView?.setAttribute('hidden', '');
      topicsView?.setAttribute('hidden', '');
      journalView?.setAttribute('hidden', '');
      studySessionView?.removeAttribute('hidden');
      if (!_studySessionInited) {
        _studySessionInited = true;
        import('./components/study-session/creator.js').then(({ initStudySessionCreator }) => {
          initStudySessionCreator(studySessionView);
        });
      }
      return;
    }

    // Topics → hide bible pane, show topic workspace
    if (dest === 'topics') {
      biblePane?.setAttribute('hidden', '');
      sermonView?.setAttribute('hidden', '');
      studySessionView?.setAttribute('hidden', '');
      journalView?.setAttribute('hidden', '');
      topicsView?.removeAttribute('hidden');
      if (!_topicsInited) {
        _topicsInited = true;
        import('./components/study/topic-workspace.js').then(({ initTopicWorkspace }) => {
          initTopicWorkspace(topicsView);
        });
      }
      return;
    }

    // Reading Journal
    if (dest === 'journal') {
      biblePane?.setAttribute('hidden', '');
      sermonView?.setAttribute('hidden', '');
      studySessionView?.setAttribute('hidden', '');
      topicsView?.setAttribute('hidden', '');
      journalView?.removeAttribute('hidden');
      if (!_journalInited) {
        _journalInited = true;
        import('./components/study/reading-journal.js').then(({ initReadingJournal }) => {
          initReadingJournal(journalView);
        });
      } else {
        import('./components/study/reading-journal.js').then(({ refreshReadingJournal }) => {
          refreshReadingJournal();
        });
      }
      return;
    }

    // Study mode or anything else → show bible, hide all full-page views
    sermonView?.setAttribute('hidden', '');
    studySessionView?.setAttribute('hidden', '');
    topicsView?.setAttribute('hidden', '');
    journalView?.setAttribute('hidden', '');
    if (dest !== 'search') {
      biblePane?.removeAttribute('hidden');
    }
  });

  // 5b. Init Stage 3 right panel with tabs
  initRightPanel();

  // 5d. Init Stage 5 bookmarks + modes + highlights
  initBookmarks();
  initMemoMode();
  initHighlights();

  // Expose interlinear builder for reading-pane.js
  window.__bereanInterlinear = { buildInterlinearChapter };

  // 5c. Pre-warm Stage 3 databases in the background
  initCommentaryDb().catch(() => {});
  initCrossRefsDb().catch(() => {});
  initTopicalDb().catch(() => {});

  // 6. Init settings modal
  initSettingsModal();

  // 7. Init router — navigates to hash or default
  initRouter();
  const initial = window._initialPassage || parseHash(window.location.hash);
  navigateTo(initial);

  // 8. Wire keyboard shortcuts (Mousetrap)
  wireShortcuts();

  // 9. Hide loading screen
  const loading = document.getElementById('loading-screen');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 300);
  }

  // 10. Onboarding tour (first visit only)
  initOnboarding();
}

// ── App Shell HTML ─────────────────────────────────────────
function renderShell() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <!-- Mobile top bar (hidden on desktop via CSS) -->
    <div class="mobile-topbar" id="mobile-topbar">
      <button class="mobile-topbar__hamburger" id="mobile-hamburger" aria-label="Open menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="mobile-topbar__logo" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="8" width="18" height="32" rx="2" fill="var(--color-accent-gold)" opacity="0.9"/>
          <rect x="26" y="8" width="18" height="32" rx="2" fill="var(--color-accent-gold)" opacity="0.5"/>
          <line x1="22" y1="8" x2="22" y2="40" stroke="var(--color-surface-base)" stroke-width="2"/>
        </svg>
        <span class="mobile-topbar__title">Berean</span>
      </div>
      <div class="mobile-topbar__pane-switcher">
        <button class="mobile-topbar__pane-btn mobile-topbar__pane-btn--active" data-pane="bible">Bible</button>
        <button class="mobile-topbar__pane-btn" data-pane="study">Study</button>
      </div>
    </div>

    <!-- Sidebar backdrop (mobile drawer) -->
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>

    <nav class="sidebar" id="sidebar" aria-label="Main navigation"></nav>

    <main class="main-content" id="main-content">
      <div class="reading-pane-container" id="bible-pane"></div>
      <div class="search-panel-container" id="search-panel" hidden></div>
      <div class="sermon-view" id="sermon-view" hidden></div>
      <div class="study-session-view" id="study-session-view" hidden></div>
      <div class="topics-view" id="topics-view" hidden></div>
      <div class="journal-view" id="journal-view" hidden></div>
      <div class="right-panel" id="right-panel">
        <!-- Tab bar -->
        <div class="rp-tabs" role="tablist" aria-label="Study panels">
          <!-- Row 1: verse-level study tools -->
          <button class="rp-tab rp-tab--active" role="tab" data-panel="commentary"
                  aria-selected="true"  aria-controls="rp-commentary" id="tab-commentary">Commentary</button>
          <button class="rp-tab" role="tab" data-panel="crossrefs"
                  aria-selected="false" aria-controls="rp-crossrefs"  id="tab-crossrefs">Cross-Refs</button>
          <button class="rp-tab" role="tab" data-panel="wordstudy"
                  aria-selected="false" aria-controls="rp-wordstudy"  id="tab-wordstudy">Word Study</button>
          <button class="rp-tab" role="tab" data-panel="topical"
                  aria-selected="false" aria-controls="rp-topical"    id="tab-topical">Topics</button>
          <button class="rp-tab" role="tab" data-panel="typology"
                  aria-selected="false" aria-controls="rp-typology"   id="tab-typology">Typology</button>
          <button class="rp-tab" role="tab" data-panel="map"
                  aria-selected="false" aria-controls="rp-map"        id="tab-map">Map</button>
          <!-- Row 2: sermon prep & context tools -->
          <button class="rp-tab" role="tab" data-panel="guide"
                  aria-selected="false" aria-controls="rp-guide"      id="tab-guide">Guide</button>
          <button class="rp-tab" role="tab" data-panel="exegesis"
                  aria-selected="false" aria-controls="rp-exegesis"   id="tab-exegesis">Exegesis</button>
          <button class="rp-tab" role="tab" data-panel="ai"
                  aria-selected="false" aria-controls="rp-ai"         id="tab-ai">AI ✦</button>
          <button class="rp-tab" role="tab" data-panel="timeline"
                  aria-selected="false" aria-controls="rp-timeline"   id="tab-timeline">Timeline</button>
          <button class="rp-tab" role="tab" data-panel="graph"
                  aria-selected="false" aria-controls="rp-graph"      id="tab-graph">Graph</button>
          <button class="rp-tab" role="tab" data-panel="progress"
                  aria-selected="false" aria-controls="rp-progress"   id="tab-progress">Plan</button>
        </div>
        <!-- Panel panes -->
        <div class="rp-pane rp-pane--active" role="tabpanel" id="rp-commentary"  aria-labelledby="tab-commentary"></div>
        <div class="rp-pane" role="tabpanel" id="rp-crossrefs"  aria-labelledby="tab-crossrefs"  hidden></div>
        <div class="rp-pane" role="tabpanel" id="rp-topical"    aria-labelledby="tab-topical"    hidden></div>
        <div class="rp-pane" role="tabpanel" id="rp-wordstudy"  aria-labelledby="tab-wordstudy"  hidden></div>
        <div class="rp-pane" role="tabpanel" id="rp-typology"   aria-labelledby="tab-typology"   hidden></div>
        <div class="rp-pane" role="tabpanel" id="rp-ai"         aria-labelledby="tab-ai"         hidden></div>
        <div class="rp-pane" role="tabpanel" id="rp-guide"     aria-labelledby="tab-guide"     hidden></div>
        <div class="rp-pane" role="tabpanel" id="rp-exegesis"  aria-labelledby="tab-exegesis"  hidden></div>
        <div class="rp-pane rp-pane--map" role="tabpanel" id="rp-map" aria-labelledby="tab-map"  hidden></div>
        <div class="rp-pane" role="tabpanel" id="rp-progress"   aria-labelledby="tab-progress"   hidden></div>
        <div class="rp-pane rp-pane--timeline" role="tabpanel" id="rp-timeline" aria-labelledby="tab-timeline" hidden></div>
        <div class="rp-pane rp-pane--graph"    role="tabpanel" id="rp-graph"    aria-labelledby="tab-graph"    hidden></div>
      </div>
    </main>

    <div id="toast-container" class="toast-container" aria-live="polite" aria-atomic="true"></div>

    <dialog id="command-palette" class="command-palette" aria-label="Command palette">
      <div class="command-palette__inner">
        <div class="command-palette__search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="search" id="command-palette-input"
                 placeholder="Search passages, topics, books… (try 'John' or 'Gen 1')"
                 autocomplete="off" spellcheck="false"/>
          <kbd class="cp-esc-hint">ESC</kbd>
        </div>
        <div class="command-palette__results" id="command-palette-results" role="listbox">
          <p class="cp-hint">Type to search, or pick a passage below</p>
        </div>
      </div>
    </dialog>

    <dialog id="settings-modal" class="settings-modal" aria-label="Settings"></dialog>`;

  // Inject component styles (all Stage 1 CSS in one place)
  injectComponentCSS();
}

// ── Right Panel Tabs (Stage 3) ─────────────────────────────
function initRightPanel() {
  const rp = document.getElementById('right-panel');
  if (!rp) return;

  // Init each panel's component
  initCommentaries(document.getElementById('rp-commentary'));
  initCrossRefs(document.getElementById('rp-crossrefs'));
  initTopical(document.getElementById('rp-topical'));
  initWordStudy();   // word study uses its own container logic
  initTypology(document.getElementById('rp-typology'));
  initAiPanel(document.getElementById('rp-ai'));

  // Tab switching
  rp.addEventListener('click', e => {
    const tab = e.target.closest('.rp-tab');
    if (!tab) return;
    const panelId = tab.dataset.panel;

    // Update tabs
    rp.querySelectorAll('.rp-tab').forEach(t => {
      const active = t.dataset.panel === panelId;
      t.classList.toggle('rp-tab--active', active);
      t.setAttribute('aria-selected', active);
    });

    // Update panes
    rp.querySelectorAll('.rp-pane').forEach(p => {
      const active = p.id === `rp-${panelId}`;
      p.classList.toggle('rp-pane--active', active);
      p.hidden = !active;
    });

    // Lazy-init progress panel on first open
    if (panelId === 'progress') {
      const pp = document.getElementById('rp-progress');
      if (pp && !pp.dataset.ppInit) {
        pp.dataset.ppInit = '1';
        import('./components/study/progress-panel.js').then(({ initProgressPanel }) => {
          initProgressPanel(pp);
        });
      }
    }

    // Lazy-init Passage Guide on first open
    if (panelId === 'guide') {
      const gp = document.getElementById('rp-guide');
      if (gp && !gp.dataset.guideInit) {
        gp.dataset.guideInit = '1';
        import('./components/study/passage-guide.js').then(({ initPassageGuide }) => {
          initPassageGuide(gp);
        });
      }
    }

    // Lazy-init Exegetical Checklist on first open
    if (panelId === 'exegesis') {
      const ep = document.getElementById('rp-exegesis');
      if (ep && !ep.dataset.exInit) {
        ep.dataset.exInit = '1';
        import('./components/study/exegesis-checklist.js').then(({ initExegesisChecklist }) => {
          initExegesisChecklist(ep);
        });
      }
    }

    // Lazy-init map panel on first open; invalidate size on every open
    if (panelId === 'map') {
      const mapPane = document.getElementById('rp-map');
      if (mapPane && !mapPane.dataset.mapInit) {
        mapPane.dataset.mapInit = '1';
        import('./components/maps/maps-panel.js').then(({ initMapsPanel }) => initMapsPanel(mapPane));
      } else {
        // Already inited — tell Leaflet the container resized
        setTimeout(() => window.__bereanMapInvalidate?.(), 50);
      }
    }

    // Lazy-init Timeline panel on first open; invalidate size on every open
    if (panelId === 'timeline') {
      const tp = document.getElementById('rp-timeline');
      if (tp && !tp.dataset.timelineInit) {
        tp.dataset.timelineInit = '1';
        import('./components/study/timeline-panel.js').then(({ initTimelinePanel }) => {
          initTimelinePanel(tp);
        });
      } else {
        // Already inited — panel is re-shown, nothing to do for custom timeline
      }
    }

    // Lazy-init Entity Graph on first open
    if (panelId === 'graph') {
      const gp = document.getElementById('rp-graph');
      if (gp && !gp.dataset.graphInit) {
        gp.dataset.graphInit = '1';
        import('./components/study/entity-graph.js').then(({ initEntityGraph }) => {
          initEntityGraph(gp);
        });
      } else {
        setTimeout(() => window.__bereanCy?.resize(), 50);
      }
    }

    // If switching to word-study, activate its container
    if (panelId === 'wordstudy') {
      const ws = document.getElementById('rp-wordstudy');
      if (ws && !ws.dataset.wsInit) {
        ws.dataset.wsInit = '1';
        // Word study will self-populate when a word is next clicked
        ws.innerHTML = `<div class="right-panel__placeholder">
          <p class="right-panel__placeholder-title">Word Study</p>
          <p class="right-panel__placeholder-body">Toggle interlinear (Ctrl+I) then click any Greek or Hebrew word.</p>
        </div>`;
      }
    }
  });

  // Word study: intercept the word:selected event to auto-switch to Word Study tab
  bus.on(EVENTS.WORD_SELECTED, () => {
    const wsTab = rp.querySelector('[data-panel="wordstudy"]');
    if (wsTab && !wsTab.classList.contains('rp-tab--active')) wsTab.click();
  });
}

// ── Keyboard Shortcuts ─────────────────────────────────────
function wireShortcuts() {
  Mousetrap.bind('ctrl+k',         e => { e.preventDefault(); openCommandPalette(); });
  Mousetrap.bind('mod+k',          e => { e.preventDefault(); openCommandPalette(); });
  Mousetrap.bind('ctrl+b',         () => bus.emit(EVENTS.SIDEBAR_TOGGLE));
  Mousetrap.bind('alt+right',      () => document.getElementById('next-chapter')?.click());
  Mousetrap.bind('alt+left',       () => document.getElementById('prev-chapter')?.click());
  Mousetrap.bind('ctrl+i',         () => document.dispatchEvent(new CustomEvent('berean:toggle-interlinear')));
  Mousetrap.bind('ctrl+p',         () => document.getElementById('toggle-parallel')?.click());
  Mousetrap.bind('ctrl+shift+m',   () => toggleTheme());
  // Single-key shortcuts — guard against firing while typing in inputs / contentEditable
  const _notTyping = () => {
    const el = document.activeElement;
    if (!el) return true;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (el.isContentEditable) return false;
    return true;
  };
  Mousetrap.bind('f',              () => { if (_notTyping()) toggleFocusMode(); });
  Mousetrap.bind('m',              () => { if (_notTyping()) toggleMemoMode(); });
  Mousetrap.bind('?',              () => { if (_notTyping()) openShortcutsModal(); });

  // Button click wiring (buttons are added by reading-pane.js after it renders)
  document.addEventListener('click', e => {
    if (e.target.closest('#btn-focus-mode')) toggleFocusMode();
    if (e.target.closest('#btn-memo-mode'))  toggleMemoMode();
  });

  // Shortcuts modal
  bus.on('shortcuts:open', openShortcutsModal);

  // Expose for command palette
  window.__bereanState = { toggleTheme };

  // Theme toggle also handles 'toggle' signal from command palette
  bus.on(EVENTS.THEME_CHANGE, val => { if (val === 'toggle') toggleTheme(); });
}

// ── Keyboard Shortcuts Modal ───────────────────────────────
const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Alt', '→'],        desc: 'Next chapter' },
      { keys: ['Alt', '←'],        desc: 'Previous chapter' },
      { keys: ['Ctrl', 'K'],       desc: 'Open command palette' },
      { keys: ['Ctrl', 'B'],       desc: 'Toggle sidebar' },
    ],
  },
  {
    title: 'Reading',
    shortcuts: [
      { keys: ['F'],               desc: 'Focus mode (fullscreen)' },
      { keys: ['M'],               desc: 'Memorisation mode (blur verses)' },
      { keys: ['Ctrl', 'I'],       desc: 'Toggle interlinear (Greek/Hebrew)' },
      { keys: ['Ctrl', 'P'],       desc: 'Toggle parallel Bible column' },
    ],
  },
  {
    title: 'Display',
    shortcuts: [
      { keys: ['Ctrl', '⇧', 'M'], desc: 'Toggle light / dark theme' },
    ],
  },
  {
    title: 'Help',
    shortcuts: [
      { keys: ['?'],               desc: 'Show this shortcuts reference' },
      { keys: ['Esc'],             desc: 'Close any open panel or modal' },
    ],
  },
];

function openShortcutsModal() {
  // Remove any existing instance
  document.getElementById('shortcuts-modal')?.remove();

  const modal = document.createElement('dialog');
  modal.id = 'shortcuts-modal';
  modal.className = 'sc-modal';
  modal.setAttribute('aria-label', 'Keyboard shortcuts');

  modal.innerHTML = `
    <div class="sc-inner">
      <div class="sc-header">
        <h2 class="sc-title">Keyboard Shortcuts</h2>
        <button class="sc-close" aria-label="Close">✕</button>
      </div>
      <div class="sc-body">
        ${SHORTCUT_GROUPS.map(g => `
          <div class="sc-group">
            <h3 class="sc-group__title">${g.title}</h3>
            ${g.shortcuts.map(s => `
              <div class="sc-row">
                <span class="sc-keys">
                  ${s.keys.map(k => `<kbd class="sc-key">${k}</kbd>`).join('<span class="sc-plus">+</span>')}
                </span>
                <span class="sc-desc">${s.desc}</span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.showModal();

  modal.querySelector('.sc-close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  modal.addEventListener('close', () => modal.remove());
}

// ── Mobile Top Bar ─────────────────────────────────────────
function initMobileTopBar() {
  const hamburger = document.getElementById('mobile-hamburger');
  const backdrop  = document.getElementById('sidebar-backdrop');

  hamburger?.addEventListener('click', () => bus.emit(EVENTS.SIDEBAR_TOGGLE));

  backdrop?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('sidebar--drawer-open');
    backdrop.classList.remove('sidebar-backdrop--visible');
  });

  // Pane switcher — toggles bible pane vs study panel on mobile
  const switcher  = document.querySelector('.mobile-topbar__pane-switcher');
  const biblePane = document.getElementById('bible-pane');
  const rightPanel = document.getElementById('right-panel');

  switcher?.addEventListener('click', e => {
    const btn = e.target.closest('.mobile-topbar__pane-btn');
    if (!btn) return;
    const pane = btn.dataset.pane;
    switcher.querySelectorAll('.mobile-topbar__pane-btn').forEach(b =>
      b.classList.toggle('mobile-topbar__pane-btn--active', b.dataset.pane === pane));
    if (pane === 'bible') {
      biblePane?.classList.remove('mobile-pane--hidden');
      rightPanel?.classList.add('mobile-pane--hidden');
    } else {
      biblePane?.classList.add('mobile-pane--hidden');
      rightPanel?.classList.remove('mobile-pane--hidden');
    }
  });

  // When a study tab is activated via event (e.g. verse tap → commentary), auto-switch to study pane
  bus.on(EVENTS.WORD_SELECTED, () => _switchMobilePaneTo('study'));
}

function _switchMobilePaneTo(pane) {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  const switcher   = document.querySelector('.mobile-topbar__pane-switcher');
  const biblePane  = document.getElementById('bible-pane');
  const rightPanel = document.getElementById('right-panel');
  if (!switcher) return;
  switcher.querySelectorAll('.mobile-topbar__pane-btn').forEach(b =>
    b.classList.toggle('mobile-topbar__pane-btn--active', b.dataset.pane === pane));
  if (pane === 'bible') {
    biblePane?.classList.remove('mobile-pane--hidden');
    rightPanel?.classList.add('mobile-pane--hidden');
  } else {
    biblePane?.classList.add('mobile-pane--hidden');
    rightPanel?.classList.remove('mobile-pane--hidden');
  }
}

// ── Component CSS ──────────────────────────────────────────
function injectComponentCSS() {
  const style = document.createElement('style');
  style.id = 'stage1-css';
  style.textContent = `
    /* ── Global reset ── */
    [hidden] { display:none !important; }

    /* ── Layout ── */
    #app { display:flex; height:100vh; width:100vw; overflow:hidden; }
    .sidebar {
      width:var(--sidebar-width,3.5rem); min-width:var(--sidebar-width,3.5rem);
      background:var(--color-surface-elevated); border-right:1px solid var(--color-border-subtle);
      display:flex; flex-direction:column; align-items:center; padding:.75rem 0; z-index:100;
      transition:width 200ms var(--ease-berean);
    }
    .sidebar--collapsed { width:0; min-width:0; overflow:hidden; }
    .sidebar__logo { padding:.75rem 0 1rem; display:flex; align-items:center; justify-content:center; }
    .sidebar__nav { flex:1; display:flex; flex-direction:column; gap:.25rem; width:100%; padding:0 .5rem; }
    .sidebar__bottom { padding:.5rem; width:100%; }
    .sidebar__item {
      width:100%; aspect-ratio:1; display:flex; align-items:center; justify-content:center;
      background:none; border:none; border-radius:var(--radius-ui,.375rem);
      color:var(--color-ink-muted); cursor:pointer;
      transition:background-color 100ms var(--ease-berean), color 100ms var(--ease-berean);
    }
    .sidebar__item:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }
    .sidebar__item--active { color:var(--color-accent-gold); background:color-mix(in srgb,var(--color-accent-gold) 10%,transparent); }
    .sidebar__item:focus-visible { outline:2px solid var(--color-accent-gold); outline-offset:2px; }
    .sidebar__item-label { display:none; }

    .main-content { flex:1; display:flex; overflow:hidden; }
    .reading-pane-container { flex:1; overflow:hidden; display:flex; flex-direction:column; }

    /* ── Split.js gutter ── */
    .gutter { background:var(--color-border-subtle); cursor:col-resize; flex-shrink:0; }
    .gutter:hover { background:var(--color-ink-muted); }

    /* ── Right panel placeholder ── */
    .right-panel { overflow-y:auto; background:var(--color-surface-elevated); }
    .right-panel__placeholder { padding:2rem 1.5rem; }
    .right-panel__placeholder-title { font-size:1rem; font-weight:600; color:var(--color-ink-primary); margin:0 0 .5rem; }
    .right-panel__placeholder-body { font-size:.875rem; color:var(--color-ink-secondary); margin:0 0 1rem; }
    .right-panel__coming-soon { margin:0; padding-left:1.25rem; display:flex; flex-direction:column; gap:.375rem; }
    .right-panel__coming-soon li { font-size:.8125rem; color:var(--color-ink-muted); }

    /* ── Reading pane ── */
    .reading-pane { display:flex; flex-direction:column; height:100%; overflow:hidden; }
    .reading-pane__header {
      display:flex; align-items:center; justify-content:space-between;
      padding:.625rem 1rem; border-bottom:1px solid var(--color-border-subtle);
      background:var(--color-surface-elevated); flex-shrink:0; gap:.5rem;
    }
    .reading-pane__nav { display:flex; align-items:center; gap:.25rem; }
    .reading-pane__nav-btn {
      display:flex; align-items:center; justify-content:center; width:2rem; height:2rem;
      background:none; border:none; border-radius:var(--radius-ui); color:var(--color-ink-secondary);
      cursor:pointer; transition:background 100ms, color 100ms;
    }
    .reading-pane__nav-btn:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }
    .reading-pane__nav-btn:disabled { opacity:.3; pointer-events:none; }
    .reading-pane__book-btn, .reading-pane__chapter-btn {
      display:flex; align-items:center; gap:.25rem; padding:.25rem .625rem;
      background:none; border:none; border-radius:var(--radius-ui);
      font-family:var(--font-scripture); font-size:1.0625rem; font-weight:600;
      color:var(--color-ink-primary); cursor:pointer;
      transition:background 100ms;
    }
    .reading-pane__book-btn:hover, .reading-pane__chapter-btn:hover { background:var(--color-surface-raised); }
    .reading-pane__actions { display:flex; align-items:center; gap:.5rem; }
    .reading-pane__action-btn {
      display:flex; align-items:center; justify-content:center; width:2rem; height:2rem;
      background:none; border:none; border-radius:var(--radius-ui); color:var(--color-ink-muted); cursor:pointer;
    }
    .reading-pane__action-btn:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }
    .reading-pane__history-btn { opacity:.9; }
    .reading-pane__history-btn:disabled { opacity:.25; pointer-events:none; }
    .reading-pane__divider { width:1px; height:1.25rem; background:var(--color-border-subtle); margin:0 .125rem; }
    .reading-pane__translation-tag {
      font-family:var(--font-mono); font-size:.6875rem; color:var(--color-ink-muted);
      border:1px solid var(--color-border-subtle); border-radius:3px; padding:.125rem .375rem;
      background:none; cursor:pointer; transition:border-color 150ms, color 150ms;
    }
    .reading-pane__translation-tag:hover { border-color:var(--color-accent-gold); color:var(--color-accent-gold); }
    .reading-pane__scroll { flex:1; overflow-y:auto; }
    .reading-pane__chapter { padding:1.5rem 2rem 4rem; max-width:700px; margin:0 auto; }
    .reading-pane__loading { padding:2rem; color:var(--color-ink-muted); text-align:center; font-size:.875rem; }

    /* ── Chapter heading ── */
    .chapter-heading { display:flex; align-items:baseline; gap:.5rem; margin:0 0 1.5rem; padding-bottom:1rem; border-bottom:1px solid var(--color-border-subtle); }
    .chapter-heading__book { font-family:var(--font-scripture); font-size:1.5rem; font-weight:600; color:var(--color-ink-primary); }
    .chapter-heading__number { font-family:var(--font-scripture); font-size:1.125rem; color:var(--color-ink-secondary); }

    /* ── Verse ── */
    .verse-list { display:flex; flex-direction:column; gap:var(--space-verse-gap,.75rem); }
    .verse-container { display:flex; gap:.5rem; line-height:var(--font-scripture-lh,1.625); }
    .verse-container--target { background:color-mix(in srgb,var(--color-accent-gold) 8%,transparent); border-radius:var(--radius-ui); margin:-.25rem -.5rem; padding:.25rem .5rem; }
    .verse-container.verse-entity-dim { opacity:.18; transition:opacity 150ms cubic-bezier(0.4,0,0.2,1); }
    @media (prefers-reduced-motion:reduce) { .verse-container.verse-entity-dim { transition-duration:0ms !important; } }
    .verse-number {
      flex-shrink:0; min-width:1.75rem; text-align:right; padding:.15rem .25rem 0 0;
      font-family:var(--font-mono); font-size:.6875rem; color:var(--color-accent-gold);
      background:none; border:none; cursor:pointer; line-height:var(--font-scripture-lh,1.625);
      transition:opacity 100ms;
    }
    .verse-number:hover { opacity:.7; }
    .verse-text { font-family:var(--font-scripture); font-size:var(--font-scripture-size,1.125rem); color:var(--color-ink-scripture); }
    .verse-container--selected { background:color-mix(in srgb,var(--color-accent-gold) 12%,transparent); border-radius:var(--radius-ui); margin:-.25rem -.5rem; padding:.25rem .5rem; }
    .verse-container--selected .verse-number { color:var(--color-accent-gold); opacity:1; }

    /* ── Selection bar ── */
    .selection-bar {
      position:sticky; top:.5rem;
      z-index:200; display:flex; align-items:center; gap:.75rem;
      margin:.5rem auto; width:fit-content; max-width:calc(100% - 2rem);
      background:var(--color-surface-modal); border:1px solid var(--color-border-subtle);
      border-radius:2rem; box-shadow:0 8px 32px rgba(0,0,0,.55);
      padding:.5rem .75rem .5rem 1rem;
      font-family:var(--font-ui); font-size:.8125rem;
      animation:sel-bar-in 150ms cubic-bezier(0.4,0,0.2,1) both;
    }
    @keyframes sel-bar-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
    @media (prefers-reduced-motion:reduce) { .selection-bar { animation-duration:0ms !important; } }
    .selection-bar__label { color:var(--color-ink-secondary); white-space:nowrap; }
    .selection-bar__actions { display:flex; align-items:center; gap:.375rem; }
    .selection-bar__btn {
      padding:.3rem .65rem; background:var(--color-surface-raised); border:1px solid var(--color-border-subtle);
      border-radius:1rem; color:var(--color-ink-primary); font-size:.75rem; font-family:var(--font-ui);
      cursor:pointer; transition:background 100ms, color 100ms; white-space:nowrap;
    }
    .selection-bar__btn:hover { background:var(--color-surface-elevated); color:var(--color-accent-gold); }
    .selection-bar__btn--clear { background:none; border-color:transparent; color:var(--color-ink-muted); padding:.3rem .5rem; }
    .selection-bar__btn--clear:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }

    /* ── Stage 6: Context banner ── */
    .reading-pane__context-banner {
      padding: .25rem .75rem;
      background: color-mix(in srgb, var(--color-accent-gold) 10%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--color-accent-gold) 20%, transparent);
      font-size: .6875rem; font-family: var(--font-ui);
      color: var(--color-accent-gold); letter-spacing: .03em;
      text-align: center;
    }

    /* ── Stage 5: Maps ── */
    .rp-pane--map { overflow:hidden; padding:0 !important; }
    .map-places-bar { padding:.5rem .75rem; background:var(--color-surface-elevated); border-bottom:1px solid var(--color-border-subtle); font-size:.75rem; color:var(--color-ink-secondary); min-height:2rem; display:flex; align-items:center; gap:.375rem; flex-wrap:wrap; }
    .map-place-chip { display:inline-block; padding:.1rem .4rem; border-radius:.25rem; background:color-mix(in srgb,var(--color-accent-gold) 15%,transparent); color:var(--color-accent-gold); font-size:.7rem; }
    .map-places-none { color:var(--color-ink-muted); font-style:italic; }
    .map-filters-bar {
      display:flex; align-items:center; gap:1rem; flex-wrap:wrap;
      padding:.5rem 1rem; background:var(--color-surface-elevated);
      border-bottom:1px solid var(--color-border-subtle); flex-shrink:0;
    }
    .map-filter-toggle { display:flex; align-items:center; gap:.25rem; font-size:.7rem; color:var(--color-ink-secondary); cursor:pointer; user-select:none; }
    .map-filter-toggle input { accent-color:var(--color-accent-gold); cursor:pointer; }
    .berean-map { flex:1; min-height:0; }
    .map-popup__name { display:block; color:#1a1a1a; font-weight:600; margin-bottom:.25rem; }
    .map-popup__desc { margin:0 0 .5rem; font-size:.8125rem; color:#444; line-height:1.4; }
    .map-popup__refs { border-top:1px solid #e0ddd6; padding-top:.5rem; display:flex; flex-direction:column; gap:.375rem; }
    .map-popup__ref { display:flex; gap:.4rem; align-items:baseline; font-size:.8rem; line-height:1.35; }
    .map-popup__vnum { flex-shrink:0; font-weight:600; color:#8C1127; font-size:.75rem; }
    .map-popup__vtext { color:#333; }
    .map-popup__vtext strong { color:#1a1a1a; }

    /* ── Stage 5: Bookmarks ── */
    /* ── Focus mode ── */
    .focus-mode .sidebar,
    .focus-mode #right-panel { display:none !important; }
    .focus-mode .reading-pane { max-width:52rem; margin:0 auto; }
    .focus-mode #btn-focus-mode { color:var(--color-accent-gold); }

    /* ── Memorisation mode ── */
    .memo-bar {
      display:flex; align-items:center; justify-content:space-between;
      padding:.5rem 1rem; background:color-mix(in srgb,var(--color-accent-gold) 10%,var(--color-surface-elevated));
      border-bottom:1px solid var(--color-border-subtle);
      font-size:.8125rem; color:var(--color-ink-secondary); flex-shrink:0;
    }
    .memo-bar__label { display:flex; align-items:center; gap:.375rem; }
    .memo-bar__reset {
      background:none; border:1px solid var(--color-border-subtle); color:var(--color-ink-secondary);
      padding:.2rem .625rem; border-radius:.25rem; font-size:.75rem; cursor:pointer;
      font-family:var(--font-ui);
    }
    .memo-bar__reset:hover { border-color:var(--color-accent-gold); color:var(--color-ink-primary); }
    .memo-blurred .verse-text {
      filter:blur(7px); cursor:pointer; user-select:none;
      transition:filter 250ms cubic-bezier(0.4,0,0.2,1);
    }
    .memo-revealed .verse-text {
      filter:none; cursor:pointer;
      transition:filter 250ms cubic-bezier(0.4,0,0.2,1);
    }
    @media (prefers-reduced-motion: reduce) {
      .memo-blurred .verse-text, .memo-revealed .verse-text { transition-duration:0ms !important; }
    }
    .reading-pane__action-btn--active { color:var(--color-accent-gold) !important; }

    /* ── Bookmarks ── */
    .verse-container--bookmarked .verse-number::before {
      content:''; display:inline-block; width:4px; height:4px; border-radius:50%;
      background:var(--color-accent-gold); margin-right:2px; vertical-align:middle;
      position:relative; top:-1px;
    }

    /* ── Stage 5: Sermon Editor ── */
    .sermon-view { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; }

    /* Editor view */
    .se-editor-view { display:flex; flex-direction:column; flex:1; min-height:0; }
    .se-header {
      display:flex; align-items:center; gap:.75rem; padding:.5rem 1rem;
      background:var(--color-surface-elevated); border-bottom:1px solid var(--color-border-subtle);
      flex-shrink:0;
    }
    .se-header__back {
      background:none; border:none; color:var(--color-ink-secondary); cursor:pointer;
      padding:.25rem; border-radius:.25rem; display:flex; align-items:center;
    }
    .se-header__back:hover { color:var(--color-ink-primary); background:var(--color-surface-raised); }
    .se-header__title {
      flex:1; background:none; border:none; color:var(--color-ink-primary);
      font-family:var(--font-ui); font-size:1rem; font-weight:600; outline:none;
      padding:.25rem .5rem; border-radius:.25rem;
    }
    .se-header__title:focus { background:var(--color-surface-raised); }
    .se-header__status { font-size:.75rem; font-family:var(--font-mono); white-space:nowrap; }
    .se-status--saved   { color:var(--color-accent-sage); }
    .se-status--unsaved { color:var(--color-ink-muted); }
    .se-status--saving  { color:var(--color-accent-gold); }
    .se-status--error   { color:var(--color-accent-burgundy); }
    .se-header__export { display:flex; gap:.25rem; }
    .se-header__btn { background:none; border:none; color:var(--color-ink-muted); cursor:pointer; padding:.375rem; border-radius:.25rem; display:flex; }
    .se-header__btn:hover { color:var(--color-ink-primary); background:var(--color-surface-raised); }
    .se-header__btn--danger:hover { color:var(--color-accent-burgundy); }

    /* Toolbar */
    .se-toolbar {
      display:flex; align-items:center; gap:.25rem; padding:.375rem .75rem;
      background:var(--color-surface-elevated); border-bottom:1px solid var(--color-border-subtle);
      flex-shrink:0; flex-wrap:wrap;
    }
    .se-toolbar__group { display:flex; gap:.125rem; }
    .se-toolbar__sep { width:1px; height:1.25rem; background:var(--color-border-subtle); margin:0 .375rem; }
    .se-toolbar button {
      background:none; border:1px solid transparent; color:var(--color-ink-secondary);
      cursor:pointer; padding:.25rem .5rem; border-radius:.25rem; font-size:.8125rem;
      font-family:var(--font-ui); display:flex; align-items:center; gap:.25rem; white-space:nowrap;
    }
    .se-toolbar button:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }
    .se-toolbar__block-btn { font-size:.75rem !important; }
    .se-toolbar__block-icon { font-size:.875rem; line-height:1; }

    /* Editor scroll container */
    .se-editor-scroll { flex:1; min-height:0; overflow-y:auto; background:var(--color-surface-base); }
    .se-editor { max-width:48rem; margin:0 auto; padding:2rem 1.5rem; }

    /* ProseMirror base styles */
    .sermon-prosemirror { outline:none; }
    .sermon-prosemirror p { margin:.5rem 0; line-height:1.625; font-family:'EB Garamond',Georgia,serif; font-size:1.125rem; color:var(--color-ink-primary); }
    .sermon-prosemirror h1 { font-family:'EB Garamond',Georgia,serif; font-size:1.75rem; font-weight:700; color:var(--color-ink-primary); margin:2rem 0 .75rem; }
    .sermon-prosemirror h2 { font-family:'EB Garamond',Georgia,serif; font-size:1.375rem; font-weight:700; color:var(--color-ink-primary); margin:1.5rem 0 .5rem; }
    .sermon-prosemirror h3 { font-family:'EB Garamond',Georgia,serif; font-size:1.125rem; font-weight:700; color:var(--color-ink-primary); margin:1.25rem 0 .5rem; }
    .sermon-prosemirror h4 { font-family:'EB Garamond',Georgia,serif; font-size:1rem; font-weight:600; color:var(--color-ink-secondary); margin:1rem 0 .375rem; }
    .sermon-prosemirror ul, .sermon-prosemirror ol { padding-left:1.5rem; margin:.5rem 0; }
    .sermon-prosemirror li { margin:.25rem 0; }
    .sermon-prosemirror blockquote { border-left:3px solid var(--color-border-subtle); padding-left:1rem; margin:.75rem 0; color:var(--color-ink-secondary); }
    .sermon-prosemirror hr { border:none; border-top:1px solid var(--color-border-subtle); margin:1.5rem 0; }
    .sermon-prosemirror strong { font-weight:700; }
    .sermon-prosemirror em { font-style:italic; }
    .sermon-prosemirror s { text-decoration:line-through; opacity:.6; }
    .sermon-prosemirror code { font-family:var(--font-mono); font-size:.875em; background:var(--color-surface-raised); padding:.1em .3em; border-radius:.2rem; }

    /* Custom sermon nodes */
    .scripture-block {
      border-left:3px solid var(--color-accent-gold) !important; padding:.75rem 1rem !important;
      background:color-mix(in srgb,var(--color-accent-gold) 6%,transparent) !important;
      margin:1rem 0 !important; border-radius:0 .375rem .375rem 0;
      font-family:'EB Garamond',Georgia,serif; color:var(--color-ink-scripture);
    }
    .point-heading--main {
      color:var(--color-accent-gold) !important; font-weight:700 !important;
      font-family:'EB Garamond',Georgia,serif; font-size:1.25rem !important;
      margin:1.75rem 0 .5rem !important;
    }
    .point-heading--sub {
      color:var(--color-ink-secondary) !important; font-weight:600 !important;
      font-family:'EB Garamond',Georgia,serif; font-size:1.0625rem !important;
      margin:1.25rem 0 .375rem !important;
    }
    .application-block {
      border-left:3px solid var(--color-accent-sage); padding:.75rem 1rem;
      background:color-mix(in srgb,var(--color-accent-sage) 8%,transparent);
      margin:1rem 0; border-radius:0 .375rem .375rem 0; position:relative;
    }
    .application-block::before {
      content:'\\279C'; position:absolute; left:-1.5rem; top:.75rem;
      color:var(--color-accent-sage); font-size:.875rem;
    }
    .illustration-block {
      border-left:3px solid var(--color-accent-burgundy); padding:.75rem 1rem;
      background:color-mix(in srgb,var(--color-accent-burgundy) 6%,transparent);
      margin:1rem 0; border-radius:0 .375rem .375rem 0;
    }
    .clipping-block {
      border-left:3px solid var(--color-ink-muted) !important; padding:.75rem 1rem !important;
      background:var(--color-surface-raised) !important;
      margin:1rem 0 !important; border-radius:0 .375rem .375rem 0;
    }
    .citation-note {
      color:var(--color-accent-gold); cursor:pointer; font-size:.8em;
      font-family:var(--font-mono); vertical-align:super;
    }

    /* Sermon list view */
    .se-list-view { flex:1; overflow-y:auto; padding:1.5rem; }
    .se-list-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1.5rem; }
    .se-list-header__title { font-family:'EB Garamond',Georgia,serif; font-size:1.5rem; font-weight:700; color:var(--color-ink-primary); margin:0; }
    .se-list-header__new {
      background:var(--color-accent-gold); color:var(--color-surface-base); border:none;
      padding:.5rem 1rem; border-radius:.375rem; font-family:var(--font-ui);
      font-size:.875rem; font-weight:600; cursor:pointer;
    }
    .se-list-header__new:hover { filter:brightness(1.1); }
    .se-list-items { display:flex; flex-direction:column; gap:.75rem; }
    .se-sermon-card {
      background:var(--color-surface-elevated); border:1px solid var(--color-border-subtle);
      border-radius:.5rem; padding:1rem 1.25rem; cursor:pointer; transition:border-color 150ms ease;
    }
    .se-sermon-card:hover { border-color:var(--color-accent-gold); }
    .se-sermon-card__title { font-family:'EB Garamond',Georgia,serif; font-size:1.125rem; font-weight:600; color:var(--color-ink-primary); margin:0 0 .375rem; }
    .se-sermon-card__meta { font-size:.8125rem; color:var(--color-ink-secondary); margin:0 0 .25rem; }
    .se-sermon-card__words { font-size:.75rem; color:var(--color-ink-muted); font-family:var(--font-mono); margin:0; }

    /* Empty state */
    .se-list-empty { text-align:center; padding:4rem 2rem; }
    .se-list-empty__title { font-family:'EB Garamond',Georgia,serif; font-size:1.25rem; color:var(--color-ink-primary); margin:.75rem 0 .5rem; }
    .se-list-empty__body { color:var(--color-ink-secondary); font-size:.9375rem; max-width:28rem; margin:0 auto .75rem; }
    .se-list-empty__btn {
      background:var(--color-accent-gold); color:var(--color-surface-base); border:none;
      padding:.625rem 1.25rem; border-radius:.375rem; font-family:var(--font-ui);
      font-size:.9375rem; font-weight:600; cursor:pointer;
    }
    .se-list-empty__btn:hover { filter:brightness(1.1); }

    /* ── Stage 5: Progress Panel ── */
    .pp-wrap { display:flex; flex-direction:column; gap:0; }
    .pp-section { padding:1rem; border-bottom:1px solid var(--color-border-subtle); }
    .pp-section:last-child { border-bottom:none; }
    .pp-section__hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:.75rem; }
    .pp-section__title { font-family:'EB Garamond',Georgia,serif; font-size:1rem; font-weight:600; color:var(--color-ink-primary); }
    .pp-section__badge { font-size:.75rem; font-family:var(--font-mono); color:var(--color-accent-gold); }
    .pp-day-nav {
      display:flex; align-items:center; gap:.375rem; margin-bottom:.75rem;
    }
    .pp-day-btn {
      flex:1; padding:.35rem .5rem; background:var(--color-surface-raised);
      border:1px solid var(--color-border-subtle); border-radius:.375rem;
      font-family:var(--font-ui); font-size:.75rem; color:var(--color-ink-secondary);
      cursor:pointer; transition:background 100ms, color 100ms;
    }
    .pp-day-btn:hover:not(:disabled) { background:var(--color-surface-modal); color:var(--color-ink-primary); }
    .pp-day-btn:disabled { opacity:.35; cursor:default; }
    .pp-day-btn--today { color:var(--color-accent-gold); border-color:var(--color-accent-gold); }
    .pp-day-btn--today:disabled { opacity:.5; }
    .pp-readings { display:flex; flex-direction:column; gap:.375rem; margin-bottom:.75rem; }
    .pp-reading {
      display:flex; align-items:center; gap:.5rem; background:var(--color-surface-elevated);
      border:1px solid var(--color-border-subtle); border-radius:.375rem; padding:.375rem .625rem;
      font-size:.8125rem; color:var(--color-ink-primary); font-family:var(--font-ui); cursor:pointer; text-align:left;
    }
    .pp-reading:hover { border-color:var(--color-accent-gold); }
    .pp-reading--done { color:var(--color-ink-muted); text-decoration:line-through; }
    .pp-reading--done .pp-reading__check { color:var(--color-accent-sage); }
    .pp-reading__check { font-size:.875rem; width:1rem; flex-shrink:0; }
    .pp-reading__uncheck {
      margin-left:auto; font-size:.75rem; color:var(--color-ink-muted); opacity:0;
      transition:opacity 100ms;
    }
    .pp-reading--done:hover .pp-reading__uncheck { opacity:1; }
    .pp-reading--done:hover { text-decoration:none; border-color:var(--color-accent-burgundy); }
    .pp-reading--done:hover .pp-reading__check { color:var(--color-ink-muted); }
    .pp-btn-all {
      width:100%; padding:.5rem; background:var(--color-accent-gold); color:var(--color-surface-base);
      border:none; border-radius:.375rem; font-family:var(--font-ui); font-size:.8125rem;
      font-weight:600; cursor:pointer; margin-bottom:.5rem;
    }
    .pp-btn-all:hover { filter:brightness(1.1); }
    .pp-complete { font-size:.8125rem; color:var(--color-accent-sage); font-weight:600; margin:.5rem 0; }
    .pp-btn-reset { background:none; border:none; color:var(--color-ink-muted); font-size:.75rem; cursor:pointer; padding:0; font-family:var(--font-ui); }
    .pp-btn-reset:hover { color:var(--color-ink-secondary); text-decoration:underline; }
    /* Plan selector */
    .pp-section--plan-select { background: color-mix(in srgb, var(--color-accent-gold) 4%, transparent); }
    .pp-plan-select {
      width:100%; background:var(--color-surface-raised);
      border:1px solid var(--color-border-subtle); border-radius:.375rem;
      padding:.4rem .625rem; font-size:.875rem; color:var(--color-ink-primary);
      font-family:var(--font-ui); cursor:pointer; margin-bottom:.5rem;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23A39E93' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right .625rem center;
      padding-right: 2rem;
    }
    .pp-plan-select:focus { outline: 2px solid var(--color-accent-gold); outline-offset: 2px; }
    .pp-plan-desc { margin:0; font-size:.75rem; color:var(--color-ink-muted); line-height:1.4; }
    /* Stream grouping (M'Cheyne, Psalms & Proverbs) */
    .pp-stream { margin-bottom:.625rem; }
    .pp-stream__label {
      display:block; font-size:.6875rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.07em; color:var(--color-accent-gold); margin-bottom:.3rem;
      padding-left:.125rem;
    }

    /* Heatmap */
    .pp-heatmap { display:flex; flex-wrap:wrap; gap:.25rem; }
    .pp-cell {
      width:2.625rem; height:2.25rem; border:none; border-radius:.25rem; cursor:pointer;
      background:color-mix(in srgb, var(--color-accent-gold) calc(var(--cell-op, 0.07) * 100%), var(--color-surface-raised));
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.05rem;
      transition:transform 150ms ease, outline 150ms ease;
    }
    .pp-cell:hover { transform:scale(1.1); outline:2px solid var(--color-accent-gold); }
    .pp-cell--done { outline:1px solid var(--color-accent-gold); }
    .pp-cell__abbr { font-size:.6rem; font-family:var(--font-mono); color:var(--color-ink-primary); line-height:1; }
    .pp-heatmap-legend { display:flex; align-items:center; gap:.75rem; font-size:.7rem; color:var(--color-ink-muted); margin:.5rem 0 0; }
    .pp-legend-swatch { width:.875rem; height:.875rem; border-radius:.125rem; display:inline-block; }
    .pp-legend-swatch--unread  { background:color-mix(in srgb,var(--color-accent-gold) 7%,var(--color-surface-raised)); }
    .pp-legend-swatch--partial { background:color-mix(in srgb,var(--color-accent-gold) 50%,var(--color-surface-raised)); }
    .pp-legend-swatch--done    { background:var(--color-accent-gold); }

    /* ── No data / mock notice ── */
    .reading-pane__no-data { padding:3rem 1rem; text-align:center; }
    .reading-pane__no-data-title { font-family:var(--font-scripture); font-size:1.25rem; color:var(--color-ink-primary); margin:0 0 .5rem; }
    .reading-pane__no-data-body { color:var(--color-ink-secondary); font-size:.9375rem; margin:0 0 .75rem; }
    .reading-pane__no-data-hint { color:var(--color-ink-muted); font-size:.8125rem; margin:0; }
    .mock-notice { margin:2rem 0 0; font-size:.75rem; color:var(--color-ink-muted); font-family:var(--font-mono); text-align:center; }

    /* ── Verse menu ── */
    .verse-menu {
      background:var(--color-surface-modal); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-panel); box-shadow:0 8px 24px rgba(0,0,0,.5);
      overflow:hidden; min-width:160px;
    }
    .verse-menu__item {
      display:flex; align-items:center; gap:.5rem; width:100%; padding:.5rem .75rem;
      background:none; border:none; color:var(--color-ink-primary); font-size:.875rem;
      font-family:var(--font-ui); cursor:pointer; text-align:left;
    }
    .verse-menu__item:hover { background:var(--color-surface-raised); }

    /* ── Book / Chapter pickers ── */
    .book-picker, .chapter-picker {
      position:fixed; top:3.5rem; left:var(--sidebar-width,3.5rem); z-index:400;
      background:var(--color-surface-modal); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-panel); box-shadow:0 12px 40px rgba(0,0,0,.6);
      max-height:70vh; overflow-y:auto;
    }
    .book-picker__sections { display:flex; gap:1.5rem; padding:1rem; }
    .book-picker__heading { font-size:.6875rem; font-weight:600; color:var(--color-ink-muted); text-transform:uppercase; letter-spacing:.08em; margin:0 0 .5rem; }
    .book-picker__grid { display:grid; grid-template-columns:repeat(5,1fr); gap:.25rem; }
    .book-picker__book {
      padding:.25rem .375rem; background:none; border:1px solid var(--color-border-subtle);
      border-radius:3px; font-size:.75rem; color:var(--color-ink-secondary); cursor:pointer;
      font-family:var(--font-ui); transition:background 100ms, color 100ms; white-space:nowrap;
    }
    .book-picker__book:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }
    .chapter-picker { padding:.75rem; }
    .chapter-picker__grid { display:grid; grid-template-columns:repeat(8,1fr); gap:.25rem; }
    .chapter-picker__num {
      padding:.375rem; background:none; border:1px solid var(--color-border-subtle);
      border-radius:3px; font-size:.8125rem; color:var(--color-ink-secondary); cursor:pointer;
      font-family:var(--font-mono); text-align:center; transition:background 100ms;
    }
    .chapter-picker__num:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }
    .chapter-picker__num--active { background:color-mix(in srgb,var(--color-accent-gold) 15%,transparent); color:var(--color-accent-gold); border-color:var(--color-accent-gold); }

    /* ── Command Palette ── */
    .command-palette {
      position:fixed; top:12%; left:50%; transform:translateX(-50%); width:min(640px,90vw);
      background:var(--color-surface-modal); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-panel); padding:0; box-shadow:0 20px 60px rgba(0,0,0,.7);
      overflow:hidden; margin:0;
    }
    .command-palette::backdrop { background:rgba(0,0,0,.5); backdrop-filter:blur(2px); }
    .command-palette__inner { display:flex; flex-direction:column; }
    .command-palette__search {
      display:flex; align-items:center; gap:.75rem; padding:.875rem 1rem;
      border-bottom:1px solid var(--color-border-subtle); color:var(--color-ink-muted);
    }
    .command-palette__search input {
      flex:1; background:none; border:none; outline:none;
      font-family:var(--font-ui); font-size:1rem; color:var(--color-ink-primary);
    }
    .command-palette__search input::placeholder { color:var(--color-ink-muted); }
    .cp-esc-hint { font-size:.6875rem; color:var(--color-ink-muted); border:1px solid var(--color-border-subtle); border-radius:3px; padding:.125rem .375rem; font-family:var(--font-mono); }
    .command-palette__results { max-height:380px; overflow-y:auto; padding:.375rem; }
    .cp-hint { margin:0; padding:.75rem; color:var(--color-ink-muted); font-size:.875rem; text-align:center; }
    .cp-result {
      display:flex; flex-direction:column; width:100%; padding:.5rem .75rem; gap:.125rem;
      background:none; border:none; border-radius:var(--radius-ui); cursor:pointer; text-align:left;
      transition:background 80ms;
    }
    .cp-result:hover, .cp-result[data-focused="true"] { background:var(--color-surface-raised); }
    .cp-result__label { font-size:.9375rem; color:var(--color-ink-primary); font-family:var(--font-ui); }
    .cp-result__sub { font-size:.75rem; color:var(--color-ink-muted); }

    /* ── Toast ── */
    .toast-container { position:fixed; bottom:1.5rem; right:1.5rem; z-index:9000; display:flex; flex-direction:column; gap:.5rem; pointer-events:none; }
    .toast {
      padding:.625rem 1rem; background:var(--color-surface-modal); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-panel); font-size:.875rem; color:var(--color-ink-primary);
      box-shadow:0 4px 16px rgba(0,0,0,.4); opacity:0; transform:translateY(.5rem);
      transition:opacity 200ms var(--ease-berean), transform 200ms var(--ease-berean);
      pointer-events:auto; max-width:320px;
    }
    .toast--visible { opacity:1; transform:translateY(0); }
    .toast--error { border-color:var(--color-accent-burgundy); }

    /* ── Settings Modal ── */
    .settings-modal {
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      width:min(580px,90vw); max-height:85vh; overflow-y:auto;
      background:var(--color-surface-modal); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-panel); padding:0; box-shadow:0 20px 60px rgba(0,0,0,.7); margin:0;
    }
    .settings-modal::backdrop { background:rgba(0,0,0,.5); backdrop-filter:blur(2px); }
    .settings-modal__inner { display:flex; flex-direction:column; }
    .settings-modal__header { display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; border-bottom:1px solid var(--color-border-subtle); }
    .settings-modal__title { margin:0; font-size:1rem; font-weight:600; color:var(--color-ink-primary); }
    .settings-modal__close { background:none; border:none; cursor:pointer; color:var(--color-ink-muted); display:flex; padding:.25rem; border-radius:var(--radius-ui); }
    .settings-modal__close:hover { color:var(--color-ink-primary); background:var(--color-surface-raised); }
    .settings-modal__body { padding:1rem 1.25rem; display:flex; flex-direction:column; gap:1.25rem; }
    .settings-ai-multi-key {
      background:color-mix(in srgb,var(--color-accent-sage) 10%,transparent);
      border:1px solid color-mix(in srgb,var(--color-accent-sage) 30%,transparent);
      border-radius:var(--radius-ui); padding:.625rem .75rem;
    }
    .settings-ai-multi-key__text { font-size:.8rem; color:var(--color-ink-secondary); line-height:1.5; margin:0; }
    .settings-section { display:flex; flex-direction:column; gap:.75rem; }
    .settings-section__title { font-size:.75rem; font-weight:600; color:var(--color-ink-muted); text-transform:uppercase; letter-spacing:.08em; margin:0; }
    .settings-section__note { font-weight:400; text-transform:none; letter-spacing:0; font-size:.6875rem; }
    .settings-section--about { border-top:1px solid var(--color-border-subtle); padding-top:1rem; }
    .settings-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .settings-row__label { font-size:.875rem; color:var(--color-ink-secondary); }
    .settings-row__control { display:flex; gap:.375rem; }
    .settings-theme-btn, .settings-lang-btn, .settings-font-btn {
      padding:.3rem .75rem; background:var(--color-surface-raised); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-ui); font-size:.8125rem; color:var(--color-ink-secondary); cursor:pointer; font-family:var(--font-ui);
    }
    .settings-theme-btn.active, .settings-lang-btn.active, .settings-font-btn.active {
      background:color-mix(in srgb,var(--color-accent-gold) 15%,transparent);
      border-color:var(--color-accent-gold); color:var(--color-ink-primary);
    }
    .settings-provider { display:flex; align-items:center; justify-content:space-between; padding:.625rem .75rem; background:var(--color-surface-raised); border-radius:var(--radius-ui); gap:1rem; }
    .settings-provider__info { display:flex; flex-direction:column; gap:.125rem; }
    .settings-provider__name { font-size:.875rem; color:var(--color-ink-primary); display:flex; align-items:center; gap:.4rem; flex-wrap:wrap; }
    .settings-provider__note { font-size:.75rem; color:var(--color-ink-muted); }
    .settings-provider__key-link { font-size:.72rem; color:var(--color-accent-sage); text-decoration:none; }
    .settings-provider__key-link:hover { text-decoration:underline; }
    .settings-provider__free-badge {
      font-size:.6rem; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
      padding:.1rem .35rem; border-radius:.25rem;
      background:color-mix(in srgb,var(--color-accent-sage) 20%,transparent);
      color:var(--color-accent-sage); border:1px solid color-mix(in srgb,var(--color-accent-sage) 40%,transparent);
    }
    .settings-provider__status { display:flex; align-items:center; gap:.5rem; flex-shrink:0; }
    .settings-provider__saved { font-size:.75rem; color:var(--color-accent-gold); font-family:var(--font-mono); }
    .settings-provider__add, .settings-provider__delete {
      padding:.25rem .625rem; border-radius:var(--radius-ui); font-size:.75rem; cursor:pointer; font-family:var(--font-ui); border:1px solid var(--color-border-subtle);
    }
    .settings-provider__add { background:var(--color-surface-modal); color:var(--color-ink-secondary); }
    .settings-provider__add:hover { border-color:var(--color-accent-gold); color:var(--color-accent-gold); }
    .settings-provider__delete { background:none; color:var(--color-ink-muted); }
    .settings-provider__delete:hover { border-color:var(--color-accent-burgundy); color:var(--color-accent-burgundy); }
    .settings-key-form { background:var(--color-surface-raised); border-radius:var(--radius-panel); padding:1rem; gap:.75rem; }
    .settings-key-instructions {
      background:var(--color-surface-elevated); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-ui); padding:.625rem .75rem;
      display:flex; flex-direction:column; gap:.375rem;
    }
    .settings-key-instructions--free { border-color:color-mix(in srgb,var(--color-accent-sage) 40%,transparent); }
    .settings-key-instructions__badge {
      font-size:.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
      color:var(--color-accent-sage);
    }
    .settings-key-instructions__text { font-size:.8rem; color:var(--color-ink-secondary); line-height:1.5; margin:0; }
    .settings-key-instructions__text strong { color:var(--color-ink-primary); }
    .settings-key-instructions__link {
      font-size:.8rem; color:var(--color-accent-gold); text-decoration:none; align-self:flex-start;
    }
    .settings-key-instructions__link:hover { text-decoration:underline; }
    .settings-field { display:flex; flex-direction:column; gap:.25rem; }
    .settings-field__label { font-size:.8125rem; color:var(--color-ink-secondary); }
    .settings-field__hint { font-size:.75rem; color:var(--color-ink-muted); }
    .settings-field__input {
      padding:.5rem .75rem; background:var(--color-surface-modal); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-ui); font-size:.875rem; color:var(--color-ink-primary); font-family:var(--font-ui); outline:none;
    }
    .settings-field__input:focus { border-color:var(--color-accent-gold); }
    .settings-field__input--pin { max-width:120px; font-family:var(--font-mono); letter-spacing:.25em; }
    .settings-field--actions { flex-direction:row; gap:.5rem; }
    .settings-btn { padding:.4rem .875rem; border-radius:var(--radius-ui); font-size:.875rem; cursor:pointer; font-family:var(--font-ui); border:1px solid var(--color-border-subtle); background:var(--color-surface-raised); color:var(--color-ink-secondary); }
    .settings-btn--primary { background:var(--color-accent-gold); border-color:var(--color-accent-gold); color:#0a0a0a; font-weight:600; }
    .settings-btn--primary:hover { opacity:.9; }
    /* ── Commentary settings ── */
    .settings-comm__toolbar { display:flex; align-items:center; justify-content:space-between; gap:.5rem; flex-wrap:wrap; }
    .settings-comm__hint { font-size:.8125rem; color:var(--color-ink-secondary); margin:0; }
    .settings-comm__toolbar-btns { display:flex; gap:.375rem; flex-shrink:0; }
    .settings-comm__grid {
      display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
      gap:.375rem .75rem;
    }
    .settings-comm__item {
      display:flex; align-items:center; gap:.45rem; cursor:pointer;
      font-size:.8125rem; color:var(--color-ink-secondary);
      padding:.25rem .375rem; border-radius:var(--radius-ui);
    }
    .settings-comm__item:hover { background:var(--color-surface-raised); color:var(--color-ink-primary); }
    .settings-comm__check { accent-color:var(--color-accent-gold); cursor:pointer; flex-shrink:0; width:.9rem; height:.9rem; }
    .settings-comm__upload-block {
      display:flex; flex-direction:column; gap:.5rem;
      background:var(--color-surface-raised); border-radius:var(--radius-ui); padding:.625rem .75rem;
    }
    .settings-comm__upload-title { font-size:.8125rem; font-weight:600; color:var(--color-ink-primary); }
    .settings-comm__upload-row { display:flex; align-items:center; gap:.625rem; flex-wrap:wrap; }
    .settings-comm__upload-file { font-size:.8125rem; color:var(--color-accent-sage); font-family:var(--font-mono); }
    .settings-comm__upload-date { font-size:.75rem; color:var(--color-ink-muted); margin-left:auto; }
    .settings-comm__upload-hint { font-size:.75rem; color:var(--color-ink-muted); }
    .settings-comm__upload-hint code { font-family:var(--font-mono); font-size:.7rem; }
    .settings-comm__upload-schema { font-size:.7rem; color:var(--color-ink-muted); margin:0; line-height:1.5; }
    .settings-comm__upload-schema code { font-family:var(--font-mono); font-size:.68rem; }
    .settings-about { margin:0; font-size:.8125rem; color:var(--color-ink-secondary); }
    .settings-about--muted { color:var(--color-ink-muted); }

    /* ═══════════════════════════════════════════════════════════
       MOBILE — all rules below only activate on ≤ 768 px.
       Desktop layout is unchanged above this point.
       ═══════════════════════════════════════════════════════════ */

    /* ── Mobile top bar (hidden on desktop) ── */
    .mobile-topbar { display:none; }

    @media (max-width: 768px) {
      /* Top bar */
      .mobile-topbar {
        display:flex; align-items:center; gap:.75rem;
        position:fixed; top:0; left:0; right:0; z-index:200;
        height:3rem;
        padding:0 .75rem;
        padding-top:env(safe-area-inset-top);
        background:var(--color-surface-elevated);
        border-bottom:1px solid var(--color-border-subtle);
        flex-shrink:0;
      }
      .mobile-topbar__hamburger {
        width:2.75rem; height:2.75rem; min-width:2.75rem;
        display:flex; align-items:center; justify-content:center;
        background:none; border:none; color:var(--color-ink-secondary);
        border-radius:var(--radius-ui); cursor:pointer;
      }
      .mobile-topbar__logo { display:flex; align-items:center; gap:.5rem; flex:1; }
      .mobile-topbar__title {
        font-family:var(--font-scripture); font-size:1.125rem; font-weight:600;
        color:var(--color-ink-primary);
      }
      .mobile-topbar__pane-switcher {
        display:flex; gap:.25rem;
        background:var(--color-surface-raised);
        border-radius:.5rem; padding:.2rem;
      }
      .mobile-topbar__pane-btn {
        padding:.3rem .75rem; border:none; border-radius:.375rem;
        font-family:var(--font-ui); font-size:.8125rem; font-weight:500;
        color:var(--color-ink-muted); background:none; cursor:pointer;
        transition:background 100ms, color 100ms;
        min-height:2rem;
      }
      .mobile-topbar__pane-btn--active {
        background:var(--color-surface-elevated);
        color:var(--color-accent-gold);
        box-shadow:0 1px 3px rgba(0,0,0,.25);
      }

      /* Sidebar backdrop */
      .sidebar-backdrop {
        display:none; position:fixed; inset:0; z-index:299;
        background:rgba(0,0,0,.55);
      }
      .sidebar-backdrop--visible { display:block; }

      /* Sidebar becomes a drawer on mobile */
      #app { flex-direction:column; }
      .sidebar {
        position:fixed; top:0; left:0; bottom:0; z-index:300;
        width:260px; min-width:260px;
        transform:translateX(-100%);
        transition:transform 220ms var(--ease-berean);
        padding-top:calc(.75rem + env(safe-area-inset-top));
        padding-bottom:env(safe-area-inset-bottom);
        align-items:flex-start;
      }
      .sidebar--drawer-open { transform:translateX(0); }
      /* On mobile show labels beside icons */
      .sidebar__nav { padding:0 .5rem; gap:.125rem; }
      .sidebar__item {
        aspect-ratio:unset; flex-direction:row; justify-content:flex-start;
        width:100%; padding:.75rem .875rem; gap:.875rem;
        min-height:3rem;
      }
      .sidebar__item-icon { flex-shrink:0; display:flex; align-items:center; }
      .sidebar__item-label { font-family:var(--font-ui); font-size:.9375rem; }
      .sidebar__bottom { padding:.5rem .5rem; }

      /* Main content fills below top bar */
      .main-content {
        flex-direction:column;
        margin-top:3rem; /* top bar height */
        height:calc(100dvh - 3rem);
        overflow:hidden;
      }
      /* Mobile pane visibility */
      .main-content--mobile #bible-pane,
      .main-content--mobile #right-panel {
        flex:1; width:100%; min-width:0;
        /* both visible by default — CSS handles show/hide */
      }
      /* Hide a pane when the switcher hides it */
      .mobile-pane--hidden { display:none !important; }

      /* Right panel fills full width on mobile */
      .main-content--mobile #right-panel {
        display:flex; flex-direction:column; overflow:hidden;
      }

      /* No gutter on mobile */
      .gutter { display:none !important; }

      /* Tab bar — scrollable horizontal strip instead of 2-row grid */
      .rp-tabs {
        display:flex !important;
        overflow-x:auto;
        scroll-snap-type:x mandatory;
        -webkit-overflow-scrolling:touch;
        border-bottom:1px solid var(--color-border-subtle);
        flex-shrink:0;
        scrollbar-width:none;
      }
      .rp-tabs::-webkit-scrollbar { display:none; }
      .rp-tab {
        flex:0 0 auto;
        scroll-snap-align:start;
        min-width:5rem;
        padding:.5rem .625rem;
        font-size:.6875rem;
        border-bottom:2px solid transparent;
        border-top:none !important; /* remove desktop 2nd-row border */
        min-height:2.75rem;
      }

      /* Tap targets — sidebar already set to 3rem above */
      .reading-pane__nav-btn { width:2.75rem; height:2.75rem; }
      .reading-pane__action-btn { width:2.75rem; height:2.75rem; }
      .verse-number { min-width:2rem; padding:.5rem .25rem 0 0; }
      .selection-bar__btn { padding:.5rem .75rem; min-height:2.75rem; }

      /* Reading pane — tighter horizontal padding on small screens */
      .reading-pane__chapter { padding:1rem 1rem 5rem; }

      /* Reading pane header — two rows on mobile so all buttons stay accessible */
      .reading-pane__header {
        padding:.375rem .5rem;
        flex-wrap:wrap;
        gap:.25rem;
      }
      .reading-pane__nav { flex:1; min-width:0; }
      .reading-pane__actions {
        width:100%;
        overflow-x:auto;
        scrollbar-width:none;
        padding-bottom:.125rem;
        justify-content:flex-start;
        gap:.125rem;
      }
      .reading-pane__actions::-webkit-scrollbar { display:none; }
      /* Make all action buttons the same comfortable size in the second row */
      .reading-pane__actions .reading-pane__action-btn,
      .reading-pane__actions .reading-pane__nav-btn,
      .reading-pane__actions .reading-pane__translation-tag {
        flex-shrink:0;
      }

      /* Verse text — disable browser text selection so taps feel like taps */
      .verse-text { user-select:none; -webkit-user-select:none; }
      /* Verse container tappable area */
      .verse-container { cursor:pointer; }

      /* Safe-area padding for fixed/sticky elements at bottom */
      .toast-container {
        bottom:calc(1.5rem + env(safe-area-inset-bottom));
        right:calc(1rem + env(safe-area-inset-right));
      }

      /* Selection bar — stack vertically on narrow screens, always on screen */
      .selection-bar {
        position:sticky;
        top:.5rem;
        width:calc(100% - 1rem);
        max-width:none;
        border-radius:.75rem;
        flex-direction:column;
        align-items:flex-start;
        gap:.5rem;
        padding:.625rem .875rem;
        margin:.5rem .5rem 0;
      }
      .selection-bar__actions {
        flex-wrap:wrap;
        gap:.375rem;
      }
      .selection-bar__btn {
        padding:.4rem .75rem;
        font-size:.8125rem;
      }

      /* Command palette — full width on small screens */
      .command-palette {
        width:calc(100vw - 1.5rem) !important;
        max-width:none !important;
        margin:env(safe-area-inset-top) auto 0;
        border-radius:.75rem;
      }

      /* Settings modal — full screen on mobile */
      .settings-modal {
        width:100vw !important; max-width:100vw !important;
        height:100dvh !important; max-height:100dvh !important;
        margin:0 !important; border-radius:0 !important;
        padding-top:env(safe-area-inset-top);
        padding-bottom:env(safe-area-inset-bottom);
      }

      /* Focus mode still works — hide sidebar (it's already off-screen) */
      .focus-mode .mobile-topbar { display:none; }
      .focus-mode .main-content { margin-top:0; height:100dvh; }

      /* Sermon view fills below top bar */
      .sermon-view { margin-top:0; }

      /* TipTap toolbar — single scrollable row on mobile (no wrap) */
      .se-toolbar {
        flex-wrap:nowrap !important;
        overflow-x:auto;
        scroll-snap-type:x proximity;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:none;
        padding:.375rem .5rem;
      }
      .se-toolbar::-webkit-scrollbar { display:none; }
      .se-toolbar button { min-height:2.75rem; padding:.4rem .625rem; }
      .se-toolbar__sep { flex-shrink:0; }
    }
  `;
  document.head.appendChild(style);

  // ── Stage 2 CSS ────────────────────────────────────────────
  const stage2 = document.createElement('style');
  stage2.id = 'stage2-css';
  stage2.textContent = `
    /* ── Word Study Panel ── */
    .ws-panel { display:flex; flex-direction:column; height:100%; overflow-y:auto; }
    .ws-header { padding:1rem 1.25rem; border-bottom:1px solid var(--color-border-subtle); background:var(--color-surface-elevated); }
    .ws-header__top { display:flex; align-items:center; gap:.5rem; margin-bottom:.5rem; }
    .ws-header__id { font-family:var(--font-mono,"Fira Code",monospace); font-size:.75rem; color:var(--color-accent-gold); }
    .ws-header__pos { font-size:.75rem; color:var(--color-ink-muted); background:var(--color-surface-raised); padding:.1rem .4rem; border-radius:3px; }
    .ws-close { margin-left:auto; background:none; border:none; cursor:pointer; color:var(--color-ink-muted); display:flex; padding:.25rem; border-radius:var(--radius-ui,.375rem); }
    .ws-close:hover { color:var(--color-ink-primary); background:var(--color-surface-raised); }
    .ws-header__lemma-row { display:flex; align-items:baseline; gap:.5rem; flex-wrap:wrap; }
    .ws-header__lemma { font-size:1.625rem; line-height:1.2; color:var(--color-ink-scripture); }
    .ws-header__lemma.hebrew { font-family:"Ezra SIL OT","Times New Roman",serif; font-size:2rem; }
    .ws-header__lemma.greek  { font-family:"Gentium Plus","Times New Roman",serif; }
    .ws-header__translit { font-style:italic; color:var(--color-ink-secondary); font-size:.9375rem; }
    .ws-header__pron { color:var(--color-ink-muted); font-size:.875rem; }
    .ws-header__def { margin:.625rem 0 0; color:var(--color-ink-primary); font-size:.9375rem; line-height:1.5; }
    .ws-header__gloss { font-size:.875rem; color:var(--color-ink-secondary); }

    /* ── Sections ── */
    .ws-section { padding:.875rem 1.25rem; border-bottom:1px solid var(--color-border-subtle); }
    .ws-section__title { margin:0 0 .5rem; font-size:.6875rem; font-weight:600; color:var(--color-ink-muted); text-transform:uppercase; letter-spacing:.08em; display:flex; align-items:center; justify-content:space-between; }
    .ws-section__count { font-weight:400; text-transform:none; letter-spacing:0; color:var(--color-accent-gold); font-family:var(--font-mono,"Fira Code",monospace); font-size:.75rem; }
    .ws-section__body { margin:0; font-size:.875rem; color:var(--color-ink-secondary); line-height:1.55; }

    /* ── Cognates ── */
    .ws-cognates { display:flex; flex-wrap:wrap; gap:.375rem; margin-top:.5rem; }
    .ws-cognate-btn { padding:.2rem .5rem; background:var(--color-surface-raised); border:1px solid var(--color-border-subtle); border-radius:3px; font-size:.75rem; color:var(--color-accent-gold); cursor:pointer; font-family:var(--font-mono,"Fira Code",monospace); }
    .ws-cognate-btn:hover { border-color:var(--color-accent-gold); }

    /* ── Louw-Nida ── */
    .ws-ln-domain { display:flex; align-items:baseline; gap:.5rem; flex-wrap:wrap; margin-bottom:.375rem; }
    .ws-ln-domain__num { font-family:var(--font-mono,"Fira Code",monospace); font-size:.75rem; color:var(--color-accent-gold); flex-shrink:0; }
    .ws-ln-domain__name { font-size:.8125rem; color:var(--color-ink-primary); }
    .ws-ln-domain__gloss { font-size:.8125rem; color:var(--color-ink-secondary); font-style:italic; }

    /* ── Chart ── */
    .ws-chart { width:100%; min-height:120px; }

    /* ── Concordance ── */
    .ws-concordance { overflow-y:auto; }
    .ws-conc-book { }
    .ws-conc-book__header { list-style:none; display:flex; align-items:center; justify-content:space-between; padding:.4rem .25rem; cursor:pointer; user-select:none; font-size:.8125rem; color:var(--color-ink-secondary); font-weight:600; }
    .ws-conc-book__header::-webkit-details-marker { display:none; }
    .ws-conc-book__count { font-family:var(--font-mono,"Fira Code",monospace); font-size:.75rem; color:var(--color-ink-muted); }
    .ws-conc-book__verses { display:flex; flex-direction:column; }
    .ws-conc-verse { display:flex; align-items:baseline; gap:.5rem; width:100%; padding:.3rem .25rem; background:none; border:none; cursor:pointer; text-align:left; border-radius:var(--radius-ui,.375rem); transition:background 80ms; }
    .ws-conc-verse:hover { background:var(--color-surface-raised); }
    .ws-conc-verse__ref { flex-shrink:0; min-width:3rem; font-family:var(--font-mono,"Fira Code",monospace); font-size:.6875rem; color:var(--color-accent-gold); }
    .ws-conc-verse__text { font-size:.8125rem; color:var(--color-ink-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .ws-conc-empty { padding:.5rem .25rem; font-size:.875rem; color:var(--color-ink-muted); margin:0; }

    /* ── Skeleton ── */
    .ws-skeleton { padding:.875rem 1.25rem; display:flex; flex-direction:column; gap:.625rem; }
    .ws-skeleton__line { height:.75rem; background:var(--color-surface-raised); border-radius:3px; animation:ws-pulse 1.4s ease-in-out infinite; }
    .ws-skeleton__line--wide  { width:90%; }
    .ws-skeleton__line--narrow{ width:55%; }
    @keyframes ws-pulse { 0%,100%{ opacity:.5; } 50%{ opacity:1; } }
    @media (prefers-reduced-motion:reduce) { .ws-skeleton__line { animation:none; } }
  `;
  document.head.appendChild(stage2);

  // ── Stage 3 CSS ─────────────────────────────────────────────
  const stage3 = document.createElement('style');
  stage3.id = 'stage3-css';
  stage3.textContent = `
    /* ── Right panel tabs ── */
    .right-panel { display:flex; flex-direction:column; overflow:hidden; background:var(--color-surface-elevated); }
    .rp-tabs {
      display:grid; grid-template-columns:repeat(6,1fr);
      border-bottom:1px solid var(--color-border-subtle); flex-shrink:0;
    }
    .rp-tab {
      padding:.4rem .25rem; background:none; border:none; border-bottom:2px solid transparent;
      font-family:var(--font-ui); font-size:.625rem; color:var(--color-ink-muted); cursor:pointer;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center; min-width:0;
      transition:color 100ms, border-color 100ms;
    }
    .rp-tab:nth-child(n+7) { border-top:1px solid var(--color-border-subtle); }
    .rp-tab:hover { color:var(--color-ink-primary); }
    .rp-tab--active { color:var(--color-accent-gold); border-bottom-color:var(--color-accent-gold); }
    .rp-pane { flex:1; overflow-y:auto; flex-direction:column; display:none; }
    .rp-pane--active { display:flex; }

    /* ── Commentary panel ── */
    .comm-loading { padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.875rem; }
    .comm-loading--progress { gap:.625rem; }
    .comm-skeleton { display:flex; flex-direction:column; gap:.5rem; }
    .comm-sk-line { height:.7rem; background:var(--color-surface-raised); border-radius:3px; animation:ws-pulse 1.4s ease-in-out infinite; }
    .comm-sk-line.wide  { width:90%; }
    .comm-sk-line.narrow{ width:60%; }

    /* Progress bar */
    .comm-progress-header { display:flex; justify-content:space-between; align-items:baseline; }
    .comm-progress-label  { font-size:.8125rem; color:var(--color-ink-secondary); }
    .comm-progress-pct    { font-family:var(--font-mono); font-size:.75rem; color:var(--color-accent-gold); }
    .comm-progress-track  {
      height:4px; background:var(--color-surface-raised); border-radius:2px; overflow:hidden;
    }
    .comm-progress-fill   {
      height:100%; width:0; background:var(--color-accent-gold); border-radius:2px;
      transition:width 380ms cubic-bezier(0.4,0,0.2,1);
    }
    .comm-progress-note   { font-size:.75rem; color:var(--color-ink-muted); margin:0; line-height:1.5; }
    @media (prefers-reduced-motion:reduce) { .comm-progress-fill { transition:none; } }

    .comm-empty { padding:2rem 1.5rem; }
    .comm-empty__title { font-size:.9375rem; color:var(--color-ink-secondary); margin:0 0 .375rem; }
    .comm-empty__body  { font-size:.8125rem; color:var(--color-ink-muted); margin:0; }
    .comm-empty__err   { font-family:var(--font-mono); font-size:.75rem; word-break:break-all; background:var(--color-surface-raised); padding:.15rem .35rem; border-radius:3px; }
    .comm-retry-btn    { padding:.3rem .8rem; font-size:.8125rem; background:none; border:1px solid var(--color-border-subtle); border-radius:.375rem; color:var(--color-ink-secondary); cursor:pointer; transition:background-color 120ms; }
    .comm-retry-btn:hover { background:var(--color-surface-raised); }
    .comm-source { border-bottom:1px solid var(--color-border-subtle); }
    .comm-source__header {
      display:flex; align-items:center; justify-content:space-between;
      padding:.625rem 1.25rem; cursor:pointer; list-style:none; user-select:none;
    }
    .comm-source__header::-webkit-details-marker { display:none; }
    .comm-source__name  { font-size:.8125rem; font-weight:600; color:var(--color-ink-primary); }
    .comm-source__count { font-family:var(--font-mono); font-size:.6875rem; color:var(--color-ink-muted); }
    .comm-source__body  { padding:0 1.25rem 1rem; }
    .comm-entry { padding:.625rem 0; border-top:1px solid var(--color-border-subtle); }
    .comm-entry:first-child { border-top:none; }
    .comm-entry--active { background:color-mix(in srgb,var(--color-accent-gold) 6%,transparent); border-radius:var(--radius-ui); margin:0 -.5rem; padding:.625rem .5rem; }
    .comm-entry__ref { display:inline-block; font-family:var(--font-mono); font-size:.6875rem; color:var(--color-accent-gold); margin-bottom:.375rem; }
    .comm-entry__text { font-size:.8125rem; color:var(--color-ink-secondary); line-height:1.6; }
    .comm-entry__text p { margin:.5rem 0 0; }
    .comm-entry__text p:first-child { margin-top:0; }

    /* ── Commentary AI summarise ── */
    .comm-source__header { display:flex; align-items:center; gap:.5rem; }
    .comm-ai-btn {
      margin-left:auto; flex-shrink:0;
      padding:.15rem .5rem; font-size:.6875rem;
      background:none; border:1px solid var(--color-border-subtle);
      border-radius:999px; color:var(--color-accent-gold);
      cursor:pointer; transition:background-color 120ms;
    }
    .comm-ai-btn:hover { background:color-mix(in srgb,var(--color-accent-gold) 10%,transparent); }
    .comm-ai-btn:disabled { opacity:.5; cursor:not-allowed; }
    .comm-ai-output {
      margin:.25rem 1.25rem .5rem;
      padding:.75rem;
      background:color-mix(in srgb,var(--color-accent-gold) 5%,transparent);
      border:1px solid color-mix(in srgb,var(--color-accent-gold) 20%,transparent);
      border-radius:.375rem;
      font-size:.8125rem;
      line-height:1.65;
      color:var(--color-ink-primary);
    }
    .comm-ai-loading { color:var(--color-ink-muted); margin:0; font-style:italic; }
    .comm-ai-error   { color:var(--color-accent-burgundy); margin:0; }
    .comm-ai-result  { margin:0; }
    .comm-ai-disclaimer { display:block; font-size:.75rem; color:var(--color-ink-muted); margin-top:.5rem; font-style:italic; }

    /* ── Cross-reference panel ── */
    .xr-loading { padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.875rem; }
    .xr-skeleton { display:flex; flex-direction:column; gap:.5rem; }
    .xr-sk-line { height:.7rem; background:var(--color-surface-raised); border-radius:3px; animation:ws-pulse 1.4s ease-in-out infinite; }
    .xr-sk-line.wide  { width:90%; }
    .xr-sk-line.narrow{ width:60%; }
    .xr-empty { padding:2rem 1.5rem; }
    .xr-empty__msg { font-size:.875rem; color:var(--color-ink-muted); margin:0; }
    .xr-panel { display:flex; flex-direction:column; }
    .xr-header { padding:.75rem 1.25rem; border-bottom:1px solid var(--color-border-subtle); }
    .xr-header__ref { font-family:var(--font-scripture); font-size:.9375rem; font-weight:600; color:var(--color-ink-primary); }
    .xr-section { border-bottom:1px solid var(--color-border-subtle); }
    .xr-section__title {
      display:flex; align-items:center; gap:.5rem; padding:.5rem 1.25rem; cursor:pointer; list-style:none;
      font-size:.75rem; font-weight:600; color:var(--color-ink-muted); text-transform:uppercase; letter-spacing:.06em;
      user-select:none;
    }
    .xr-section__title::-webkit-details-marker { display:none; }
    .xr-section__count { font-family:var(--font-mono); font-size:.6875rem; color:var(--color-accent-gold); font-weight:400; text-transform:none; letter-spacing:0; }
    .xr-section__body  { padding:.25rem 0 .75rem; }
    .xr-item {
      display:flex; flex-wrap:wrap; align-items:baseline; gap:.375rem;
      width:100%; padding:.4rem 1.25rem; background:none; border:none; cursor:pointer; text-align:left;
      transition:background 80ms;
    }
    .xr-item:hover { background:var(--color-surface-raised); }
    .xr-item__ref { font-family:var(--font-scripture); font-size:.875rem; font-weight:600; color:var(--color-accent-gold); flex-shrink:0; }
    .xr-item__tag { font-size:.6875rem; color:var(--color-ink-muted); background:var(--color-surface-raised); padding:.1rem .35rem; border-radius:3px; font-family:var(--font-mono); }
    .xr-item--ot .xr-item__tag { background:color-mix(in srgb,var(--color-hebrew-tint) 25%,transparent); }
    .xr-item--nt .xr-item__tag { background:color-mix(in srgb,var(--color-greek-tint) 20%,transparent); }
    .xr-item__preview { flex:0 0 100%; font-size:.75rem; color:var(--color-ink-muted); margin-top:.125rem; font-style:italic; }
    .xr-verse-text {
      margin: 0; padding: .625rem 1.25rem .75rem;
      font-family: var(--font-scripture); font-size: var(--font-scripture-size, 1.125rem);
      color: var(--color-ink-scripture); line-height: var(--font-scripture-lh, 1.625);
      border-bottom: 1px solid var(--color-border-subtle);
    }

    /* ── Topical panel ── */
    .tp-panel { display:flex; flex-direction:column; height:100%; }
    .tp-search-bar { display:flex; align-items:center; gap:.375rem; padding:.625rem 1rem; border-bottom:1px solid var(--color-border-subtle); flex-shrink:0; }
    .tp-search-input {
      flex:1; background:var(--color-surface-raised); border:1px solid var(--color-border-subtle);
      border-radius:var(--radius-ui); padding:.375rem .625rem; font-family:var(--font-ui); font-size:.8125rem;
      color:var(--color-ink-primary); outline:none;
    }
    .tp-search-input:focus { border-color:var(--color-accent-gold); }
    .tp-search-btn { background:none; border:none; cursor:pointer; color:var(--color-ink-muted); padding:.25rem; display:flex; }
    .tp-search-btn:hover { color:var(--color-ink-primary); }
    .tp-content { flex:1; overflow-y:auto; padding:.5rem 0; }
    .tp-hint { padding:.75rem 1.25rem; font-size:.875rem; color:var(--color-ink-muted); margin:0; }
    .tp-loading { padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.5rem; }
    .tp-sk-line { height:.7rem; background:var(--color-surface-raised); border-radius:3px; animation:ws-pulse 1.4s ease-in-out infinite; }
    .tp-sk-line.wide  { width:90%; }
    .tp-sk-line.narrow{ width:60%; }
    .tp-empty { padding:1rem 1.25rem; }
    .tp-empty__msg { font-size:.875rem; color:var(--color-ink-muted); margin:0 0 .375rem; }
    .tp-empty__hint { font-size:.8125rem; color:var(--color-ink-muted); margin:0; }
    .tp-section-title { margin:.25rem 0 .375rem; padding:.25rem 1.25rem 0; font-size:.6875rem; font-weight:600; color:var(--color-ink-muted); text-transform:uppercase; letter-spacing:.06em; }
    .tp-count { font-family:var(--font-mono); font-size:.6875rem; color:var(--color-accent-gold); font-weight:400; text-transform:none; letter-spacing:0; margin-left:.375rem; }
    .tp-topic-btn {
      display:flex; align-items:center; justify-content:space-between; gap:.5rem;
      width:100%; padding:.4rem 1.25rem; background:none; border:none; cursor:pointer; text-align:left;
      transition:background 80ms;
    }
    .tp-topic-btn:hover { background:var(--color-surface-raised); }
    .tp-topic-btn__name { font-size:.875rem; color:var(--color-ink-primary); }
    .tp-topic-btn__arrow { color:var(--color-ink-muted); flex-shrink:0; }
    .tp-back-btn { display:flex; align-items:center; gap:.375rem; padding:.5rem 1.25rem; background:none; border:none; cursor:pointer; font-size:.8125rem; color:var(--color-ink-muted); font-family:var(--font-ui); }
    .tp-back-btn:hover { color:var(--color-ink-primary); }
    .tp-topic-detail { padding:0 0 1rem; }
    .tp-verse-list { display:flex; flex-wrap:wrap; gap:.375rem; padding:.375rem 1.25rem; }
    .tp-verse-link { padding:.25rem .5rem; background:var(--color-surface-raised); border:1px solid var(--color-border-subtle); border-radius:3px; font-size:.75rem; color:var(--color-accent-gold); cursor:pointer; font-family:var(--font-mono); }
    .tp-verse-link:hover { border-color:var(--color-accent-gold); }
    .tp-search-section { margin-bottom:.75rem; }
    .tp-dict-entry { border-bottom:1px solid var(--color-border-subtle); }
    .tp-dict-entry__term { padding:.4rem 1.25rem; cursor:pointer; list-style:none; font-size:.875rem; color:var(--color-ink-primary); font-weight:600; display:flex; align-items:center; justify-content:space-between; }
    .tp-dict-entry__term::-webkit-details-marker { display:none; }
    .tp-dict-source { font-size:.6875rem; color:var(--color-ink-muted); font-weight:400; font-style:italic; }
    .tp-dict-entry__def { padding:.5rem 1.25rem .75rem; font-size:.8125rem; color:var(--color-ink-secondary); line-height:1.6; }
    .tp-dict-entry__def p { margin:.5rem 0 0; }
    .tp-dict-entry__def p:first-child { margin:0; }
  `;
  document.head.appendChild(stage3);

  // ── Stage 3b CSS — NT-OT, Typology, Chain refs ──────────────
  const stage3b = document.createElement('style');
  stage3b.id = 'stage3b-css';
  stage3b.textContent = `
    /* ── NT-OT quote indicator on verse number ── */
    .verse-container--has-ntot .verse-number {
      position: relative;
    }
    .verse-container--has-ntot .verse-number::after {
      content: '';
      position: absolute;
      bottom: .55rem;
      right: .1rem;
      width: .3rem;
      height: .3rem;
      border-radius: 50%;
      background: var(--color-accent-burgundy, #8C1127);
    }

    /* OT source menu items */
    .verse-menu__item--ntot { color: var(--color-accent-burgundy, #8C1127); }
    .verse-menu__item--ntot:hover { background: color-mix(in srgb, var(--color-accent-burgundy, #8C1127) 12%, transparent); }
    .verse-menu__sep { height: 1px; background: var(--color-border-subtle); margin: .25rem 0; }

    /* ── Cross-reference chain navigation ── */
    .xr-item-wrap { display: flex; align-items: center; gap: 0; }
    .xr-item-wrap .xr-item { flex: 1; min-width: 0; }
    .xr-chain-btn {
      flex-shrink: 0; width: 2rem; height: 100%; min-height: 2.25rem;
      background: none; border: none; cursor: pointer;
      color: var(--color-ink-muted); font-size: .875rem;
      border-radius: var(--radius-ui); transition: background 80ms, color 80ms;
      display: flex; align-items: center; justify-content: center;
    }
    .xr-chain-btn:hover { background: var(--color-surface-raised); color: var(--color-accent-gold); }

    /* Chain breadcrumb bar */
    .xr-chain-bar {
      display: flex; align-items: center; flex-wrap: wrap; gap: .25rem;
      padding: .5rem 1.25rem; background: color-mix(in srgb, var(--color-accent-gold) 6%, transparent);
      border-bottom: 1px solid var(--color-border-subtle); font-size: .75rem;
    }
    .xr-crumb {
      background: none; border: none; cursor: pointer; font-size: .75rem;
      color: var(--color-accent-gold); font-family: var(--font-ui); padding: .1rem .2rem;
      border-radius: 3px; transition: background 80ms;
    }
    .xr-crumb:hover { background: var(--color-surface-raised); }
    .xr-crumb--current { color: var(--color-ink-primary); cursor: default; font-weight: 600; }
    .xr-crumb--current:hover { background: none; }
    .xr-crumb-sep { color: var(--color-ink-muted); font-size: .75rem; }
    .xr-chain-exit {
      margin-left: auto; background: none; border: none; cursor: pointer;
      color: var(--color-ink-muted); font-size: .75rem; padding: .15rem .4rem;
      border-radius: 3px; transition: background 80ms, color 80ms;
    }
    .xr-chain-exit:hover { background: var(--color-surface-raised); color: var(--color-ink-primary); }
    .xr-header__hint { font-size: .6875rem; color: var(--color-ink-muted); font-style: italic; }

    /* ── Typology panel ── */
    .typ-panel { display: flex; flex-direction: column; padding: .5rem 0 2rem; }
    .typ-loading { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: .625rem; }
    .typ-sk-line { height: .7rem; background: var(--color-surface-raised); border-radius: 3px; animation: ws-pulse 1.4s ease-in-out infinite; }
    .typ-sk-line.wide  { width: 90%; }
    .typ-sk-line.narrow{ width: 60%; }
    .typ-intro { padding: .625rem 1.25rem .25rem; }
    .typ-intro__text { margin: 0; font-size: .8125rem; color: var(--color-ink-muted); line-height: 1.5; }

    .typ-back-btn {
      display: flex; align-items: center; gap: .375rem;
      padding: .5rem 1.25rem; background: none; border: none; cursor: pointer;
      font-size: .8125rem; color: var(--color-ink-muted); font-family: var(--font-ui);
    }
    .typ-back-btn:hover { color: var(--color-ink-primary); }

    .typ-section-label {
      padding: .25rem 1.25rem; margin: 0 0 .25rem;
      font-size: .6875rem; font-weight: 600; color: var(--color-ink-muted);
      text-transform: uppercase; letter-spacing: .06em;
    }
    .typ-count {
      font-family: var(--font-mono); font-size: .6875rem;
      color: var(--color-accent-burgundy, #8C1127);
      font-weight: 400; text-transform: none; letter-spacing: 0; margin-left: .375rem;
    }

    .typ-empty { padding: 1rem 1.25rem; }
    .typ-empty__msg { font-size: .875rem; color: var(--color-ink-secondary); margin: 0 0 .375rem; }
    .typ-empty__hint { font-size: .8125rem; color: var(--color-ink-muted); margin: 0; }

    .typ-list { display: flex; flex-direction: column; gap: .5rem; padding: .5rem 1rem; }

    /* ── Typology card ── */
    .typ-card {
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-panel, .5rem);
      background: var(--color-surface-elevated);
      overflow: hidden;
    }
    .typ-card__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: .375rem .75rem;
      background: color-mix(in srgb, var(--color-accent-burgundy, #8C1127) 10%, transparent);
      border-bottom: 1px solid color-mix(in srgb, var(--color-accent-burgundy, #8C1127) 25%, transparent);
    }
    .typ-card__category {
      font-size: .6875rem; font-weight: 600; color: var(--color-accent-burgundy, #8C1127);
      text-transform: uppercase; letter-spacing: .06em; font-family: var(--font-ui);
    }

    .typ-card__body {
      display: grid; grid-template-columns: 1fr auto 1fr;
      align-items: start; gap: .25rem; padding: .625rem .75rem;
    }
    .typ-card__side { display: flex; flex-direction: column; gap: .25rem; }
    .typ-card__side--active { }

    .typ-card__side-tag {
      margin: 0; font-size: .625rem; font-weight: 600;
      text-transform: uppercase; letter-spacing: .08em;
      color: var(--color-ink-muted);
    }
    .typ-card__side--ot .typ-card__side-tag  { color: color-mix(in srgb, var(--color-hebrew-tint, #F3EBE1) 60%, var(--color-ink-muted)); }
    .typ-card__side--nt .typ-card__side-tag  { color: color-mix(in srgb, var(--color-greek-tint,  #E2EBFA) 60%, var(--color-ink-muted)); }

    .typ-card__side-label {
      margin: 0; font-size: .8125rem; font-weight: 600; color: var(--color-ink-primary);
      line-height: 1.3;
    }
    .typ-card__side-desc {
      margin: 0; font-size: .75rem; color: var(--color-ink-secondary); line-height: 1.5;
    }
    .typ-card__refs { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .25rem; }
    .typ-ref-btn {
      padding: .15rem .4rem;
      background: color-mix(in srgb, var(--color-accent-burgundy, #8C1127) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-accent-burgundy, #8C1127) 30%, transparent);
      border-radius: 3px; font-size: .6875rem;
      color: var(--color-accent-burgundy, #8C1127);
      cursor: pointer; font-family: var(--font-mono);
      transition: background 80ms;
    }
    .typ-ref-btn:hover {
      background: color-mix(in srgb, var(--color-accent-burgundy, #8C1127) 22%, transparent);
    }
    .typ-card__arrow {
      font-size: 1rem; color: var(--color-accent-burgundy, #8C1127);
      padding: 1.25rem .25rem 0; align-self: start; opacity: .7;
    }

    /* Browse all types disclosure */
    .typ-browse-more { border-top: 1px solid var(--color-border-subtle); margin-top: .5rem; }
    .typ-browse-more__summary {
      padding: .5rem 1.25rem; cursor: pointer; list-style: none; user-select: none;
      font-size: .75rem; font-weight: 600; color: var(--color-ink-muted);
      text-transform: uppercase; letter-spacing: .06em;
    }
    .typ-browse-more__summary::-webkit-details-marker { display: none; }
    .typ-browse-more__summary:hover { color: var(--color-ink-secondary); }

    /* Theological note */
    .typ-card__note-details { border-top: 1px solid var(--color-border-subtle); }
    .typ-card__note-summary {
      padding: .375rem .75rem; cursor: pointer; list-style: none;
      font-size: .6875rem; color: var(--color-ink-muted); user-select: none;
      font-style: italic;
    }
    .typ-card__note-summary::-webkit-details-marker { display: none; }
    .typ-card__note-summary:hover { color: var(--color-ink-secondary); }
    .typ-card__note-text {
      margin: 0; padding: .25rem .75rem .625rem;
      font-size: .75rem; color: var(--color-ink-secondary); line-height: 1.6;
    }
  `;
  document.head.appendChild(stage3b);

  // ── Stage 4 CSS — Parallel Bible columns ─────────────────────
  const stage4 = document.createElement('style');
  stage4.id = 'stage4-css';
  stage4.textContent = `
    /* ── Parallel toggle button active state ── */
    .reading-pane__action-btn--active {
      color: var(--color-accent-gold);
      background: color-mix(in srgb, var(--color-accent-gold) 12%, transparent);
      border-radius: var(--radius-ui, .375rem);
    }

    /* ── Parallel toolbar ── */
    .parallel-toolbar {
      display: flex;
      align-items: center;
      gap: .375rem;
      padding: .5rem var(--space-panel);
      background: var(--color-surface-elevated);
      border-bottom: 1px solid var(--color-border-subtle);
      flex-wrap: wrap;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .parallel-chip {
      display: inline-flex;
      align-items: center;
      gap: .25rem;
      padding: .2rem .5rem .2rem .625rem;
      background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle);
      border-radius: 999px;
      font-size: .8125rem;
      color: var(--color-ink-secondary);
    }
    .parallel-chip__remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1rem;
      height: 1rem;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-ink-muted);
      font-size: .875rem;
      line-height: 1;
      border-radius: 50%;
      padding: 0;
      transition: color 100ms, background-color 100ms;
    }
    .parallel-chip__remove:hover {
      color: var(--color-accent-gold);
      background: color-mix(in srgb, var(--color-accent-gold) 12%, transparent);
    }
    .parallel-add-btn {
      padding: .2rem .625rem;
      background: none;
      border: 1px dashed var(--color-border-subtle);
      border-radius: 999px;
      font-size: .8125rem;
      color: var(--color-ink-muted);
      cursor: pointer;
      transition: border-color 150ms, color 150ms;
    }
    .parallel-add-btn:hover { border-color: var(--color-accent-gold); color: var(--color-accent-gold); }

    /* ── Parallel grid ── */
    .parallel-grid {
      display: grid;
      grid-template-columns: repeat(var(--parallel-cols, 2), 1fr);
      column-gap: 1px;
      background: var(--color-border-subtle);
    }
    .parallel-col-head {
      display: flex;
      align-items: center;
      gap: .375rem;
      padding: .5rem var(--space-panel);
      background: var(--color-surface-elevated);
      font-size: .75rem;
      font-family: 'Fira Code', monospace;
      font-weight: 600;
      color: var(--color-ink-secondary);
      letter-spacing: .08em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--color-border-subtle);
      position: sticky;
      top: 3.25rem;   /* below parallel-toolbar */
      z-index: 10;
    }
    .parallel-col-head__label { flex: 1; }
    .parallel-col-head__badge {
      font-size: .625rem;
      padding: .125rem .35rem;
      border-radius: .25rem;
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      letter-spacing: 0;
    }
    .parallel-col-head__badge--warn { background: color-mix(in srgb,var(--color-accent-gold) 20%,transparent); color: var(--color-accent-gold); }
    .parallel-col-head__badge--err  { background: color-mix(in srgb,var(--color-accent-burgundy) 20%,transparent); color: var(--color-accent-burgundy); }

    /* ── Parallel verse cells ── */
    .parallel-verse {
      padding: var(--space-verse-gap) var(--space-panel);
      background: var(--color-surface-base);
      vertical-align: top;
    }
    .parallel-verse--empty {
      background: color-mix(in srgb, var(--color-surface-raised) 40%, transparent);
    }
    .parallel-verse__num {
      font-family: 'Fira Code', monospace;
      font-size: .6875rem;
      color: var(--color-accent-gold);
      margin-right: .25rem;
      vertical-align: super;
      line-height: 1;
      user-select: none;
    }
    .parallel-verse__text {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: var(--font-scripture-size);
      line-height: var(--font-scripture-lh);
      color: var(--color-ink-scripture);
    }

    /* ── Translation picker dropdown ── */
    .parallel-picker {
      background: var(--color-surface-modal);
      border: 1px solid var(--color-border-subtle);
      border-radius: .5rem;
      box-shadow: 0 8px 24px rgba(0,0,0,.45);
      padding: .375rem;
      min-width: 220px;
      z-index: 300;
    }
    .parallel-picker__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      width: 100%;
      padding: .5rem .75rem;
      background: none;
      border: none;
      border-radius: .375rem;
      cursor: pointer;
      font-size: var(--font-ui-label);
      color: var(--color-ink-primary);
      text-align: left;
      transition: background-color 100ms;
    }
    .parallel-picker__item:hover:not([disabled]) { background: var(--color-surface-raised); }
    .parallel-picker__item--active { color: var(--color-accent-gold); font-weight: 600; }
    .parallel-picker__item--disabled,
    .parallel-picker__item[disabled] { color: var(--color-ink-muted); cursor: not-allowed; }
    .parallel-picker__name { flex: 1; }
    .parallel-picker__badge {
      font-size: .6875rem;
      padding: .125rem .375rem;
      border-radius: .25rem;
      background: var(--color-surface-raised);
      color: var(--color-ink-muted);
      white-space: nowrap;
    }
    .parallel-picker__badge--online { color: var(--color-accent-sage); background: color-mix(in srgb,var(--color-accent-sage) 15%,transparent); }
    .parallel-picker__empty {
      padding: .5rem .75rem;
      font-size: var(--font-ui-label);
      color: var(--color-ink-muted);
    }

    @media (prefers-reduced-motion: reduce) {
      .parallel-add-btn, .parallel-chip__remove { transition-duration: 0ms !important; }
    }
  `;
  document.head.appendChild(stage4);

  // ── Stage 4b CSS — Search panel ──────────────────────────────
  const stage4b = document.createElement('style');
  stage4b.id = 'stage4b-css';
  stage4b.textContent = `
    .search-panel-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--color-surface-base);
    }
    .search-panel-container[hidden] { display: none; }
    .reading-pane-container[hidden] { display: none; }

    /* Header */
    .sp-header {
      background: var(--color-surface-elevated);
      border-bottom: 1px solid var(--color-border-subtle);
      padding: .75rem var(--space-panel);
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .sp-search-row {
      display: flex;
      align-items: center;
      gap: .5rem;
      background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle);
      border-radius: .375rem;
      padding: .4rem .75rem;
    }
    .sp-search-row:focus-within {
      border-color: var(--color-accent-gold);
    }
    .sp-icon { color: var(--color-ink-muted); flex-shrink: 0; }
    .sp-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: var(--color-ink-primary);
      font-size: var(--font-ui-label);
      font-family: inherit;
    }
    .sp-input::placeholder { color: var(--color-ink-muted); }
    .sp-clear {
      background: none;
      border: none;
      color: var(--color-ink-muted);
      cursor: pointer;
      font-size: 1.125rem;
      line-height: 1;
      padding: 0 .125rem;
    }
    .sp-clear:hover { color: var(--color-ink-primary); }

    /* Filters row */
    .sp-filters {
      display: flex;
      align-items: center;
      gap: .75rem;
      flex-wrap: wrap;
    }
    .sp-book-filter {
      background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle);
      border-radius: .375rem;
      color: var(--color-ink-secondary);
      font-size: .8125rem;
      padding: .25rem .5rem;
      cursor: pointer;
    }
    .sp-result-count {
      font-size: .8125rem;
      color: var(--color-ink-muted);
    }
    .sp-hint {
      font-size: .75rem;
      color: var(--color-ink-muted);
      opacity: .7;
      margin-left: auto;
    }

    /* Results list */
    .sp-results {
      flex: 1;
      overflow-y: auto;
      padding: .5rem 0;
    }
    .sp-result {
      display: flex;
      flex-direction: column;
      gap: .25rem;
      padding: .625rem var(--space-panel);
      cursor: pointer;
      border-bottom: 1px solid var(--color-border-subtle);
      transition: background-color 100ms;
    }
    .sp-result:hover, .sp-result:focus {
      background: var(--color-surface-elevated);
      outline: none;
    }
    .sp-result__ref {
      font-family: 'Fira Code', monospace;
      font-size: .8125rem;
      color: var(--color-accent-gold);
      font-weight: 600;
    }
    .sp-result__snippet {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: var(--font-scripture-size);
      line-height: 1.5;
      color: var(--color-ink-scripture);
    }
    .sp-result__snippet mark {
      background: color-mix(in srgb, var(--color-accent-gold) 25%, transparent);
      color: var(--color-ink-primary);
      border-radius: .125rem;
      padding: 0 .125rem;
    }

    /* Empty / loading states */
    .sp-empty, .sp-loading {
      padding: 2rem var(--space-panel);
      text-align: center;
      color: var(--color-ink-muted);
    }
    .sp-empty__title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-ink-secondary);
      margin: 0 0 .375rem;
    }
    .sp-empty__body {
      font-size: .875rem;
      margin: 0;
    }
    .sp-loading {
      font-size: .875rem;
      font-style: italic;
    }

    @media (prefers-reduced-motion: reduce) {
      .sp-result { transition-duration: 0ms !important; }
    }
  `;
  document.head.appendChild(stage4b);

  // ── Stage 4c CSS — AI panel ───────────────────────────────────
  const stage4c = document.createElement('style');
  stage4c.id = 'stage4c-css';
  stage4c.textContent = `
    /* "AI ✦" tab — subtle gold tint */
    #tab-ai { color: var(--color-accent-gold); }
    #tab-ai.rp-tab--active { color: var(--color-accent-gold); }

    .ai-panel { display: flex; flex-direction: column; height: 100%; }

    /* Mode selector */
    .ai-modes {
      display: flex;
      gap: .25rem;
      padding: .5rem var(--space-panel);
      border-bottom: 1px solid var(--color-border-subtle);
      flex-wrap: wrap;
      background: var(--color-surface-elevated);
    }
    .ai-mode-btn {
      display: flex; align-items: center; gap: .3rem;
      padding: .25rem .625rem;
      background: none;
      border: 1px solid var(--color-border-subtle);
      border-radius: 999px;
      font-size: .75rem;
      color: var(--color-ink-muted);
      cursor: pointer;
      transition: border-color 120ms, color 120ms, background-color 120ms;
    }
    .ai-mode-btn:hover { border-color: var(--color-accent-gold); color: var(--color-ink-primary); }
    .ai-mode-btn--active {
      border-color: var(--color-accent-gold);
      color: var(--color-accent-gold);
      background: color-mix(in srgb, var(--color-accent-gold) 10%, transparent);
    }
    .ai-mode-btn__icon { font-size: .875rem; line-height: 1; }
    .ai-mode-btn__label { font-family: inherit; }

    /* Placeholder */
    .ai-placeholder {
      padding: 1.5rem var(--space-panel);
      display: flex; flex-direction: column; gap: .75rem; align-items: flex-start;
    }
    .ai-placeholder__ref {
      font-family: 'Fira Code', monospace;
      font-size: .875rem;
      color: var(--color-accent-gold);
      margin: 0;
    }
    .ai-placeholder__hint {
      font-size: .875rem;
      color: var(--color-ink-muted);
      margin: 0;
      line-height: 1.5;
    }
    .ai-run-btn, .ai-rerun-btn, .ai-back-btn {
      display: inline-flex; align-items: center; gap: .375rem;
      padding: .4rem .875rem;
      background: var(--color-accent-gold);
      color: #000;
      border: none;
      border-radius: .375rem;
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 120ms;
    }
    .ai-run-btn:hover { opacity: .85; }
    .ai-rerun-btn {
      background: var(--color-surface-raised);
      color: var(--color-ink-secondary);
      border: 1px solid var(--color-border-subtle);
      margin-left: auto;
    }
    .ai-back-btn {
      background: none;
      color: var(--color-ink-muted);
      border: 1px solid var(--color-border-subtle);
    }
    .ai-export-btn {
      background: none; border: 1px solid var(--color-border-subtle);
      color: var(--color-ink-secondary); font-size: .75rem; cursor: pointer;
      border-radius: 4px; padding: .25rem .6rem;
      transition: border-color 150ms, color 150ms;
    }
    .ai-export-btn:hover { border-color: var(--color-accent-sage); color: var(--color-accent-sage); }
    .ai-saved-badge { font-size: .7rem; color: var(--color-ink-muted); font-style: italic; }
    /* Saved notes list on placeholder */
    .ai-saved-notes { margin-top: 1rem; border-top: 1px solid var(--color-border-subtle); padding-top: .75rem; }
    .ai-saved-notes__label { font-size: .72rem; color: var(--color-ink-muted); margin: 0 0 .4rem; font-style: italic; }
    .ai-saved-note { display: flex; align-items: center; gap: .4rem; padding: .3rem 0; border-bottom: 1px solid var(--color-border-subtle); }
    .ai-saved-note:last-child { border-bottom: none; }
    .ai-saved-note__mode { font-size: .75rem; font-weight: 600; color: var(--color-ink-primary); flex: 1; }
    .ai-saved-note__date { font-size: .7rem; color: var(--color-ink-muted); white-space: nowrap; }
    .ai-saved-note__view { font-size: .72rem; padding: .15rem .45rem; background: none; border: 1px solid var(--color-border-subtle); border-radius: 3px; color: var(--color-accent-gold); cursor: pointer; white-space: nowrap; }
    .ai-saved-note__view:hover { background: color-mix(in srgb, var(--color-accent-gold) 10%, transparent); }
    .ai-saved-note__export { font-size: .72rem; padding: .15rem .35rem; background: none; border: 1px solid var(--color-border-subtle); border-radius: 3px; color: var(--color-ink-muted); cursor: pointer; }
    .ai-saved-note__export:hover { color: var(--color-accent-sage); border-color: var(--color-accent-sage); }
    .ai-byok-note {
      font-size: .75rem;
      color: var(--color-ink-muted);
      margin: 0;
    }
    .ai-byok-link { color: var(--color-accent-sage); text-underline-offset: 2px; }
    .ai-byok-link:hover { color: var(--color-accent-gold); }

    /* Streaming */
    .ai-stream-header {
      display: flex; align-items: center; gap: .5rem;
      padding: .5rem var(--space-panel);
      background: var(--color-surface-elevated);
      border-bottom: 1px solid var(--color-border-subtle);
      flex-wrap: wrap;
    }
    .ai-stream-label {
      font-size: .8125rem;
      color: var(--color-accent-gold);
      font-family: 'Fira Code', monospace;
    }
    .ai-stop-btn {
      margin-left: auto;
      padding: .25rem .625rem;
      background: none;
      border: 1px solid var(--color-accent-burgundy);
      border-radius: .375rem;
      color: var(--color-accent-burgundy);
      font-size: .75rem;
      cursor: pointer;
    }
    .ai-output {
      flex: 1; overflow-y: auto;
      padding: var(--space-panel);
    }
    .ai-cursor {
      display: inline-block;
      animation: ai-blink 0.7s step-start infinite;
      color: var(--color-accent-gold);
    }
    @keyframes ai-blink { 50% { opacity: 0; } }

    /* AI output typography */
    .ai-p { margin: 0 0 .75rem; font-size: .9375rem; line-height: 1.65; color: var(--color-ink-primary); }
    .ai-h3 { font-size: 1rem; font-weight: 700; margin: 1rem 0 .375rem; color: var(--color-ink-primary); }
    .ai-h4 { font-size: .9375rem; font-weight: 600; margin: .75rem 0 .25rem; color: var(--color-ink-secondary); }
    .ai-li { margin: .25rem 0 .25rem 1.25rem; list-style: decimal; font-size: .9375rem; line-height: 1.5; color: var(--color-ink-primary); }
    .ai-li--bullet { list-style: disc; }
    .ai-hr { border: none; border-top: 1px solid var(--color-border-subtle); margin: 1rem 0; }
    .ai-disclaimer {
      margin: 1rem 0 0;
      font-size: .8125rem;
      color: var(--color-ink-muted);
      font-style: italic;
      border-top: 1px solid var(--color-border-subtle);
      padding-top: .5rem;
    }

    /* Error */
    .ai-error {
      padding: 1.5rem var(--space-panel);
      display: flex; flex-direction: column; gap: .75rem;
    }
    .ai-error__title { font-weight: 600; color: var(--color-accent-burgundy); margin: 0; }
    .ai-error__body  { font-size: .875rem; color: var(--color-ink-muted); margin: 0; }
    .ai-error__hint  { font-size: .8125rem; color: var(--color-ink-muted); margin: 0; }

    @media (prefers-reduced-motion: reduce) {
      .ai-mode-btn, .ai-run-btn { transition-duration: 0ms !important; }
      .ai-cursor { animation: none; }
    }
  `;
  document.head.appendChild(stage4c);

  // ── Stage 5 completion CSS ──────────────────────────────
  const stage5c = document.createElement('style');
  stage5c.id = 'stage5c-css';
  stage5c.textContent = `

    /* ── Text Highlights ── */
    .hl-toolbar {
      position: fixed; z-index: 8000;
      display: flex; align-items: center; gap: .375rem;
      background: var(--color-surface-modal);
      border: 1px solid var(--color-border-subtle);
      border-radius: .5rem;
      padding: .375rem .625rem;
      box-shadow: 0 8px 24px rgba(0,0,0,.5);
    }
    .hl-label {
      font-size: .6875rem; color: var(--color-ink-muted);
      font-family: var(--font-ui); margin-right: .125rem;
    }
    .hl-swatch {
      width: 1.375rem; height: 1.375rem; border-radius: 50%;
      border: 2px solid transparent; cursor: pointer;
      transition: transform 100ms, border-color 100ms;
    }
    .hl-swatch:hover { transform: scale(1.2); border-color: var(--color-ink-primary); }
    .hl-swatch--clear {
      background: none !important; border: 1px solid var(--color-border-subtle);
      color: var(--color-ink-muted); font-size: .7rem;
      display: flex; align-items: center; justify-content: center;
    }
    /* CSS Custom Highlight API styles */
    ::highlight(berean-hl-yellow) { background-color: rgba(253,224, 71,.4); }
    ::highlight(berean-hl-green)  { background-color: rgba( 74,222,128,.4); }
    ::highlight(berean-hl-blue)   { background-color: rgba( 96,165,250,.4); }
    ::highlight(berean-hl-pink)   { background-color: rgba(251,113,133,.4); }
    /* Fallback for browsers without CSS Highlight API */
    .verse-container[data-hl-color="yellow"] .verse-text { background: rgba(253,224, 71,.3); border-radius: 3px; }
    .verse-container[data-hl-color="green"]  .verse-text { background: rgba( 74,222,128,.3); border-radius: 3px; }
    .verse-container[data-hl-color="blue"]   .verse-text { background: rgba( 96,165,250,.3); border-radius: 3px; }
    .verse-container[data-hl-color="pink"]   .verse-text { background: rgba(251,113,133,.3); border-radius: 3px; }

    /* ── Sermon editor: side panels (citations + illustrations) ── */
    .se-editor-view { position: relative; }
    .se-side-panel {
      position: absolute; top: 0; right: 0; bottom: 0;
      width: min(340px, 90vw);
      background: var(--color-surface-elevated);
      border-left: 1px solid var(--color-border-subtle);
      display: flex; flex-direction: column;
      z-index: 100; overflow: hidden;
      box-shadow: -8px 0 24px rgba(0,0,0,.3);
    }
    .se-side-panel__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: .875rem 1rem; border-bottom: 1px solid var(--color-border-subtle);
      flex-shrink: 0;
    }
    .se-side-panel__title {
      margin: 0; font-size: .9375rem; font-weight: 600;
      color: var(--color-ink-primary); font-family: var(--font-ui);
    }
    .se-side-panel__close {
      background: none; border: none; cursor: pointer;
      color: var(--color-ink-muted); font-size: .875rem;
      padding: .25rem .375rem; border-radius: .25rem;
      transition: background 100ms, color 100ms;
    }
    .se-side-panel__close:hover { background: var(--color-surface-raised); color: var(--color-ink-primary); }
    .se-side-panel__search { padding: .625rem 1rem; border-bottom: 1px solid var(--color-border-subtle); flex-shrink: 0; }
    .se-side-panel__search input {
      width: 100%; background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      padding: .375rem .625rem; font-size: .875rem; color: var(--color-ink-primary);
      font-family: var(--font-ui);
    }
    .se-side-panel__body { flex: 1; overflow-y: auto; padding: .625rem; }
    .se-side-panel__footer {
      padding: .75rem 1rem; border-top: 1px solid var(--color-border-subtle); flex-shrink: 0;
    }

    /* Clippings tray */
    .se-side-panel__hint {
      padding: .625rem 1rem; margin: 0;
      font-size: .8125rem; color: var(--color-ink-muted); line-height: 1.5;
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .se-side-panel__list { flex: 1; overflow-y: auto; padding: .5rem; display: flex; flex-direction: column; gap: .375rem; }
    .se-side-panel__empty {
      padding: 1.5rem 1rem; text-align: center;
      font-size: .875rem; color: var(--color-ink-muted); line-height: 1.5;
    }
    .se-clipping-card {
      background: var(--color-surface-raised); border-radius: .375rem;
      padding: .625rem .75rem; display: flex; flex-direction: column; gap: .375rem;
    }
    .se-clipping-card__ref {
      font-size: .8125rem; font-weight: 600; color: var(--color-accent-gold);
    }
    .se-clipping-card__text {
      font-size: .8125rem; color: var(--color-ink-secondary); line-height: 1.5;
    }
    .se-clipping-card__actions { display: flex; gap: .375rem; }
    .se-clipping-card__btn {
      padding: .25rem .625rem; border-radius: .375rem; font-size: .75rem;
      cursor: pointer; border: 1px solid var(--color-border-subtle);
      background: var(--color-surface-elevated); color: var(--color-ink-secondary);
      transition: background 120ms, color 120ms;
    }
    .se-clipping-card__btn:hover { background: var(--color-surface-modal); color: var(--color-ink-primary); }
    .se-clipping-card__btn--insert {
      background: var(--color-accent-gold); color: #000; border-color: transparent;
    }
    .se-clipping-card__btn--insert:hover { filter: brightness(1.1); }
    .se-clipping-card__btn--delete { margin-left: auto; color: var(--color-accent-burgundy); }
    /* Badge on Clippings toolbar button */
    .se-clippings-badge {
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--color-accent-gold); color: #000;
      font-size: .625rem; font-weight: 700; line-height: 1;
      min-width: 1rem; height: 1rem; border-radius: 9999px;
      padding: 0 .25rem; margin-left: .25rem; vertical-align: middle;
    }

    /* Citations */
    .se-cite-add-btn, .se-illus-add-btn {
      width: 100%; padding: .5rem; background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .375rem; font-size: .8125rem; font-weight: 600;
      cursor: pointer; font-family: var(--font-ui);
    }
    .se-cite-form, .se-illus-form {
      position: absolute; inset: 0; background: var(--color-surface-elevated);
      display: flex; flex-direction: column; z-index: 10;
    }
    .se-cite-form__body, .se-illus-form__body {
      flex: 1; overflow-y: auto; padding: .75rem 1rem; display: flex; flex-direction: column; gap: .625rem;
    }
    .se-cite-field { display: flex; flex-direction: column; gap: .25rem; }
    .se-cite-field span { font-size: .75rem; color: var(--color-ink-muted); font-family: var(--font-ui); font-weight: 500; }
    .se-cite-field input, .se-cite-field select, .se-cite-field textarea {
      background: var(--color-surface-raised); border: 1px solid var(--color-border-subtle);
      border-radius: .375rem; padding: .375rem .625rem;
      font-size: .875rem; color: var(--color-ink-primary); font-family: var(--font-ui);
    }
    .se-cite-field textarea { resize: vertical; min-height: 80px; }
    .se-cite-form__footer, .se-illus-form__footer {
      padding: .75rem 1rem; border-top: 1px solid var(--color-border-subtle);
    }
    .se-cite-save-btn, .se-illus-save-btn {
      width: 100%; padding: .5rem; background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .375rem; font-size: .8125rem; font-weight: 600;
      cursor: pointer; font-family: var(--font-ui);
    }
    .se-cite-item {
      display: flex; gap: .5rem; padding: .625rem; margin-bottom: .5rem;
      background: var(--color-surface-raised); border-radius: .375rem;
    }
    .se-cite-item__num {
      font-family: var(--font-mono); font-size: .75rem; color: var(--color-accent-gold);
      flex-shrink: 0; padding-top: .125rem;
    }
    .se-cite-item__body { flex: 1; min-width: 0; }
    .se-cite-item__formatted { margin: 0 0 .25rem; font-size: .8125rem; color: var(--color-ink-primary); line-height: 1.5; }
    .se-cite-item__notes { margin: 0; font-size: .75rem; color: var(--color-ink-muted); }
    .se-cite-item__actions { display: flex; flex-direction: column; gap: .25rem; flex-shrink: 0; }
    .se-cite-item__insert {
      padding: .25rem .5rem; background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .25rem; font-size: .75rem; font-weight: 600; cursor: pointer;
    }
    .se-cite-item__delete {
      padding: .25rem .375rem; background: none;
      border: 1px solid var(--color-border-subtle); border-radius: .25rem;
      color: var(--color-ink-muted); font-size: .75rem; cursor: pointer;
    }
    .se-cite-empty, .se-illus-empty, .se-cite-loading, .se-illus-loading {
      font-size: .875rem; color: var(--color-ink-muted); text-align: center; padding: 2rem 1rem;
    }

    /* Illustrations */
    .se-illus-item {
      padding: .75rem; margin-bottom: .5rem;
      background: var(--color-surface-raised); border-radius: .375rem;
    }
    .se-illus-item__hd { display: flex; align-items: center; gap: .5rem; margin-bottom: .375rem; flex-wrap: wrap; }
    .se-illus-item__type {
      font-size: .65rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
      background: color-mix(in srgb, var(--color-accent-sage) 15%, transparent);
      color: var(--color-accent-sage); border-radius: .25rem; padding: .1rem .35rem;
    }
    .se-illus-item__title { font-size: .875rem; font-weight: 600; color: var(--color-ink-primary); }
    .se-illus-item__topic {
      font-size: .7rem; color: var(--color-ink-muted);
      background: var(--color-surface-modal); border-radius: .25rem; padding: .1rem .35rem;
    }
    .se-illus-item__preview { margin: 0 0 .25rem; font-size: .8125rem; color: var(--color-ink-secondary); line-height: 1.5; }
    .se-illus-item__source { margin: 0 0 .5rem; font-size: .75rem; color: var(--color-ink-muted); font-style: italic; }
    .se-illus-item__actions { display: flex; gap: .5rem; }
    .se-illus-item__insert {
      flex: 1; padding: .3rem .5rem; background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .25rem; font-size: .75rem; font-weight: 600; cursor: pointer;
    }
    .se-illus-item__delete {
      padding: .3rem .5rem; background: none;
      border: 1px solid var(--color-border-subtle); border-radius: .25rem;
      color: var(--color-ink-muted); font-size: .75rem; cursor: pointer;
    }

    /* ── Sermon list tabs ── */
    .se-list-header { display: flex; align-items: center; gap: .5rem; padding: 1rem 1.25rem .75rem; flex-wrap: wrap; }
    .se-list-header__tabs { display: flex; gap: .25rem; }
    .se-list-tab {
      padding: .3rem .75rem; background: none;
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      font-size: .8125rem; color: var(--color-ink-muted); cursor: pointer;
      font-family: var(--font-ui); transition: background 100ms, color 100ms;
    }
    .se-list-tab--active {
      background: color-mix(in srgb, var(--color-accent-gold) 12%, transparent);
      color: var(--color-accent-gold); border-color: var(--color-accent-gold);
    }

    /* ── Preaching Calendar ── */
    .pc-wrap { padding: 1rem; max-width: 680px; margin: 0 auto; }
    .pc-header {
      display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; flex-wrap: wrap;
    }
    .pc-month { margin: 0; flex: 1; font-family: 'EB Garamond', serif; font-size: 1.125rem; color: var(--color-ink-primary); }
    .pc-nav-btn {
      background: none; border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      color: var(--color-ink-secondary); padding: .3rem .625rem; cursor: pointer;
      font-size: .875rem; transition: background 100ms, color 100ms;
    }
    .pc-nav-btn:hover { background: var(--color-surface-raised); color: var(--color-ink-primary); }
    .pc-export-btn {
      margin-left: auto; padding: .3rem .75rem;
      background: none; border: 1px solid var(--color-accent-sage);
      border-radius: .375rem; color: var(--color-accent-sage);
      font-size: .8125rem; cursor: pointer; font-family: var(--font-ui);
      transition: background 100ms;
    }
    .pc-export-btn:hover { background: color-mix(in srgb, var(--color-accent-sage) 12%, transparent); }
    .pc-grid {
      display: grid; grid-template-columns: repeat(7, 1fr);
      gap: 2px; background: var(--color-border-subtle);
      border: 1px solid var(--color-border-subtle); border-radius: .5rem; overflow: hidden;
    }
    .pc-day-label {
      background: var(--color-surface-raised); padding: .375rem;
      font-size: .6875rem; font-weight: 700; text-align: center;
      color: var(--color-ink-muted); text-transform: uppercase; letter-spacing: .04em;
    }
    .pc-day-label:first-child { color: var(--color-accent-gold); }
    .pc-cell {
      background: var(--color-surface-elevated); min-height: 3.5rem; padding: .375rem;
      position: relative;
    }
    .pc-cell--empty { background: var(--color-surface-base); }
    .pc-cell--sunday { background: color-mix(in srgb, var(--color-accent-gold) 5%, var(--color-surface-elevated)); }
    .pc-cell--today .pc-date-num {
      background: var(--color-accent-gold); color: #000;
      border-radius: 50%; width: 1.5rem; height: 1.5rem;
      display: flex; align-items: center; justify-content: center;
    }
    .pc-date-num {
      font-size: .75rem; color: var(--color-ink-muted); font-family: var(--font-mono);
      display: block; margin-bottom: .25rem;
    }
    .pc-slot { width: 100%; }
    .pc-slot__assign {
      width: 100%; background: none; border: 1px dashed var(--color-border-subtle);
      border-radius: .25rem; padding: .2rem .375rem; font-size: .65rem;
      color: var(--color-ink-muted); cursor: pointer; text-align: center;
      font-family: var(--font-ui); transition: border-color 100ms, color 100ms;
    }
    .pc-slot__assign:hover { border-color: var(--color-accent-gold); color: var(--color-accent-gold); }
    .pc-slot--filled { display: flex; align-items: flex-start; gap: .25rem; }
    .pc-slot__title {
      flex: 1; font-size: .65rem; color: var(--color-accent-gold);
      font-family: var(--font-ui); line-height: 1.3;
      overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    }
    .pc-slot__clear {
      background: none; border: none; cursor: pointer; color: var(--color-ink-muted);
      font-size: .65rem; padding: 0; flex-shrink: 0; line-height: 1;
    }
    .pc-summary { margin-top: 1.25rem; }
    .pc-summary__title {
      font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
      color: var(--color-ink-muted); margin: 0 0 .625rem;
    }
    .pc-summary-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: .5rem 0; border-bottom: 1px solid var(--color-border-subtle);
      font-size: .875rem;
    }
    .pc-summary-row__date { color: var(--color-ink-secondary); font-family: var(--font-mono); font-size: .8125rem; }
    .pc-summary-row__sermon { color: var(--color-accent-gold); }
    .pc-summary-row__sermon--empty { color: var(--color-ink-muted); font-style: italic; }

    /* Sermon picker dialog */
    .pc-picker {
      border: 1px solid var(--color-border-subtle); border-radius: .5rem;
      background: var(--color-surface-modal); color: var(--color-ink-primary);
      padding: 1.25rem; width: min(360px, 92vw);
      box-shadow: 0 16px 48px rgba(0,0,0,.5);
    }
    .pc-picker::backdrop { background: rgba(0,0,0,.5); }
    .pc-picker__title { margin: 0 0 .25rem; font-size: 1rem; font-weight: 600; }
    .pc-picker__date { margin: 0 0 .875rem; font-size: .8125rem; color: var(--color-ink-muted); }
    .pc-picker__list { display: flex; flex-direction: column; gap: .375rem; max-height: 300px; overflow-y: auto; margin-bottom: .875rem; }
    .pc-picker__item {
      text-align: left; padding: .625rem .875rem; background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      cursor: pointer; transition: border-color 100ms; font-family: var(--font-ui);
      display: flex; justify-content: space-between; align-items: center;
    }
    .pc-picker__item:hover { border-color: var(--color-accent-gold); }
    .pc-picker__item--active { border-color: var(--color-accent-gold); background: color-mix(in srgb, var(--color-accent-gold) 10%, transparent); }
    .pc-picker__item-title { font-size: .875rem; color: var(--color-ink-primary); }
    .pc-picker__item-ref { font-size: .75rem; color: var(--color-accent-gold); font-family: var(--font-mono); }
    .pc-picker__empty { font-size: .875rem; color: var(--color-ink-muted); text-align: center; padding: 1rem; }
    .pc-picker__footer { display: flex; justify-content: flex-end; }
    .pc-picker__cancel {
      padding: .375rem .875rem; background: none;
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      color: var(--color-ink-secondary); cursor: pointer; font-size: .875rem; font-family: var(--font-ui);
    }

    @media (prefers-reduced-motion: reduce) {
      .hl-swatch, .pc-nav-btn, .pc-slot__assign { transition-duration: 0ms !important; }
    }
  `;
  document.head.appendChild(stage5c);

  // ── Stage 6 CSS ────────────────────────────────────────────
  const stage6c = document.createElement('style');
  stage6c.id = 'stage6c-css';
  stage6c.textContent = `
    /* ── Passage Guide ── */
    .pg { padding: var(--space-panel); display: flex; flex-direction: column; gap: .75rem; }
    .pg__header { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
    .pg__title { margin: 0; font-size: 1rem; font-weight: 600; color: var(--color-ink-primary); font-family: var(--font-ui); }
    .pg__ref { margin: 0; font-size: .875rem; color: var(--color-accent-gold); font-family: var(--font-scripture); }
    .pg__desc { margin: 0; font-size: .8125rem; color: var(--color-ink-muted); line-height: 1.5; }
    .pg__run-btn {
      align-self: flex-start; padding: .5rem 1.25rem;
      background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .375rem; cursor: pointer;
      font-size: .875rem; font-weight: 600; font-family: var(--font-ui);
      transition: filter 120ms;
    }
    .pg__run-btn:hover { filter: brightness(1.1); }
    .pg__note { margin: 0; font-size: .75rem; color: var(--color-ink-muted); }
    .pg__cached-note { margin: 0; font-size: .75rem; color: var(--color-accent-sage); font-style: italic; }
    .pg__saved-bar { display: flex; align-items: center; gap: .5rem; padding: .35rem .75rem; background: color-mix(in srgb, var(--color-accent-sage) 8%, transparent); border-radius: 4px; margin-bottom: .5rem; flex-wrap: wrap; }
    .pg__saved-date { font-size: .72rem; color: var(--color-ink-muted); flex: 1; font-style: italic; }
    .pg__export-btn { font-size: .72rem; padding: .2rem .5rem; background: none; border: 1px solid var(--color-border-subtle); border-radius: 3px; color: var(--color-ink-secondary); cursor: pointer; transition: border-color 150ms, color 150ms; }
    .pg__export-btn:hover { border-color: var(--color-accent-sage); color: var(--color-accent-sage); }
    .pg__regen-btn  { font-size: .72rem; padding: .2rem .5rem; background: none; border: 1px solid var(--color-border-subtle); border-radius: 3px; color: var(--color-ink-muted); cursor: pointer; transition: border-color 150ms; }
    .pg__regen-btn:hover { border-color: var(--color-ink-secondary); color: var(--color-ink-primary); }
    .pg__stop-btn {
      margin-left: auto; padding: .25rem .75rem;
      background: var(--color-surface-raised); color: var(--color-accent-burgundy);
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      font-size: .75rem; cursor: pointer; font-family: var(--font-ui);
      transition: background 120ms, color 120ms;
    }
    .pg__stop-btn:hover { background: var(--color-accent-burgundy); color: #fff; }

    /* Section accordion */
    .pg__section {
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      overflow: hidden; background: var(--color-surface-elevated);
    }
    .pg__section-header {
      display: flex; align-items: center; gap: .5rem;
      padding: .625rem .75rem; cursor: pointer;
      font-size: .875rem; font-weight: 600; color: var(--color-ink-primary);
      font-family: var(--font-ui); list-style: none;
    }
    .pg__section-header::-webkit-details-marker { display: none; }
    .pg__section-header::before {
      content: '\\25B8'; font-size: .75rem; color: var(--color-ink-muted);
      transition: transform 120ms;
    }
    details[open] > .pg__section-header::before { transform: rotate(90deg); }
    .pg__section-icon { font-size: .875rem; color: var(--color-accent-gold); flex-shrink: 0; }
    .pg__section-label { flex: 1; }
    .pg__section-status { font-size: .6875rem; font-weight: 400; }
    .pg__section-status--loading { color: var(--color-accent-gold); }
    .pg__section-status--done { color: var(--color-accent-sage); }
    .pg__section-status--error { color: var(--color-accent-burgundy); }

    /* Section body */
    .pg__section-body {
      padding: .5rem .75rem .75rem;
      font-size: .8125rem; line-height: 1.6; color: var(--color-ink-secondary);
      border-top: 1px solid var(--color-border-subtle);
    }
    .pg__section-body strong { color: var(--color-ink-primary); }

    /* Markdown elements */
    .pg__p  { margin: .375rem 0; }
    .pg__h3 { margin: .75rem 0 .25rem; font-size: .9375rem; color: var(--color-ink-primary); }
    .pg__h4 { margin: .625rem 0 .25rem; font-size: .875rem; color: var(--color-ink-primary); }
    .pg__li { margin-left: 1.25rem; margin-bottom: .25rem; }
    .pg__li--bullet { list-style: disc; }
    .pg__hr { border: none; border-top: 1px solid var(--color-border-subtle); margin: .75rem 0; }
    .pg__error { color: var(--color-accent-burgundy); font-style: italic; }
    .pg__error-hint { font-size: .8rem; color: var(--color-ink-muted); margin: .25rem 0 0; }
    .pg__error-hint strong { color: var(--color-ink-secondary); }
    .pg__settings-btn {
      margin-top: .5rem; padding: .3rem .75rem; background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle); border-radius: var(--radius-ui);
      font-size: .8rem; color: var(--color-ink-secondary); cursor: pointer; font-family: var(--font-ui);
    }
    .pg__settings-btn:hover { border-color: var(--color-accent-gold); color: var(--color-accent-gold); }

    /* Spinner + cursor */
    .pg__spinner {
      width: 1.25rem; height: 1.25rem; border-radius: 50%;
      border: 2px solid var(--color-border-subtle);
      border-top-color: var(--color-accent-gold);
      animation: pg-spin 600ms linear infinite;
    }
    @keyframes pg-spin { to { transform: rotate(360deg); } }
    .pg__cursor { animation: pg-blink 700ms steps(1) infinite; color: var(--color-accent-gold); }
    @keyframes pg-blink { 50% { opacity: 0; } }

    .pg__disclaimer {
      font-size: .75rem; color: var(--color-ink-muted); font-style: italic;
      border-top: 1px solid var(--color-border-subtle); padding-top: .5rem;
    }

    @media (prefers-reduced-motion: reduce) {
      .pg__spinner { animation: none; }
      .pg__cursor  { animation: none; }
      .pg__section-header::before { transition-duration: 0ms !important; }
    }

    /* ── Exegetical Checklist ── */
    .ec { display: flex; flex-direction: column; }
    .ec__placeholder { padding: 2rem var(--space-panel); text-align: center; }
    .ec__placeholder-title { font-size: 1rem; font-weight: 600; color: var(--color-ink-primary); margin: 0 0 .5rem; }
    .ec__placeholder-body  { font-size: .875rem; color: var(--color-ink-muted); margin: 0; line-height: 1.5; }

    .ec__header {
      padding: .875rem var(--space-panel) .75rem;
      border-bottom: 1px solid var(--color-border-subtle);
      display: flex; flex-wrap: wrap; align-items: center; gap: .375rem;
    }
    .ec__title { margin: 0; font-size: .9375rem; font-weight: 600; color: var(--color-ink-primary); font-family: var(--font-ui); flex: 1; }
    .ec__ref   { font-size: .8125rem; color: var(--color-accent-gold); font-family: var(--font-scripture); width: 100%; order: 2; }
    .ec__progress {
      width: 100%; height: 4px; background: var(--color-surface-raised);
      border-radius: 9999px; order: 3;
    }
    .ec__progress-bar {
      height: 100%; background: var(--color-accent-gold); border-radius: 9999px;
      transition: width 300ms ease;
    }
    .ec__progress-label { font-size: .75rem; color: var(--color-ink-muted); order: 4; width: 100%; }

    /* Steps */
    .ec__step {
      border-bottom: 1px solid var(--color-border-subtle);
    }
    .ec__step-header {
      display: flex; align-items: center; gap: .5rem;
      padding: .625rem var(--space-panel);
      cursor: pointer; list-style: none;
      font-size: .875rem; font-weight: 600; color: var(--color-ink-primary);
      font-family: var(--font-ui);
    }
    .ec__step-header::-webkit-details-marker { display: none; }
    .ec__step-num {
      width: 1.375rem; height: 1.375rem; border-radius: 9999px;
      background: var(--color-surface-raised); color: var(--color-ink-muted);
      display: flex; align-items: center; justify-content: center;
      font-size: .6875rem; font-weight: 700; flex-shrink: 0;
    }
    .ec__step--done .ec__step-num { background: var(--color-accent-gold); color: #000; }
    .ec__step-label { flex: 1; }
    .ec__step-check {
      width: 1rem; height: 1rem; accent-color: var(--color-accent-gold);
      cursor: pointer; flex-shrink: 0;
    }
    /* Stop checkbox from toggling details open/close */
    .ec__step-check { pointer-events: auto; }
    summary .ec__step-check { margin-left: auto; }

    .ec__step-body {
      padding: .5rem var(--space-panel) .875rem;
      display: flex; flex-direction: column; gap: .5rem;
    }
    .ec__step-desc {
      margin: 0; font-size: .8125rem; color: var(--color-ink-muted); line-height: 1.5;
      font-style: italic;
    }
    .ec__notes {
      width: 100%; background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      color: var(--color-ink-primary); font-size: .8125rem; font-family: var(--font-ui);
      padding: .5rem .625rem; resize: vertical; line-height: 1.5;
      box-sizing: border-box;
    }
    .ec__notes:focus { outline: none; border-color: var(--color-accent-gold); }
    .ec__ai-controls { display: flex; gap: .375rem; align-items: center; }
    .ec__ai-btn {
      padding: .3125rem .875rem; border-radius: .375rem;
      background: var(--color-surface-raised); color: var(--color-ink-secondary);
      border: 1px solid var(--color-border-subtle);
      font-size: .75rem; font-family: var(--font-ui); cursor: pointer;
      transition: background 120ms, color 120ms;
    }
    .ec__ai-btn:hover:not(:disabled) { background: var(--color-accent-gold); color: #000; border-color: transparent; }
    .ec__ai-btn:disabled { opacity: .5; cursor: default; }
    .ec__ai-clear {
      padding: .25rem .5rem; border-radius: .375rem; font-size: .6875rem;
      background: none; border: 1px solid var(--color-border-subtle);
      color: var(--color-ink-muted); cursor: pointer;
      transition: color 120ms;
    }
    .ec__ai-clear:hover { color: var(--color-accent-burgundy); border-color: var(--color-accent-burgundy); }
    .ec__ai-output {
      font-size: .8125rem; line-height: 1.6; color: var(--color-ink-secondary);
      background: var(--color-surface-elevated); border-radius: .375rem;
      padding: .625rem .75rem; border: 1px solid var(--color-border-subtle);
    }
    .ec__ai-output strong { color: var(--color-ink-primary); }
    .ec__ai-cursor { animation: ec-blink 700ms steps(1) infinite; color: var(--color-accent-gold); }
    @keyframes ec-blink { 50% { opacity: 0; } }
    .ec__ai-error { color: var(--color-accent-burgundy); font-style: italic; margin: 0; }

    /* Markdown */
    .ec__p  { margin: .25rem 0; }
    .ec__h3 { margin: .625rem 0 .25rem; font-size: .875rem; color: var(--color-ink-primary); }
    .ec__h4 { margin: .5rem 0 .25rem; font-size: .8125rem; color: var(--color-ink-primary); }
    .ec__li { margin-left: 1.125rem; margin-bottom: .1875rem; }
    .ec__li--bullet { list-style: disc; }
    .ec__hr { border: none; border-top: 1px solid var(--color-border-subtle); margin: .5rem 0; }

    .ec__disclaimer {
      padding: .625rem var(--space-panel);
      font-size: .75rem; color: var(--color-ink-muted); font-style: italic;
      border-top: 1px solid var(--color-border-subtle);
    }

    @media (prefers-reduced-motion: reduce) {
      .ec__ai-cursor { animation: none; }
      .ec__progress-bar { transition-duration: 0ms !important; }
    }
  `;
  document.head.appendChild(stage6c);

  // ── Study Session CSS ──────────────────────────────────────
  const ssStyle = document.createElement('style');
  ssStyle.id = 'study-session-css';
  ssStyle.textContent = `
    .study-session-view { flex: 1; min-height: 0; overflow-y: auto; background: var(--color-surface-base); }
    .ss { max-width: 36rem; margin: 0 auto; padding: 1.5rem 1rem; }
    .ss__header { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; }
    .ss__title { margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--color-ink-primary); font-family: var(--font-ui); }
    .ss__title-input {
      flex: 1; background: none; border: none; color: var(--color-ink-primary);
      font-family: var(--font-ui); font-size: 1.125rem; font-weight: 600; outline: none;
      padding: .25rem .5rem; border-radius: .25rem;
    }
    .ss__title-input:focus { background: var(--color-surface-raised); }
    .ss__back-btn {
      background: none; border: none; color: var(--color-ink-secondary); cursor: pointer;
      padding: .25rem; border-radius: .25rem; display: flex; align-items: center;
    }
    .ss__back-btn:hover { color: var(--color-ink-primary); background: var(--color-surface-raised); }
    .ss__new-btn {
      margin-left: auto; padding: .5rem 1rem;
      background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .375rem; cursor: pointer;
      font-size: .8125rem; font-weight: 600; font-family: var(--font-ui);
    }
    .ss__new-btn:hover { filter: brightness(1.1); }
    .ss__empty { color: var(--color-ink-muted); font-size: .875rem; line-height: 1.5; }
    .ss__desc { color: var(--color-ink-secondary); font-size: .875rem; margin-bottom: 1rem; }
    .ss__card {
      display: flex; align-items: center; gap: .75rem;
      padding: .75rem 1rem; margin-bottom: .5rem;
      background: var(--color-surface-elevated); border-radius: .375rem;
      border: 1px solid var(--color-border-subtle); cursor: pointer;
      transition: border-color 100ms;
    }
    .ss__card:hover { border-color: var(--color-accent-gold); }
    .ss__card--pick { cursor: pointer; }
    .ss__card-main { flex: 1; min-width: 0; }
    .ss__card-title { margin: 0; font-size: .9375rem; font-weight: 600; color: var(--color-ink-primary); }
    .ss__card-meta { margin: .25rem 0 0; font-size: .75rem; color: var(--color-ink-muted); }
    .ss__card-actions { display: flex; gap: .375rem; flex-shrink: 0; }
    .ss__card-btn {
      background: none; border: none; color: var(--color-ink-muted); cursor: pointer;
      padding: .375rem; border-radius: .25rem; display: flex;
    }
    .ss__card-btn:hover { color: var(--color-ink-primary); background: var(--color-surface-raised); }
    .ss__card-btn--delete:hover { color: var(--color-accent-burgundy); }
    .ss__label {
      display: block; font-size: .75rem; font-weight: 600; color: var(--color-ink-secondary);
      text-transform: uppercase; letter-spacing: .05em; margin: 1rem 0 .375rem;
      font-family: var(--font-ui);
    }
    .ss__input, .ss__textarea {
      width: 100%; padding: .5rem .75rem;
      background: var(--color-surface-elevated); color: var(--color-ink-primary);
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      font-size: .875rem; font-family: var(--font-ui); outline: none;
      box-sizing: border-box;
    }
    .ss__input:focus, .ss__textarea:focus { border-color: var(--color-accent-gold); }
    .ss__textarea { resize: vertical; min-height: 3rem; }
    .ss__textarea--scripture {
      font-family: var(--font-scripture); font-size: .9375rem; line-height: 1.6;
    }
    .ss__section {
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      padding: .75rem; margin: 1rem 0; background: var(--color-surface-elevated);
    }
    .ss__section-legend {
      font-size: .8125rem; font-weight: 600; color: var(--color-accent-gold);
      font-family: var(--font-ui); padding: 0 .375rem;
    }
    .ss__item-row { display: flex; align-items: center; gap: .5rem; margin-bottom: .375rem; }
    .ss__item-num { font-size: .75rem; color: var(--color-ink-muted); min-width: 1.25rem; text-align: right; }
    .ss__item-input {
      flex: 1; padding: .375rem .5rem;
      background: var(--color-surface-base); color: var(--color-ink-primary);
      border: 1px solid var(--color-border-subtle); border-radius: .25rem;
      font-size: .8125rem; font-family: var(--font-ui); outline: none;
    }
    .ss__item-input:focus { border-color: var(--color-accent-gold); }
    .ss__item-remove {
      background: none; border: none; color: var(--color-ink-muted); cursor: pointer;
      font-size: 1rem; padding: .125rem .375rem; border-radius: .25rem;
    }
    .ss__item-remove:hover { color: var(--color-accent-burgundy); }
    .ss__add-item, .ss__add-btn {
      background: none; border: 1px dashed var(--color-border-subtle);
      color: var(--color-ink-muted); cursor: pointer; padding: .375rem .75rem;
      border-radius: .25rem; font-size: .75rem; font-family: var(--font-ui);
      margin-top: .375rem;
    }
    .ss__add-item:hover, .ss__add-btn:hover { color: var(--color-ink-primary); border-color: var(--color-ink-muted); }
    .ss__add-section { display: flex; flex-wrap: wrap; gap: .375rem; margin: 1rem 0; }
    .ss__footer { margin-top: 1.5rem; text-align: center; }
    .ss__publish-btn {
      display: inline-flex; align-items: center; gap: .5rem;
      padding: .625rem 1.5rem; background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .375rem; cursor: pointer;
      font-size: .9375rem; font-weight: 600; font-family: var(--font-ui);
    }
    .ss__publish-btn:hover { filter: brightness(1.1); }
    .ss__publishing { text-align: center; color: var(--color-ink-muted); font-size: .875rem; }
    .ss__error { color: var(--color-accent-burgundy); font-size: .875rem; }
    .ss__share-note { text-align: center; font-size: .75rem; color: var(--color-ink-muted); margin-top: .75rem; }

    /* QR Display */
    .ss-qr { text-align: center; margin-top: 1.5rem; padding: 1.5rem; background: var(--color-surface-elevated); border-radius: .5rem; }
    .ss-qr__canvas { display: flex; justify-content: center; margin-bottom: .75rem; }
    .ss-qr__hint { font-size: .8125rem; color: var(--color-ink-muted); margin: 0 0 .75rem; }
    .ss-qr__url-row { display: flex; gap: .375rem; }
    .ss-qr__url {
      flex: 1; padding: .375rem .5rem;
      background: var(--color-surface-base); color: var(--color-ink-primary);
      border: 1px solid var(--color-border-subtle); border-radius: .25rem;
      font-size: .75rem; font-family: var(--font-mono); outline: none;
    }
    .ss-qr__copy {
      padding: .375rem .75rem; background: var(--color-surface-raised);
      color: var(--color-ink-primary); border: 1px solid var(--color-border-subtle);
      border-radius: .25rem; cursor: pointer; font-size: .75rem; font-family: var(--font-ui);
    }
    .ss-qr__copy:hover { background: var(--color-surface-modal); }
    .ss-qr__copied { font-size: .75rem; color: var(--color-accent-sage); margin: .5rem 0 0; }

    /* ── Stage 6 Item 6: Timeline (vertical feed) ── */
    .rp-pane--timeline { overflow: hidden; display: flex; flex-direction: column; padding: 0 !important; }
    .tp { display: flex; flex-direction: column; height: 100%; overflow: hidden; font-family: var(--font-ui); }

    /* Header */
    .tp__header {
      padding: .5rem .75rem; background: var(--color-surface-elevated);
      border-bottom: 1px solid var(--color-border-subtle);
      display: flex; align-items: center; gap: .5rem; flex-shrink: 0;
    }
    .tp__title  { font-size: .8125rem; font-weight: 600; color: var(--color-ink-primary); flex: 1; }
    .tp__status { font-size: .75rem; color: var(--color-ink-muted); font-style: italic; flex: 1; }
    .tp__info-btn {
      font-size: .75rem; color: var(--color-ink-muted); background: none; border: none;
      cursor: pointer; padding: 0 .25rem; line-height: 1; flex-shrink: 0;
      transition: color 150ms; border-radius: 3px;
    }
    .tp__info-btn:hover { color: var(--color-ink-primary); }

    /* Disclaimer (toggled by ⓘ) */
    .tp__disclaimer {
      font-size: .72rem; color: var(--color-ink-secondary); line-height: 1.5;
      padding: .5rem .75rem; border-bottom: 1px solid var(--color-border-subtle);
      background: color-mix(in srgb, var(--color-accent-gold) 6%, transparent);
    }
    .tp__disclaimer--hidden { display: none; }

    /* Scrollable body */
    .tp__body { flex: 1; overflow-y: auto; overflow-x: hidden; }

    /* Era dividers — sticky within the scroll container */
    .tp__era-header {
      position: sticky; top: 0; z-index: 3;
      display: flex; align-items: center; gap: .5rem;
      padding: .3rem .75rem;
      background: var(--color-surface-elevated);
      border-bottom: 1px solid var(--color-border-subtle);
      border-top: 1px solid var(--color-border-subtle);
    }
    .tp__era-name {
      font-size: .6rem; font-weight: 700; letter-spacing: .08em;
      color: var(--color-accent-gold); flex: 1;
    }
    .tp__era-year { font-size: .6rem; color: var(--color-ink-muted); font-family: var(--font-mono); }

    /* Chapter sections */
    .tp__section {
      padding: .5rem .75rem .625rem 1rem;
      border-left: 2px solid var(--color-border-subtle);
      margin: .25rem .5rem .25rem .625rem;
      border-radius: 0 4px 4px 0;
      opacity: .55;
      transition: opacity 150ms, border-color 150ms;
    }
    .tp__section--active {
      opacity: 1;
      border-left-color: var(--color-accent-gold);
      background: color-mix(in srgb, var(--color-accent-gold) 4%, transparent);
    }
    @media (prefers-reduced-motion: reduce) { .tp__section { transition-duration: 0ms !important; } }

    /* Section header */
    .tp__section-hd {
      display: flex; align-items: baseline; gap: .5rem;
      margin-bottom: .35rem;
    }
    .tp__section-num {
      font-size: .7rem; font-weight: 700; color: var(--color-ink-secondary);
      text-transform: uppercase; letter-spacing: .05em;
    }
    .tp__section--active .tp__section-num { color: var(--color-accent-gold); }
    .tp__section-year { font-size: .65rem; color: var(--color-ink-muted); font-family: var(--font-mono); }

    /* Event items */
    .tp__event {
      display: flex; align-items: flex-start; gap: .5rem;
      padding: .25rem 0; cursor: pointer; border-radius: 3px;
    }
    .tp__event:hover .tp__event-name { color: var(--color-accent-gold); }
    .tp__event:focus { outline: 1px solid var(--color-accent-gold); outline-offset: 2px; border-radius: 3px; }
    .tp__event-pip {
      width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      background: var(--color-accent-gold);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent-gold) 25%, transparent);
      margin-top: 4px;
    }
    .tp__event-content { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
    .tp__event-name {
      font-size: .78rem; color: var(--color-ink-primary); line-height: 1.35;
      transition: color 100ms;
    }
    .tp__event-date { font-size: .65rem; color: var(--color-ink-muted); font-family: var(--font-mono); }

    /* Person items */
    .tp__person {
      display: flex; align-items: flex-start; gap: .5rem;
      padding: .2rem 0; cursor: pointer; border-radius: 3px;
    }
    .tp__person:hover .tp__person-name { color: var(--color-accent-sage); }
    .tp__person:focus { outline: 1px solid var(--color-accent-sage); outline-offset: 2px; border-radius: 3px; }
    .tp__person-accent {
      width: 3px; min-height: 1.6rem; flex-shrink: 0;
      background: var(--color-accent-sage); border-radius: 2px;
      margin-top: 2px;
    }
    .tp__person-content { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
    .tp__person-name { font-size: .775rem; color: var(--color-ink-secondary); line-height: 1.3; transition: color 100ms; }
    .tp__person-life { font-size: .65rem; color: var(--color-ink-muted); font-family: var(--font-mono); }
    .tp__life-break  { color: var(--color-ink-muted); font-style: italic; }

    /* Places row */
    .tp__places-row {
      display: flex; flex-wrap: wrap; gap: .25rem;
      margin-top: .3rem; padding-top: .3rem;
      border-top: 1px solid var(--color-border-subtle);
    }
    .tp__place-tag {
      font-size: .65rem; color: var(--color-ink-muted);
      background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle);
      border-radius: 3px; padding: .1rem .35rem; line-height: 1.4;
    }

    /* Empty state */
    .tp__empty {
      padding: 1.25rem .875rem; display: flex; flex-direction: column; gap: .5rem;
    }
    .tp__empty-title { font-size: .875rem; font-weight: 600; color: var(--color-ink-primary); }
    .tp__empty-msg   { font-size: .78rem; color: var(--color-ink-secondary); line-height: 1.45; }
    .tp__empty-period {
      font-size: .75rem; color: var(--color-accent-gold); line-height: 1.5;
      padding: .4rem .6rem; background: color-mix(in srgb, var(--color-accent-gold) 8%, transparent);
      border-left: 2px solid var(--color-accent-gold); border-radius: 0 3px 3px 0;
    }
    .tp__empty-hint { font-size: .72rem; color: var(--color-ink-muted); font-style: italic; }

    /* ── Stage 6 Item 7: Entity Graph ── */
    .rp-pane--graph { overflow: hidden; display: flex; flex-direction: column; padding: 0 !important; }
    .eg { display: flex; flex-direction: column; height: 100%; }
    .eg__header {
      padding: .5rem .75rem; background: var(--color-surface-elevated);
      border-bottom: 1px solid var(--color-border-subtle);
      display: flex; align-items: center; gap: .5rem; flex-shrink: 0; flex-wrap: wrap;
    }
    .eg__title { font-size: .8125rem; font-weight: 600; color: var(--color-ink-primary); font-family: var(--font-ui); flex: 1; }
    .eg__status { font-size: .75rem; color: var(--color-ink-muted); font-family: var(--font-ui); font-style: italic; }
    .eg__legend { display: flex; align-items: center; gap: .375rem; font-size: .7rem; color: var(--color-ink-secondary); font-family: var(--font-ui); }
    .eg__legend-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .eg__legend-dot--person { background: var(--color-accent-gold); }
    .eg__legend-dot--place  { background: var(--color-accent-sage); clip-path: polygon(50% 0%,100% 50%,50% 100%,0% 50%); border-radius: 0; }
    .eg__legend-label { margin-right: .5rem; }
    .eg__canvas { flex: 1; background: var(--color-surface-base); cursor: default; }
    .eg__status { font-size: .72rem; color: var(--color-accent-gold); font-family: var(--font-ui); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .eg__clear {
      padding: .15rem .5rem; background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle); border-radius: var(--radius-ui);
      font-size: .7rem; color: var(--color-ink-muted); cursor: pointer;
      font-family: var(--font-ui); flex-shrink: 0;
      transition: border-color 100ms, color 100ms;
    }
    .eg__clear:hover { border-color: var(--color-accent-burgundy); color: var(--color-accent-burgundy); }
  `;
  document.head.appendChild(ssStyle);

  // ── Shortcuts modal CSS ──────────────────────────────────
  const scStyle = document.createElement('style');
  scStyle.id = 'shortcuts-css';
  scStyle.textContent = `
    .sc-modal {
      position: fixed; inset: 0; z-index: 9000; margin: auto;
      width: min(520px, 94vw); max-height: 80vh;
      background: var(--color-surface-modal);
      border: 1px solid var(--color-border-subtle);
      border-radius: 0.5rem;
      padding: 0;
      color: var(--color-ink-primary);
      box-shadow: 0 24px 64px rgba(0,0,0,.6);
      overflow: hidden;
    }
    .sc-modal::backdrop {
      background: rgba(0,0,0,.55);
      backdrop-filter: blur(2px);
    }
    .sc-inner { display: flex; flex-direction: column; max-height: 80vh; }
    .sc-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 1rem 1.25rem 0.75rem;
      border-bottom: 1px solid var(--color-border-subtle);
      flex-shrink: 0;
    }
    .sc-title {
      margin: 0; font-family: 'EB Garamond', Georgia, serif;
      font-size: 1.125rem; font-weight: 600; color: var(--color-ink-primary);
    }
    .sc-close {
      background: none; border: none; cursor: pointer;
      color: var(--color-ink-muted); font-size: 1rem; padding: .25rem .4rem;
      border-radius: .25rem; transition: background 100ms, color 100ms;
    }
    .sc-close:hover { background: var(--color-surface-raised); color: var(--color-ink-primary); }
    .sc-body {
      overflow-y: auto; padding: .75rem 1.25rem 1.25rem;
      display: flex; flex-direction: column; gap: 1.25rem;
    }
    .sc-group__title {
      margin: 0 0 .5rem; font-size: .6875rem; font-weight: 700; letter-spacing: .08em;
      text-transform: uppercase; color: var(--color-ink-muted);
    }
    .sc-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; padding: .3rem 0;
      border-bottom: 1px solid color-mix(in srgb, var(--color-border-subtle) 50%, transparent);
    }
    .sc-row:last-child { border-bottom: none; }
    .sc-keys { display: flex; align-items: center; gap: .25rem; flex-shrink: 0; }
    .sc-key {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 1.75rem; padding: .2rem .45rem;
      background: var(--color-surface-raised);
      border: 1px solid var(--color-border-subtle);
      border-bottom-width: 2px;
      border-radius: .3rem;
      font-family: 'Fira Code', monospace; font-size: .75rem;
      color: var(--color-accent-gold);
    }
    .sc-plus { color: var(--color-ink-muted); font-size: .75rem; }
    .sc-desc { font-size: .875rem; color: var(--color-ink-secondary); text-align: right; }
  `;
  document.head.appendChild(scStyle);

  // ── Topic Workspace CSS ────────────────────────────────────
  const twStyle = document.createElement('style');
  twStyle.id = 'topic-workspace-css';
  twStyle.textContent = `
    .topics-view { flex: 1; min-height: 0; overflow-y: auto; background: var(--color-surface-base); }
    .tw { max-width: 36rem; margin: 0 auto; padding: 1.5rem 1rem; }
    .tw__header {
      display: flex; align-items: center; gap: .625rem; margin-bottom: 1.25rem;
    }
    .tw__title {
      flex: 1; margin: 0; font-size: 1.25rem; font-weight: 600;
      color: var(--color-ink-primary); font-family: var(--font-ui);
    }
    .tw__new-btn {
      padding: .375rem .875rem; background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .375rem; cursor: pointer;
      font-size: .8125rem; font-weight: 600; font-family: var(--font-ui);
      transition: filter 150ms;
    }
    .tw__new-btn:hover { filter: brightness(1.1); }
    .tw__empty { color: var(--color-ink-muted); font-style: italic; font-size: .9375rem; margin: 2rem 0; text-align: center; }

    /* List view */
    .tw__card {
      display: flex; align-items: center; gap: .5rem;
      background: var(--color-surface-elevated); border-radius: .5rem;
      border: 1px solid var(--color-border-subtle);
      padding: .875rem 1rem; margin-bottom: .625rem;
      cursor: pointer; transition: background 150ms;
    }
    .tw__card:hover { background: var(--color-surface-raised); }
    .tw__card-body { flex: 1; min-width: 0; }
    .tw__card-name { margin: 0; font-size: 1rem; font-weight: 600; color: var(--color-ink-primary); font-family: var(--font-ui); }
    .tw__card-meta { margin: .25rem 0 0; font-size: .8125rem; color: var(--color-ink-muted); }
    .tw__card-actions { display: flex; gap: .25rem; flex-shrink: 0; }

    /* Editor view */
    .tw__back-btn {
      background: none; border: none; cursor: pointer;
      color: var(--color-ink-secondary); padding: .25rem; border-radius: .25rem;
      display: flex; align-items: center; transition: color 150ms;
      flex-shrink: 0;
    }
    .tw__back-btn:hover { color: var(--color-ink-primary); }
    .tw__name-input {
      flex: 1; background: none; border: none; color: var(--color-ink-primary);
      font-family: var(--font-ui); font-size: 1.125rem; font-weight: 600;
      outline: none; padding: .25rem .5rem; border-radius: .25rem;
    }
    .tw__name-input:focus { background: var(--color-surface-raised); }
    .tw__export-btn {
      background: var(--color-surface-raised); border: 1px solid var(--color-border-subtle);
      color: var(--color-ink-secondary); border-radius: .25rem; cursor: pointer;
      padding: .25rem .5rem; font-size: .875rem; transition: color 150ms;
      flex-shrink: 0;
    }
    .tw__export-btn:hover { color: var(--color-ink-primary); }

    /* Add verse row */
    .tw__add-row { display: flex; gap: .5rem; margin-bottom: 1rem; }
    .tw__ref-input {
      flex: 1; padding: .5rem .75rem;
      background: var(--color-surface-elevated); color: var(--color-ink-primary);
      border: 1px solid var(--color-border-subtle); border-radius: .375rem;
      font-size: .9375rem; font-family: var(--font-ui); outline: none;
      transition: border-color 150ms;
    }
    .tw__ref-input:focus { border-color: var(--color-accent-gold); }
    .tw__add-verse-btn {
      padding: .5rem .875rem; background: var(--color-accent-gold); color: #000;
      border: none; border-radius: .375rem; cursor: pointer;
      font-size: .875rem; font-weight: 600; font-family: var(--font-ui);
      transition: filter 150ms; flex-shrink: 0;
    }
    .tw__add-verse-btn:hover { filter: brightness(1.1); }

    /* Verse cards */
    .tw__verse-list { display: flex; flex-direction: column; gap: .625rem; }
    .tw__verse-card {
      background: var(--color-surface-elevated); border-radius: .5rem;
      border: 1px solid var(--color-border-subtle); padding: .875rem;
    }
    .tw__verse-card--ghost { opacity: .4; }
    .tw__verse-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .375rem; }
    .tw__verse-ref {
      font-size: .875rem; font-weight: 600; color: var(--color-accent-gold);
      font-family: var(--font-ui); cursor: grab;
    }
    .tw__verse-ref:active { cursor: grabbing; }
    .tw__verse-text {
      margin: 0 0 .5rem; font-size: .9375rem; color: var(--color-ink-scripture);
      font-family: 'EB Garamond', Georgia, serif; line-height: 1.55;
    }
    .tw__verse-note {
      width: 100%; box-sizing: border-box;
      background: var(--color-surface-base); color: var(--color-ink-primary);
      border: 1px solid var(--color-border-subtle); border-radius: .25rem;
      padding: .375rem .5rem; font-size: .8125rem; font-family: var(--font-ui);
      resize: vertical; outline: none; transition: border-color 150ms;
    }
    .tw__verse-note:focus { border-color: var(--color-accent-gold); }

    /* Icon buttons */
    .tw__icon-btn {
      background: none; border: none; cursor: pointer;
      color: var(--color-ink-muted); padding: .2rem .35rem; border-radius: .25rem;
      font-size: 1rem; line-height: 1; transition: color 150ms, background 150ms;
      display: flex; align-items: center;
    }
    .tw__icon-btn:hover { color: var(--color-ink-primary); background: var(--color-surface-raised); }
    .tw__icon-btn--delete:hover { color: var(--color-accent-burgundy); }

    @media (prefers-reduced-motion: reduce) {
      .tw__card, .tw__name-input, .tw__ref-input, .tw__add-verse-btn,
      .tw__new-btn, .tw__verse-note, .tw__icon-btn { transition-duration: 0ms !important; }
    }
  `;
  document.head.appendChild(twStyle);

  // ── Reading Journal CSS ────────────────────────────────────────────────────
  const rjStyle = document.createElement('style');
  rjStyle.id = 'reading-journal-css';
  rjStyle.textContent = `
    .journal-view { flex: 1; min-height: 0; overflow-y: auto; background: var(--color-surface-base); }
    .rj { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem; }
    .rj__header { margin-bottom: .75rem; }
    .rj__title { margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--color-ink-primary); font-family: var(--font-ui); }
    .rj__tabs { display: flex; gap: .25rem; margin-bottom: 1rem; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: .5rem; }
    .rj__tab { background: none; border: none; cursor: pointer; padding: .375rem .75rem; border-radius: .375rem; font-size: .875rem; font-family: var(--font-ui); color: var(--color-ink-secondary); transition: color 150ms, background 150ms; }
    .rj__tab:hover { color: var(--color-ink-primary); background: var(--color-surface-raised); }
    .rj__tab--active { color: var(--color-accent-gold); font-weight: 600; border-bottom: 2px solid var(--color-accent-gold); padding-bottom: calc(.375rem - 2px); }

    /* Year nav */
    .rj__year-nav { display: flex; align-items: center; gap: .75rem; margin-bottom: 1rem; justify-content: center; }
    .rj__year-btn { background: var(--color-surface-raised); border: 1px solid var(--color-border-subtle); color: var(--color-ink-primary); border-radius: .375rem; cursor: pointer; width: 2.25rem; height: 2.25rem; font-size: 1.125rem; display: flex; align-items: center; justify-content: center; transition: background 150ms, border-color 150ms; flex-shrink: 0; }
    .rj__year-btn:hover:not(:disabled) { background: var(--color-surface-modal); border-color: var(--color-accent-gold); }
    .rj__year-btn:disabled { opacity: .35; cursor: default; }
    .rj__year-label { font-size: 1.5rem; font-weight: 700; color: var(--color-accent-gold); font-family: var(--font-ui); min-width: 6rem; text-align: center; }

    /* Stats */
    .rj__stats { display: flex; align-items: center; justify-content: center; gap: .625rem; margin-bottom: 1rem; font-size: .9375rem; color: var(--color-ink-secondary); font-family: var(--font-ui); font-weight: 500; }
    .rj__stats--row { flex-wrap: wrap; }
    .rj__stat { color: var(--color-ink-primary); }
    .rj__stat-sep { color: var(--color-border-subtle); opacity: .5; }
    .rj__overall-stats { text-align: center; margin-bottom: 1.5rem; padding: 1rem; background: var(--color-surface-elevated); border-radius: .5rem; border: 1px solid var(--color-border-subtle); }
    .rj__pct { font-size: 3rem; font-weight: 900; color: var(--color-accent-gold); display: block; font-family: var(--font-ui); line-height: 1; margin-bottom: .25rem; }
    .rj__pct-label { font-size: .9375rem; color: var(--color-ink-secondary); display: block; margin-bottom: 1rem; }
    .rj__progress-bar { height: 8px; background: var(--color-surface-raised); border-radius: 4px; overflow: hidden; margin-bottom: .75rem; }
    .rj__progress-fill { height: 100%; background: linear-gradient(90deg, var(--color-accent-gold), var(--color-accent-sage)); border-radius: 4px; transition: width 400ms cubic-bezier(0.4, 0, 0.2, 1); }

    /* Book grid */
    .rj__grid { display: flex; flex-direction: column; gap: .35rem; }
    .rj__book-row { display: flex; align-items: center; gap: .625rem; }
    .rj__book-abbr { font-size: .75rem; font-weight: 500; font-family: var(--font-ui); color: var(--color-ink-muted); min-width: 2.25rem; text-align: right; flex-shrink: 0; letter-spacing: .02em; }
    .rj__book-chs { display: flex; flex-wrap: wrap; gap: 2px; }
    .rj__ch { width: 7px; height: 7px; border-radius: .5px; background: var(--color-surface-raised); border: .5px solid var(--color-border-subtle); display: inline-block; cursor: default; transition: all 100ms; }
    .rj__ch:hover { transform: scale(1.3); }
    .rj__ch--read { background: var(--color-accent-gold); border-color: var(--color-accent-gold); box-shadow: 0 0 3px rgba(212, 175, 55, 0.3); }

    /* Monthly calendar */
    .rj__calendar { display: grid; grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr)); gap: .4rem; }
    .rj__month { padding: .5rem .625rem; border-radius: .375rem; border: 1px solid var(--color-border-subtle); text-align: center; display: flex; flex-direction: column; gap: .25rem; cursor: default; transition: all 150ms; }
    .rj__month:hover { border-color: var(--color-accent-gold); transform: translateY(-2px); }
    .rj__month--0 { background: var(--color-surface-elevated); }
    .rj__month--1 { background: color-mix(in srgb, var(--color-accent-gold) 12%, var(--color-surface-elevated)); }
    .rj__month--2 { background: color-mix(in srgb, var(--color-accent-gold) 28%, var(--color-surface-elevated)); }
    .rj__month--3 { background: color-mix(in srgb, var(--color-accent-gold) 50%, var(--color-surface-elevated)); }
    .rj__month--4 { background: var(--color-accent-gold); }
    .rj__month-name { font-size: .7rem; font-weight: 700; color: var(--color-ink-primary); font-family: var(--font-ui); text-transform: uppercase; letter-spacing: .05em; }
    .rj__month-yr   { font-size: .6rem; color: var(--color-ink-muted); font-family: var(--font-ui); }
    .rj__month-count { font-size: .8125rem; font-weight: 700; color: var(--color-accent-gold); font-family: var(--font-ui); line-height: 1.2; }
    .rj__month--3 .rj__month-count { color: #000; text-shadow: 0 0 1px rgba(0,0,0,.2); }
    .rj__month--4 .rj__month-count { color: #000; text-shadow: 0 0 1px rgba(0,0,0,.3); }
    .rj__month--3 .rj__month-name,
    .rj__month--4 .rj__month-name { color: rgba(0,0,0,.8); }
    .rj__month--3 .rj__month-yr,
    .rj__month--4 .rj__month-yr { color: rgba(0,0,0,.6); }

    /* Log */
    .rj__log { display: flex; flex-direction: column; gap: .5rem; }
    .rj__log-entry { background: var(--color-surface-elevated); border: 1px solid var(--color-border-subtle); border-radius: .375rem; padding: .75rem; transition: border-color 150ms, background 150ms; }
    .rj__log-entry:hover { border-color: var(--color-accent-gold); background: var(--color-surface-modal); }
    .rj__log-entry-head { display: flex; align-items: center; gap: .5rem; margin-bottom: .5rem; }
    .rj__log-ref  { font-size: .9375rem; font-weight: 700; color: var(--color-accent-gold); font-family: var(--font-ui); flex: 1; }
    .rj__log-date { font-size: .75rem; color: var(--color-ink-muted); font-family: var(--font-ui); flex-shrink: 0; letter-spacing: .01em; }
    .rj__log-del  { background: none; border: none; cursor: pointer; color: var(--color-ink-muted); font-size: 1.25rem; padding: 0 .25rem; line-height: 1; border-radius: .25rem; transition: color 150ms; opacity: .6; flex-shrink: 0; }
    .rj__log-del:hover { color: var(--color-accent-burgundy); opacity: 1; }
    .rj__log-note { width: 100%; box-sizing: border-box; background: var(--color-surface-base); color: var(--color-ink-primary); border: 1px solid var(--color-border-subtle); border-radius: .25rem; padding: .375rem .5rem; font-size: .8125rem; font-family: var(--font-ui); resize: vertical; outline: none; transition: border-color 150ms; min-height: 2.5rem; }
    .rj__log-note::placeholder { color: var(--color-ink-muted); }
    .rj__log-note:focus { border-color: var(--color-accent-gold); background: var(--color-surface-modal); }

    /* Mark as read button state */
    .reading-pane__mark-read-btn svg { transition: stroke 150ms; stroke: var(--color-ink-secondary); }
    .reading-pane__mark-read-btn--done svg { stroke: var(--color-accent-gold); filter: drop-shadow(0 0 2px rgba(212, 175, 55, 0.4)); }

    .rj__empty { color: var(--color-ink-muted); font-style: italic; text-align: center; margin: 2.5rem 1rem; line-height: 1.7; }

    @media (prefers-reduced-motion: reduce) {
      .rj__tab, .rj__year-btn, .rj__ch, .rj__progress-fill, .rj__month, .rj__log-entry, .rj__log-note, .rj__log-del, .reading-pane__mark-read-btn svg { transition-duration: 0ms !important; }
      .rj__ch:hover, .rj__month:hover { transform: none; }
    }
  `;
  document.head.appendChild(rjStyle);

  // ── Settings Cloud Sync CSS ────────────────────────────────
  const syncStyle = document.createElement('style');
  syncStyle.id = 'cloud-sync-css';
  syncStyle.textContent = `
    .settings-sync-block {
      background: var(--color-surface-elevated); border: 1px solid var(--color-border-subtle);
      border-radius: .5rem; padding: .875rem 1rem; margin-bottom: .75rem;
    }
    .settings-sync-block__header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: .625rem;
    }
    .settings-sync-block__name { font-size: .9375rem; font-weight: 600; color: var(--color-ink-primary); font-family: var(--font-ui); }
    .settings-sync-block__last { font-size: .75rem; color: var(--color-accent-sage); font-family: var(--font-ui); }
    .settings-field--actions-row { flex-direction: row; gap: .5rem; flex-wrap: wrap; }
    .settings-btn--sm { padding: .35rem .75rem; font-size: .8125rem; }
    .settings-btn--danger { color: var(--color-accent-burgundy); border-color: var(--color-accent-burgundy) !important; }
    .settings-btn--danger:hover { background: color-mix(in srgb, var(--color-accent-burgundy) 12%, transparent); }
    .settings-label-btn { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
    .settings-hint {
      margin: .5rem 0 0; font-size: .75rem; color: var(--color-ink-muted);
      font-family: var(--font-ui); line-height: 1.5;
    }
    .settings-hint code {
      background: var(--color-surface-raised); padding: .1rem .3rem;
      border-radius: .2rem; font-family: 'Fira Code', monospace; font-size: .7rem;
      color: var(--color-accent-gold);
    }
  `;
  document.head.appendChild(syncStyle);
}

bootstrap().catch(err => console.error('[berean] bootstrap failed:', err));

// ── Service Worker registration ────────────────────────────
// Only register in production (vite-plugin-pwa sets devOptions.enabled:false)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('workbox-window').then(({ Workbox }) => {
    const wb = new Workbox('/service-worker.js');

    // When a new SW is waiting, prompt the user to refresh
    wb.addEventListener('waiting', () => {
      if (confirm('A new version of Berean is available. Reload to update?')) {
        wb.addEventListener('controlling', () => window.location.reload());
        wb.messageSkipWaiting();
      }
    });

    wb.register().catch(err => console.warn('[SW] registration failed:', err));
  });
}
