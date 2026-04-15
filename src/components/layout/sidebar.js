/* ============================================================
   sidebar.js — Left icon sidebar (desktop) / drawer (mobile)
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';

const NAV_ITEMS = [
  { id: 'study',  label: 'Study Mode',      icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
  { id: 'sermon', label: 'Sermon Builder',   icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' },
  { id: 'search', label: 'Search',           icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' },
  { id: 'maps',   label: 'Maps & Timeline',  icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>' },
  { id: 'study-session', label: 'Study Sessions', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' },
  { id: 'topics',  label: 'Topic Studies',   icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' },
  { id: 'journal', label: 'Reading Journal', icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><path d="M8 3v6"/><path d="M7 13h4"/><path d="M7 17h8"/></svg>' },
];

let _active = 'study';

export function initSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;

  el.innerHTML = `
    <div class="sidebar__logo" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="18" height="32" rx="2" fill="var(--color-accent-gold)" opacity="0.9"/>
        <rect x="26" y="8" width="18" height="32" rx="2" fill="var(--color-accent-gold)" opacity="0.5"/>
        <line x1="22" y1="8" x2="22" y2="40" stroke="var(--color-surface-base)" stroke-width="2"/>
      </svg>
    </div>
    <nav class="sidebar__nav" aria-label="Main navigation">
      ${NAV_ITEMS.map(d => `
        <button class="sidebar__item${d.id === _active ? ' sidebar__item--active' : ''}"
                data-dest="${d.id}" aria-label="${d.label}" title="${d.label}">
          <span class="sidebar__item-icon">${d.icon}</span>
          <span class="sidebar__item-label">${d.label}</span>
        </button>`).join('')}
    </nav>
    <div class="sidebar__bottom">
      <button class="sidebar__item" data-dest="shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
        <span class="sidebar__item-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <rect x="2" y="6" width="20" height="13" rx="2"/>
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>
          </svg>
        </span>
        <span class="sidebar__item-label">Shortcuts</span>
      </button>
      <button class="sidebar__item" data-dest="settings" aria-label="Settings" title="Settings">
        <span class="sidebar__item-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </span>
        <span class="sidebar__item-label">Settings</span>
      </button>
    </div>`;

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-dest]');
    if (!btn) return;
    const dest = btn.dataset.dest;

    // Close drawer on mobile when a nav item is tapped
    _closeDrawer();

    if (dest === 'settings')  { bus.emit(EVENTS.MODAL_OPEN, 'settings');   return; }
    if (dest === 'shortcuts') { bus.emit('shortcuts:open');                return; }

    const prev = _active;
    _active = dest;
    el.querySelectorAll('.sidebar__item').forEach(b =>
      b.classList.toggle('sidebar__item--active', b.dataset.dest === dest));

    // Notify app of view change
    if (dest === 'search') {
      bus.emit('search:open');
    } else if (prev === 'search') {
      bus.emit('search:close');
    }
    bus.emit('view:change', { dest, prev });
  });

  bus.on(EVENTS.SIDEBAR_TOGGLE, () => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      _toggleDrawer();
    } else {
      el.classList.toggle('sidebar--collapsed');
    }
  });

  // When search closes via result click, reset active item to 'study'
  bus.on('search:close', () => {
    _active = 'study';
    el.querySelectorAll('.sidebar__item').forEach(b =>
      b.classList.toggle('sidebar__item--active', b.dataset.dest === 'study'));
  });
}

function _toggleDrawer() {
  const el      = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const isOpen  = el?.classList.contains('sidebar--drawer-open');
  if (isOpen) {
    _closeDrawer();
  } else {
    el?.classList.add('sidebar--drawer-open');
    backdrop?.classList.add('sidebar-backdrop--visible');
  }
}

function _closeDrawer() {
  if (!window.matchMedia('(max-width: 768px)').matches) return;
  document.getElementById('sidebar')?.classList.remove('sidebar--drawer-open');
  document.getElementById('sidebar-backdrop')?.classList.remove('sidebar-backdrop--visible');
}
