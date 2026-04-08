/* ============================================================
   preaching-calendar.js — Monthly preaching calendar (Stage 5)
   Assigns sermons to Sundays; exports .ics for calendar apps.
   ============================================================ */
import { getDB }      from '../../idb/schema.js';
import { listSermons } from '../../idb/sermons.js';

// ── Module state ──────────────────────────────────────────
let _container = null;
let _year      = 0;
let _month     = 0;   // 0-indexed

// ── Public API ────────────────────────────────────────────
export function initPreachingCalendar(containerEl) {
  _container = containerEl;
  const now  = new Date();
  _year  = now.getFullYear();
  _month = now.getMonth();
  _render();
}

// ── IDB ───────────────────────────────────────────────────
async function _getCalendar() {
  try {
    const db  = await getDB();
    const all = await db.getAll('PreachingCalendar');
    return Object.fromEntries(all.map(r => [r.date, r]));
  } catch { return {}; }
}

async function _setSlot(date, sermonId, sermonTitle) {
  try {
    const db = await getDB();
    if (!sermonId) {
      await db.delete('PreachingCalendar', date);
    } else {
      await db.put('PreachingCalendar', { date, sermonId, sermonTitle, notes: '' });
    }
  } catch (e) { console.warn('[calendar] save failed:', e); }
}

// ── Render ────────────────────────────────────────────────
async function _render() {
  if (!_container) return;

  const [calendar, sermons] = await Promise.all([_getCalendar(), listSermons()]);

  const monthName = new Date(_year, _month, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });

  const days  = _buildMonth(_year, _month);
  const sundays = days.filter(d => d && new Date(d).getDay() === 0);

  _container.innerHTML = `
    <div class="pc-wrap">
      <div class="pc-header">
        <button class="pc-nav-btn" id="pc-prev" aria-label="Previous month">&#8592;</button>
        <h3 class="pc-month">${monthName}</h3>
        <button class="pc-nav-btn" id="pc-next" aria-label="Next month">&#8594;</button>
        <button class="pc-export-btn" id="pc-export" title="Export to calendar app (.ics)">
          Export .ics
        </button>
      </div>

      <div class="pc-grid" role="grid" aria-label="Preaching calendar">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
          `<div class="pc-day-label">${d}</div>`).join('')}
        ${days.map(d => {
          if (!d) return `<div class="pc-cell pc-cell--empty"></div>`;
          const isSunday  = new Date(d).getDay() === 0;
          const slot      = calendar[d];
          const isToday   = d === _todayStr();
          return `
            <div class="pc-cell${isSunday ? ' pc-cell--sunday' : ''}${isToday ? ' pc-cell--today' : ''}"
                 data-date="${d}">
              <span class="pc-date-num">${parseInt(d.split('-')[2])}</span>
              ${isSunday ? `
                <div class="pc-slot${slot ? ' pc-slot--filled' : ''}" data-date="${d}">
                  ${slot
                    ? `<span class="pc-slot__title">${_esc(slot.sermonTitle)}</span>
                       <button class="pc-slot__clear" data-date="${d}" aria-label="Remove">✕</button>`
                    : `<button class="pc-slot__assign" data-date="${d}">+ Assign sermon</button>`}
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>

      ${sundays.length > 0 ? `
        <div class="pc-summary">
          <h4 class="pc-summary__title">Sundays this month</h4>
          ${sundays.map(d => {
            const slot = calendar[d];
            const label = new Date(d).toLocaleDateString('default', { month: 'short', day: 'numeric' });
            return `<div class="pc-summary-row">
              <span class="pc-summary-row__date">${label}</span>
              <span class="pc-summary-row__sermon${slot ? '' : ' pc-summary-row__sermon--empty'}">
                ${slot ? _esc(slot.sermonTitle) : 'Unassigned'}
              </span>
            </div>`;
          }).join('')}
        </div>` : ''}
    </div>

    <!-- Sermon picker dialog (hidden, shown on demand) -->
    <dialog class="pc-picker" id="pc-picker">
      <h4 class="pc-picker__title">Assign Sermon</h4>
      <p class="pc-picker__date" id="pc-picker-date"></p>
      <div class="pc-picker__list" id="pc-picker-list"></div>
      <div class="pc-picker__footer">
        <button class="pc-picker__cancel" id="pc-picker-cancel">Cancel</button>
      </div>
    </dialog>`;

  // ── Wire nav ──────────────────────────────────────────
  _container.querySelector('#pc-prev').addEventListener('click', () => {
    _month--;
    if (_month < 0) { _month = 11; _year--; }
    _render();
  });
  _container.querySelector('#pc-next').addEventListener('click', () => {
    _month++;
    if (_month > 11) { _month = 0; _year++; }
    _render();
  });

  // ── Assign sermon ────────────────────────────────────
  _container.querySelectorAll('.pc-slot__assign').forEach(btn => {
    btn.addEventListener('click', () => _openPicker(btn.dataset.date, sermons, calendar));
  });

  // ── Clear slot ───────────────────────────────────────
  _container.querySelectorAll('.pc-slot__clear').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await _setSlot(btn.dataset.date, null, null);
      _render();
    });
  });

  // ── Picker dialog ────────────────────────────────────
  const picker   = _container.querySelector('#pc-picker');
  const cancelBtn = _container.querySelector('#pc-picker-cancel');
  cancelBtn?.addEventListener('click', () => picker.close());
  picker?.addEventListener('click', e => { if (e.target === picker) picker.close(); });

  // ── Export .ics ──────────────────────────────────────
  _container.querySelector('#pc-export').addEventListener('click', () =>
    _exportIcs(calendar));
}

function _openPicker(date, sermons, calendar) {
  const picker    = _container.querySelector('#pc-picker');
  const dateEl    = _container.querySelector('#pc-picker-date');
  const listEl    = _container.querySelector('#pc-picker-list');

  const label = new Date(date).toLocaleDateString('default',
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  dateEl.textContent = label;

  if (sermons.length === 0) {
    listEl.innerHTML = `<p class="pc-picker__empty">No sermons yet. Create one in the Sermon Builder.</p>`;
  } else {
    listEl.innerHTML = sermons.map(s => {
      const active = calendar[date]?.sermonId === s.id;
      return `
        <button class="pc-picker__item${active ? ' pc-picker__item--active' : ''}"
                data-date="${date}" data-sermon-id="${s.id}"
                data-sermon-title="${_esc(s.title)}">
          <span class="pc-picker__item-title">${_esc(s.title)}</span>
          ${s.osisAnchor ? `<span class="pc-picker__item-ref">${_esc(s.osisAnchor)}</span>` : ''}
        </button>`;
    }).join('');

    listEl.querySelectorAll('.pc-picker__item').forEach(btn => {
      btn.addEventListener('click', async () => {
        await _setSlot(btn.dataset.date, btn.dataset.sermonId, btn.dataset.sermonTitle);
        picker.close();
        _render();
      });
    });
  }

  picker.showModal();
}

// ── .ics export ───────────────────────────────────────────
function _exportIcs(calendar) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Berean//Berean Bible Study//EN',
    'CALSCALE:GREGORIAN',
  ];

  Object.values(calendar).forEach(slot => {
    const d = slot.date.replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${d}`,
      `SUMMARY:${_icsEsc(slot.sermonTitle)}`,
      `DESCRIPTION:Preaching: ${_icsEsc(slot.sermonTitle)}`,
      `UID:berean-${slot.date}@berean`,
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'preaching-calendar.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Helpers ───────────────────────────────────────────────
function _buildMonth(year, month) {
  const first    = new Date(year, month, 1).getDay();   // 0=Sun
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells    = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  return cells;
}

function _todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function _esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _icsEsc(s) {
  return String(s ?? '').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
}
