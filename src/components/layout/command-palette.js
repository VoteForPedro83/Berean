/* ============================================================
   command-palette.js — Ctrl+K command palette
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';
import { navigateTo } from '../../router.js';
import { BOOKS } from '../../data/books.js';
import { searchBible } from '../../db/bible.js';
import { MOCK_COVERAGE } from '../../db/mock-data.js';

// Quick commands always shown
const COMMANDS = [
  { type: 'command', label: 'Toggle dark / light theme',  action: () => bus.emit(EVENTS.THEME_CHANGE, 'toggle') },
  { type: 'command', label: 'Open Settings',              action: () => bus.emit(EVENTS.MODAL_OPEN, 'settings') },
  { type: 'command', label: 'Toggle interlinear',         action: () => document.dispatchEvent(new CustomEvent('berean:toggle-interlinear')) },
];

let dialog, input, results, _open = false;

export function initCommandPalette() {
  dialog  = document.getElementById('command-palette');
  input   = document.getElementById('command-palette-input');
  results = document.getElementById('command-palette-results');
  if (!dialog) return;

  input.addEventListener('input', () => renderResults(input.value.trim()));

  // Close on backdrop click
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

  // Keyboard nav inside palette
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { moveFocus(1); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { moveFocus(-1); e.preventDefault(); }
    if (e.key === 'Enter') {
      const active = results.querySelector('[data-focused="true"]');
      active?.click();
    }
  });

  bus.on(EVENTS.MODAL_OPEN, name => { if (name === 'command') open(); });
}

export function openCommandPalette() { open(); }

function open() {
  dialog.showModal();
  input.value = '';
  renderResults('');
  input.focus();
  _open = true;
}

function close() {
  dialog.close();
  _open = false;
}

function moveFocus(dir) {
  const items = [...results.querySelectorAll('[data-result]')];
  const cur   = items.findIndex(el => el.dataset.focused === 'true');
  items.forEach(el => el.removeAttribute('data-focused'));
  const next = items[(cur + dir + items.length) % items.length];
  if (next) { next.dataset.focused = 'true'; next.scrollIntoView({ block: 'nearest' }); }
}

function renderResults(query) {
  const q = query.toLowerCase();

  // Passage reference shortcut: "john 3:16", "jhn 3 16", "gen 1"
  const passageMatch = parsePassageQuery(query);

  // Filter books
  const bookMatches = BOOKS
    .filter(b => b.name.toLowerCase().includes(q) || b.osis.toLowerCase().includes(q) || b.abbr.toLowerCase().includes(q))
    .slice(0, 6)
    .map(b => ({ type: 'book', label: b.name, sub: `${b.testament} · ${b.chapters} chapters`, book: b.osis }));

  // Filter commands
  const cmdMatches = !q ? COMMANDS : COMMANDS.filter(c => c.label.toLowerCase().includes(q));

  // Mock coverage quick links
  const coverageLinks = MOCK_COVERAGE
    .filter(({ book, chapter }) => {
      const b = BOOKS.find(x => x.osis === book);
      return !q || b?.name.toLowerCase().includes(q);
    })
    .map(({ book, chapter }) => {
      const b = BOOKS.find(x => x.osis === book);
      return { type: 'passage', label: `${b?.name} ${chapter}`, sub: 'Mock data available', book, chapter };
    });

  const all = [
    ...(passageMatch ? [passageMatch] : []),
    ...bookMatches,
    ...(!q ? coverageLinks : []),
    ...cmdMatches,
  ].slice(0, 10);

  if (all.length === 0) {
    results.innerHTML = `<p class="cp-hint">No results for "${query}"</p>`;
    return;
  }

  results.innerHTML = all.map((item, i) => `
    <button class="cp-result" data-result="${i}" data-type="${item.type}"
            ${i === 0 ? 'data-focused="true"' : ''}>
      <span class="cp-result__label">${item.label}</span>
      ${item.sub ? `<span class="cp-result__sub">${item.sub}</span>` : ''}
    </button>`).join('');

  results.querySelectorAll('.cp-result').forEach((btn, i) => {
    btn.addEventListener('click', () => { selectItem(all[i]); close(); });
  });
}

function selectItem(item) {
  if (item.type === 'command') { item.action(); return; }
  if (item.type === 'book')    { navigateTo({ book: item.book, chapter: 1, verse: 1 }); return; }
  if (item.type === 'passage') { navigateTo({ book: item.book, chapter: item.chapter, verse: 1 }); return; }
  if (item.type === 'verse')   { navigateTo({ book: item.book, chapter: item.chapter, verse: item.verse }); return; }
}

// Very simple passage reference parser
function parsePassageQuery(q) {
  const m = q.trim().match(/^([1-3]?\s?[a-zA-Z]+)\s+(\d+)(?:[:\s](\d+))?/);
  if (!m) return null;
  const [, bookStr, chStr, vStr] = m;
  const book = BOOKS.find(b =>
    b.name.toLowerCase().startsWith(bookStr.toLowerCase()) ||
    b.osis.toLowerCase() === bookStr.toLowerCase().replace(/\s/g, '') ||
    b.abbr.toLowerCase() === bookStr.toLowerCase()
  );
  if (!book) return null;
  return {
    type: 'passage',
    label: `${book.name} ${chStr}${vStr ? ':' + vStr : ''}`,
    sub: 'Go to passage',
    book: book.osis,
    chapter: parseInt(chStr),
    verse: parseInt(vStr || '1'),
  };
}
