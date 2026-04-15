/* ============================================================
   entity-graph.js — Biblical Entity Graph (Cytoscape)

   Right-panel "Graph" tab. Shows people and places from the
   current chapter as a network graph:

   Node types:
   - person  (gold)  — biblical figures
   - place   (sage)  — locations

   Edge types:
   - person–person  — appear in the same verse
   - person–place   — person appears at this place

   Edge weight = number of shared verses (thicker = more).
   ============================================================ */

import { bus, EVENTS }                from '../../state/eventbus.js';
import { state }                      from '../../state/study-mode.js';
import { getPeopleForChapter,
         getPlacesForChapter,
         getPeopleCoOccurrences,
         getPersonPlaceLinks }        from '../../db/narrative.js';
import { getNtOtQuotesForChapter }    from '../../db/crossrefs.js';
import { BOOK_MAP }                   from '../../data/books.js';
import { navigateTo }                 from '../../router.js';

let _container = null;
let _cy        = null;
let _loading   = false;
let _lastKey   = '';

// Node position cache — preserves spatial memory across chapter navigation.
// Key: node id (e.g. "p-peter_1"), Value: {x, y}
const _posCache = new Map();

// ── Init ──────────────────────────────────────────────────

export function initEntityGraph(containerEl) {
  _container = containerEl;
  _renderShell();
  _loadForPassage(state.book, state.chapter);

  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter }) => {
    _loadForPassage(book, chapter);
  });
}

function _renderShell() {
  _container.innerHTML = `
    <div class="eg">
      <div class="eg__header">
        <span class="eg__title" id="eg-title">Entity Graph</span>
        <span class="eg__status" id="eg-status"></span>
        <button class="eg__clear" id="eg-clear" hidden aria-label="Clear selection">✕ Clear</button>
        <div class="eg__legend">
          <span class="eg__legend-dot eg__legend-dot--person"></span><span class="eg__legend-label">People</span>
          <span class="eg__legend-dot eg__legend-dot--place"></span><span class="eg__legend-label">Places</span>
        </div>
      </div>
      <div class="eg__canvas" id="eg-canvas"></div>
      <div class="eg__quotes" id="eg-quotes" hidden></div>
    </div>`;
}

// ── Data loading ──────────────────────────────────────────

async function _loadForPassage(book, chapter) {
  const key = `${book}:${chapter}`;
  if (key === _lastKey || _loading) return;
  _lastKey = key;
  _loading = true;

  const bookMeta = BOOK_MAP.get(book);
  const bookName = bookMeta?.name ?? book;
  _setStatus(`Loading ${bookName} ${chapter}…`);

  try {
    const [people, places, personEdges, placeEdges, quotes] = await Promise.all([
      getPeopleForChapter(book, chapter),
      getPlacesForChapter(book, chapter),
      getPeopleCoOccurrences(book, chapter),
      getPersonPlaceLinks(book, chapter),
      getNtOtQuotesForChapter(book, chapter).catch(() => []),
    ]);

    const title = document.getElementById('eg-title');
    if (title) title.textContent = `${bookName} ${chapter} — Graph`;

    if (!people.length && !places.length) {
      _setStatus('No narrative data for this chapter');
      if (_cy) _cy.elements().remove();
    } else {
      _setStatus('');
      _renderGraph(people, places, personEdges, placeEdges);
    }

    _renderQuotes(quotes, bookName, chapter);
  } catch (err) {
    console.error('[entity-graph]', err);
    _setStatus('Failed to load graph data');
  } finally {
    _loading = false;
  }
}

// ── Quotation list ────────────────────────────────────────

function _osisLabel(osis) {
  const [book, ch, v] = (osis || '').split('.');
  const name = BOOK_MAP.get(book)?.name ?? book;
  return v ? `${name} ${ch}:${v}` : `${name} ${ch}`;
}

function _renderQuotes(quotes, bookName, chapter) {
  const el = document.getElementById('eg-quotes');
  if (!el) return;

  if (!quotes || !quotes.length) {
    el.hidden = true;
    return;
  }

  const relLabel = { quotation: 'quotes', allusion: 'alludes to', echo: 'echoes' };

  const rows = quotes.map(q => {
    const ntLabel = _osisLabel(q.nt_osis);
    const otLabel = _osisLabel(q.ot_osis);
    const rel     = relLabel[q.relationship] || q.relationship || 'references';
    return `
      <div class="eg-quote">
        <button class="eg-quote__link" data-osis="${q.nt_osis}" title="Go to ${ntLabel}">
          ${ntLabel}
        </button>
        <span class="eg-quote__rel">${rel}</span>
        <button class="eg-quote__link" data-osis="${q.ot_osis}" title="Go to ${otLabel}">
          ${otLabel}
        </button>
      </div>`;
  }).join('');

  el.hidden = false;
  el.innerHTML = `
    <div class="eg-quotes__header">
      Scripture links — ${bookName} ${chapter}
    </div>
    <div class="eg-quotes__list">${rows}</div>`;

  // Wire click → navigate
  el.querySelectorAll('.eg-quote__link').forEach(btn => {
    btn.addEventListener('click', () => {
      const [book, ch, v] = btn.dataset.osis.split('.');
      navigateTo({ book, chapter: parseInt(ch, 10), verse: v ? parseInt(v, 10) : 1 });
    });
  });
}

// ── Graph rendering ───────────────────────────────────────

async function _renderGraph(people, places, personEdges, placeEdges) {
  const canvas = document.getElementById('eg-canvas');
  if (!canvas) return;

  // Build cytoscape element list
  const elements = [];

  // People nodes
  for (const p of people) {
    elements.push({
      data: {
        id:    `p-${p.id}`,
        label: p.name,
        type:  'person',
        year:  p.birth_year,
      },
    });
  }

  // Place nodes
  for (const pl of places) {
    elements.push({
      data: {
        id:    `pl-${pl.id}`,
        label: pl.name,
        type:  'place',
        featureType: pl.feature_type,
      },
    });
  }

  // Person–person edges
  for (const e of personEdges) {
    elements.push({
      data: {
        id:     `pp-${e.person_a}-${e.person_b}`,
        source: `p-${e.person_a}`,
        target: `p-${e.person_b}`,
        weight: e.shared_verses,
        type:   'person-person',
      },
    });
  }

  // Person–place edges
  for (const e of placeEdges) {
    // Only include if both person and place are in this chapter's node set
    const personExists = people.some(p => p.id === e.person_id);
    const placeExists  = places.some(pl => pl.id === e.place_id);
    if (!personExists || !placeExists) continue;
    elements.push({
      data: {
        id:     `ppl-${e.person_id}-${e.place_id}`,
        source: `p-${e.person_id}`,
        target: `pl-${e.place_id}`,
        weight: e.shared_verses,
        type:   'person-place',
      },
    });
  }

  // Lazy-load cytoscape + fcose extension
  if (!_cy) {
    try {
      const [cytoscape, fcose] = await Promise.all([
        import('cytoscape').then(m => m.default),
        import('cytoscape-fcose').then(m => m.default),
      ]);
      cytoscape.use(fcose);

      _cy = window.__bereanCy = cytoscape({
        container: canvas,
        elements,
        style:     _buildStyle(),
        layout:    _buildLayout(elements),
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        autoungrabify: false,
      });

      // Save positions after initial layout settles
      _cy.one('layoutstop', () => _savePositions());

      // Wire the Clear button
      const clearBtn = document.getElementById('eg-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => _clearSelection());
      }

      // Click node → highlight its connections, show info, and broadcast entity selection
      _cy.on('tap', 'node', e => {
        const node  = e.target;
        const label = node.data('label');
        const type  = node.data('type');
        const id    = node.data('id');
        const connected = node.neighborhood('node');
        const edgeCount = node.connectedEdges().length;

        // Dim everything, then highlight this node + its neighbours
        _cy.elements().addClass('eg-dim');
        node.removeClass('eg-dim').addClass('eg-highlight');
        connected.removeClass('eg-dim').addClass('eg-highlight');
        node.connectedEdges().removeClass('eg-dim').addClass('eg-highlight');

        const who  = type === 'place' ? 'Place' : 'Person';
        const desc = edgeCount > 0
          ? `${who}: ${label} — connected to ${connected.length} other${connected.length !== 1 ? 's' : ''}`
          : `${who}: ${label} — no connections in this chapter`;
        _setStatus(desc);

        // Broadcast so reading-pane dims non-matching verses.
        // Strip graph node prefix (p- / pl-) to get the raw DB id.
        const dbId = id.replace(/^p[l]?-/, '');
        bus.emit(EVENTS.ENTITY_SELECTED, { type, id: dbId, name: label, source: 'graph' });

        // Show the clear button
        const cb = document.getElementById('eg-clear');
        if (cb) cb.hidden = false;
      });

      // Click background → clear highlight
      _cy.on('tap', e => {
        if (e.target === _cy) _clearSelection();
      });

      // Hover tooltip
      _cy.on('mouseover', 'node', e => {
        const node = e.target;
        canvas.title = node.data('label');
      });
      _cy.on('mouseout', 'node', () => { canvas.title = ''; });

    } catch (err) {
      console.error('[entity-graph] cytoscape failed:', err);
      _setStatus('Graph library failed to load');
      return;
    }
  } else {
    // Save current positions before teardown
    _savePositions();
    _cy.elements().remove();
    _cy.add(elements);
    _cy.style(_buildStyle());
    const layout = _cy.layout(_buildLayout(elements));
    layout.one('layoutstop', () => _savePositions());
    layout.run();
  }

  // Re-apply theme colours
  _applyTheme();
  bus.on(EVENTS.THEME_CHANGE, () => _applyTheme());
}

// ── Layout helpers ────────────────────────────────────────

/**
 * Build an fcose layout config.
 * Nodes that exist in the position cache are given fixed constraints
 * so they stay put; new nodes are placed freely around them.
 */
function _buildLayout(elements) {
  const fixedConstraints = [];
  for (const el of elements) {
    if (el.data?.id && _posCache.has(el.data.id)) {
      fixedConstraints.push({ nodeId: el.data.id, position: _posCache.get(el.data.id) });
    }
  }

  return {
    name:              'fcose',
    animate:           true,
    animationDuration: 250,
    animationEasing:   'ease-out',
    quality:           'default',
    randomize:         fixedConstraints.length === 0, // only randomize on first load
    padding:           24,
    idealEdgeLength:   60,
    edgeElasticity:    0.45,
    nodeRepulsion:     4500,
    numIter:           2500,
    fixedNodeConstraint: fixedConstraints.length ? fixedConstraints : undefined,
  };
}

/** Snapshot all current node positions into the cache. */
function _savePositions() {
  if (!_cy) return;
  _cy.nodes().forEach(n => {
    _posCache.set(n.id(), { ...n.position() });
  });
}

function _buildStyle() {
  return [
    {
      selector: 'node[type="person"]',
      style: {
        'background-color':   '#D4AF37',
        'label':              'data(label)',
        'color':              '#E8E6E1',
        'font-size':          '9px',
        'font-family':        'Inter, system-ui, sans-serif',
        'text-valign':        'bottom',
        'text-halign':        'center',
        'text-margin-y':      3,
        'width':              22,
        'height':             22,
        'border-width':       0,
        'text-max-width':     '60px',
        'text-wrap':          'ellipsis',
      },
    },
    {
      selector: 'node[type="place"]',
      style: {
        'background-color':   '#768A78',
        'shape':              'diamond',
        'label':              'data(label)',
        'color':              '#E8E6E1',
        'font-size':          '9px',
        'font-family':        'Inter, system-ui, sans-serif',
        'text-valign':        'bottom',
        'text-halign':        'center',
        'text-margin-y':      3,
        'width':              18,
        'height':             18,
        'border-width':       0,
        'text-max-width':     '60px',
        'text-wrap':          'ellipsis',
      },
    },
    {
      selector: 'edge[type="person-person"]',
      style: {
        'width':              'mapData(weight, 1, 5, 1, 4)',
        'line-color':         '#D4AF37',
        'opacity':            0.5,
        'curve-style':        'bezier',
      },
    },
    {
      selector: 'edge[type="person-place"]',
      style: {
        'width':              1.5,
        'line-color':         '#768A78',
        'line-style':         'dashed',
        'opacity':            0.4,
        'curve-style':        'bezier',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 2,
        'border-color': '#D4AF37',
      },
    },
    {
      selector: '.eg-dim',
      style: { 'opacity': 0.15 },
    },
    {
      selector: '.eg-highlight',
      style: { 'opacity': 1 },
    },
  ];
}

function _applyTheme() {
  // Light mode: darken label colour
  const isLight = document.documentElement.classList.contains('light-mode');
  if (_cy) {
    _cy.style()
      .selector('node[type="person"]').style('color', isLight ? '#1A1A1A' : '#E8E6E1')
      .selector('node[type="place"]').style('color',  isLight ? '#1A1A1A' : '#E8E6E1')
      .update();
  }
}

// ── Helpers ───────────────────────────────────────────────

function _clearSelection() {
  if (_cy) _cy.elements().removeClass('eg-dim eg-highlight');
  _setStatus('');
  const cb = document.getElementById('eg-clear');
  if (cb) cb.hidden = true;
  bus.emit(EVENTS.ENTITY_CLEARED);
}

function _setStatus(msg) {
  const el = document.getElementById('eg-status');
  if (el) el.textContent = msg;
}
