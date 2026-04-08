/* ============================================================
   maps-panel.js — Biblical geography map (Stage 5)
   Lives in the right panel "Map" tab.
   Highlights places mentioned in the current chapter.
   ============================================================ */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { bus, EVENTS } from '../../state/eventbus.js';
import { BIBLICAL_PLACES, BOOK_MAP_CENTRES } from '../../data/biblical-places.js';

let _map             = null;
let _markers         = null;   // L.LayerGroup
let _container       = null;
let _currentBook     = null;
let _currentChapter  = null;
// Map<placeName, [{verse: number, text: string}]> — verses mentioning each place
let _passagePlaces   = new Map();
let _activeTypes     = new Set(['city', 'mountain', 'region', 'sea', 'river', 'ruin']);

// ── Colours by type ───────────────────────────────────────
const TYPE_COLOURS = {
  city:     '#D4AF37',
  mountain: '#A39E93',
  region:   '#768A78',
  sea:      '#4A7EA5',
  river:    '#4A7EA5',
  ruin:     '#8C1127',
};

function _makeIcon(type, isPassage) {
  const colour = TYPE_COLOURS[type] || '#D4AF37';
  const opacity = isPassage ? '0.95' : '0.35';
  const stroke  = isPassage ? '#D4AF37' : '#888';
  const sw      = isPassage ? '2' : '1';
  const ring    = isPassage
    ? `<circle cx="11" cy="11" r="9.5" fill="none" stroke="#D4AF37" stroke-width="1.5" opacity="0.6"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    ${ring}
    <circle cx="11" cy="11" r="7" fill="${colour}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${sw}"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [22, 22],
    iconAnchor: [11, 11],
    popupAnchor:[0, -13],
  });
}

// ── Init ──────────────────────────────────────────────────
export function initMapsPanel(containerEl) {
  _container = containerEl;
  _renderShell();
  _buildMap();
  _wireEvents();
  window.__bereanMapInvalidate = () => _map?.invalidateSize();
  window.__bereanMap = _map;

  // Apply current chapter if the map was opened after CHAPTER_LOADED already fired
  const last = window.__bereanLastChapter;
  if (last) {
    _currentBook    = last.book;
    _currentChapter = last.chapter;
    _detectPassagePlaces(last.verses);
    _renderMarkers();
    const centre = BOOK_MAP_CENTRES[last.book];
    if (_map && centre) _map.setView([centre.lat, centre.lng], centre.zoom);
  }
}

function _renderShell() {
  _container.innerHTML = `
    <div id="map-places-bar" class="map-places-bar">
      <span class="map-places-none">Navigate to a chapter to see relevant places</span>
    </div>
    <div id="maps-filters" class="map-filters-bar">
      <label class="map-filter-toggle"><input type="checkbox" data-type="city"     checked> Cities</label>
      <label class="map-filter-toggle"><input type="checkbox" data-type="mountain" checked> Mountains</label>
      <label class="map-filter-toggle"><input type="checkbox" data-type="region"   checked> Regions</label>
      <label class="map-filter-toggle"><input type="checkbox" data-type="sea"      checked> Seas & Rivers</label>
      <label class="map-filter-toggle"><input type="checkbox" data-type="ruin"     checked> Ruins</label>
    </div>
    <div id="berean-map" class="berean-map" aria-label="Biblical geography map"></div>`;
}

function _buildMap() {
  _map = L.map('berean-map', {
    center: [31.8, 35.2],
    zoom: 7,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 18,
  }).addTo(_map);

  _markers = L.layerGroup().addTo(_map);
  _renderMarkers();

  document.getElementById('maps-filters')?.addEventListener('change', () => {
    _activeTypes = new Set();
    document.querySelectorAll('#maps-filters input[type=checkbox]').forEach(cb => {
      if (cb.checked) {
        _activeTypes.add(cb.dataset.type);
        if (cb.dataset.type === 'sea') _activeTypes.add('river');
      }
    });
    _renderMarkers();
  });
}

function _renderMarkers() {
  _markers.clearLayers();

  // Sort so passage places render on top (last = topmost in Leaflet)
  const sorted = [...BIBLICAL_PLACES].sort((a, b) => {
    const aP = _passagePlaces.has(a.name) ? 1 : 0;
    const bP = _passagePlaces.has(b.name) ? 1 : 0;
    return aP - bP;
  });

  sorted.forEach(place => {
    const filterType = place.type === 'river' ? 'sea' : place.type;
    if (!_activeTypes.has(filterType) && !_activeTypes.has(place.type)) return;

    const refs = _passagePlaces.get(place.name);
    const isPassage = !!refs;
    const marker = L.marker([place.lat, place.lng], {
      icon: _makeIcon(place.type, isPassage),
      zIndexOffset: isPassage ? 1000 : 0,
    });

    let refsHtml = '';
    if (refs?.length) {
      const items = refs.map(r => {
        const snippet = _snippet(r.text, place.name);
        return `<div class="map-popup__ref"><span class="map-popup__vnum">v.${r.verse}</span> <span class="map-popup__vtext">${snippet}</span></div>`;
      }).join('');
      refsHtml = `<div class="map-popup__refs">${items}</div>`;
    }

    marker.bindPopup(`
      <div class="map-popup">
        <strong class="map-popup__name">${_esc(place.name)}</strong>
        <p class="map-popup__desc">${_esc(place.desc)}</p>
        ${refsHtml}
      </div>`, { maxWidth: 260 });
    _markers.addLayer(marker);
  });
}

// ── Place detection in chapter text ──────────────────────
function _searchTerms(place) {
  // "Joppa (Jaffa)" → ["Joppa", "Jaffa"]
  const base = place.name.replace(/\s*\([^)]+\)\s*/g, '').trim();
  const terms = base.length >= 3 ? [base] : [];
  const paren = place.name.match(/\(([^)]+)\)/);
  if (paren && paren[1].length >= 3) terms.push(paren[1]);
  return terms;
}

function _detectPassagePlaces(verses) {
  _passagePlaces = new Map();

  BIBLICAL_PLACES.forEach(place => {
    const terms = _searchTerms(place);
    const mentioningVerses = verses.filter(v =>
      terms.some(term => (v.text || '').includes(term))
    );
    if (mentioningVerses.length) {
      _passagePlaces.set(place.name, mentioningVerses.map(v => ({ verse: v.verse, text: v.text || '' })));
    }
  });

  const bar = document.getElementById('map-places-bar');
  if (!bar) return;

  if (_passagePlaces.size === 0) {
    bar.innerHTML = `<span class="map-places-none">No mapped places found in this chapter</span>`;
  } else {
    const chips = [..._passagePlaces.keys()]
      .map(name => `<span class="map-place-chip" title="Click the marker on the map to see verse references">${_esc(name)}</span>`)
      .join('');
    bar.innerHTML = `<span style="color:var(--color-ink-muted);font-size:.7rem;flex-shrink:0">This chapter:</span>${chips}`;
  }
}

// ── Events ────────────────────────────────────────────────
function _wireEvents() {
  bus.on(EVENTS.CHAPTER_LOADED, ({ book, chapter, verses }) => {
    _currentBook    = book;
    _currentChapter = chapter;
    _detectPassagePlaces(verses);
    _renderMarkers();

    // Fly to book region
    const centre = BOOK_MAP_CENTRES[book];
    if (_map && centre) {
      _map.flyTo([centre.lat, centre.lng], centre.zoom, { duration: 1.2 });
    }
  });
}

// ── Helpers ───────────────────────────────────────────────
function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Return ~60 chars of verse text around the place name, with the name bolded
function _snippet(text, placeName) {
  const terms = _searchTerms({ name: placeName });
  let matchTerm = terms[0];
  let idx = -1;
  for (const t of terms) {
    idx = text.indexOf(t);
    if (idx !== -1) { matchTerm = t; break; }
  }
  if (idx === -1) return _esc(text.slice(0, 80)) + '…';
  const start = Math.max(0, idx - 25);
  const end   = Math.min(text.length, idx + matchTerm.length + 35);
  const before = _esc((start > 0 ? '…' : '') + text.slice(start, idx));
  const match  = `<strong>${_esc(text.slice(idx, idx + matchTerm.length))}</strong>`;
  const after  = _esc(text.slice(idx + matchTerm.length, end) + (end < text.length ? '…' : ''));
  return before + match + after;
}
