/* ============================================================
   presentation.js — Sermon Presentation Mode

   Opens a full-screen teleprompter view for the sermon.
   Two modes:
   1. Single-screen: full-screen overlay in this window
   2. Dual-screen:   opens a second window + BroadcastChannel
      to sync scroll between presenter (control) and display.

   Controls:
   - Space / ↓ / click    → scroll down
   - ↑                    → scroll up
   - +/-                  → adjust scroll speed
   - F / Escape           → exit
   - S                    → open second screen (Dual-screen mode)
   ============================================================ */

const CHANNEL_NAME = 'berean-presentation';
const STORAGE_KEY  = 'berean-pres-speed';

let _overlay    = null;   // The full-screen overlay element
let _scroller   = null;   // The scrollable content div
let _raf        = null;   // requestAnimationFrame ID
let _speed      = parseFloat(localStorage.getItem(STORAGE_KEY) || '0.8'); // px/frame
let _running    = false;
let _channel    = null;   // BroadcastChannel (presenter side)
let _secondWin  = null;   // Window reference for dual-screen

// ── Public API ────────────────────────────────────────────

/**
 * Launch presentation mode.
 * @param {string} title   — sermon title
 * @param {string} html    — rendered HTML content of the sermon
 */
export function launchPresentation(title, html) {
  if (_overlay) return;  // Already open

  _buildOverlay(title, html);
  _startScroll();
  _bindKeys();
  _openChannel();
}

// ── Overlay ───────────────────────────────────────────────

function _buildOverlay(title, html) {
  _overlay = document.createElement('div');
  _overlay.className = 'pres-overlay';
  _overlay.setAttribute('role', 'dialog');
  _overlay.setAttribute('aria-modal', 'true');
  _overlay.setAttribute('aria-label', 'Presentation mode');

  _overlay.innerHTML = `
    <div class="pres-controls" id="pres-controls">
      <span class="pres-title">${_esc(title)}</span>
      <div class="pres-controls__right">
        <button class="pres-btn" id="pres-slower" title="Slower (-)">−</button>
        <span class="pres-speed-label" id="pres-speed-label">${_speedLabel()}</span>
        <button class="pres-btn" id="pres-faster" title="Faster (+)">+</button>
        <button class="pres-btn" id="pres-pause"  title="Pause/Resume (Space)">⏸</button>
        <button class="pres-btn" id="pres-screen" title="Open on second screen (S)">⊞</button>
        <button class="pres-btn pres-btn--close" id="pres-close" title="Exit (Esc)">✕</button>
      </div>
    </div>
    <div class="pres-scroller" id="pres-scroller">
      <div class="pres-content">
        <h1 class="pres-sermon-title">${_esc(title)}</h1>
        <div class="pres-body">${html}</div>
        <!-- Trailing space so last line scrolls fully into view -->
        <div style="height:60vh"></div>
      </div>
    </div>
    <div class="pres-progress" id="pres-progress"></div>`;

  document.body.appendChild(_overlay);
  _scroller = document.getElementById('pres-scroller');

  // Hide controls after 3s of no movement
  let _controlsTimer = null;
  const showControls = () => {
    document.getElementById('pres-controls')?.classList.remove('pres-controls--hidden');
    clearTimeout(_controlsTimer);
    _controlsTimer = setTimeout(() => {
      document.getElementById('pres-controls')?.classList.add('pres-controls--hidden');
    }, 3000);
  };
  _overlay.addEventListener('mousemove', showControls);
  showControls();

  // Button wiring
  document.getElementById('pres-close')  ?.addEventListener('click', _close);
  document.getElementById('pres-pause')  ?.addEventListener('click', _togglePause);
  document.getElementById('pres-slower') ?.addEventListener('click', () => _changeSpeed(-0.2));
  document.getElementById('pres-faster') ?.addEventListener('click', () => _changeSpeed(+0.2));
  document.getElementById('pres-screen') ?.addEventListener('click', _openSecondScreen);

  // Click anywhere on content → scroll a page
  _scroller.addEventListener('click', e => {
    if (e.target.closest('#pres-controls')) return;
    _scroller.scrollBy({ top: _scroller.clientHeight * 0.85, behavior: 'smooth' });
  });

  // Inject styles
  _injectCSS();
}

// ── Auto-scroll ───────────────────────────────────────────

function _startScroll() {
  _running = true;
  _tick();
}

function _tick() {
  if (!_scroller) return;
  if (_running) {
    _scroller.scrollTop += _speed;
    _updateProgress();
    _broadcastScroll();
  }
  _raf = requestAnimationFrame(_tick);
}

function _togglePause() {
  _running = !_running;
  const btn = document.getElementById('pres-pause');
  if (btn) btn.textContent = _running ? '⏸' : '▶';
}

function _changeSpeed(delta) {
  _speed = Math.max(0.1, Math.min(5, parseFloat((_speed + delta).toFixed(1))));
  localStorage.setItem(STORAGE_KEY, _speed);
  const lbl = document.getElementById('pres-speed-label');
  if (lbl) lbl.textContent = _speedLabel();
}

function _speedLabel() {
  return `${_speed.toFixed(1)}×`;
}

function _updateProgress() {
  if (!_scroller) return;
  const bar = document.getElementById('pres-progress');
  if (!bar) return;
  const max = _scroller.scrollHeight - _scroller.clientHeight;
  const pct = max > 0 ? (_scroller.scrollTop / max) * 100 : 0;
  bar.style.width = `${pct}%`;
}

// ── Keyboard shortcuts ────────────────────────────────────

function _bindKeys() {
  document.addEventListener('keydown', _onKey);
}

function _onKey(e) {
  if (!_overlay) return;
  switch (e.key) {
    case 'Escape': case 'f': case 'F': _close(); break;
    case ' ':
      e.preventDefault();
      // Space while paused = scroll one page; while running = pause
      if (!_running) {
        _scroller?.scrollBy({ top: _scroller.clientHeight * 0.85, behavior: 'smooth' });
      } else {
        _togglePause();
      }
      break;
    case 'ArrowDown': case 'PageDown':
      e.preventDefault();
      _scroller?.scrollBy({ top: _scroller.clientHeight * 0.4, behavior: 'smooth' });
      break;
    case 'ArrowUp': case 'PageUp':
      e.preventDefault();
      _scroller?.scrollBy({ top: -_scroller.clientHeight * 0.4, behavior: 'smooth' });
      break;
    case '+': case '=': _changeSpeed(+0.2); break;
    case '-': case '_': _changeSpeed(-0.2); break;
    case 's': case 'S': _openSecondScreen(); break;
  }
}

// ── Dual-screen support ───────────────────────────────────

function _openChannel() {
  try {
    _channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    // BroadcastChannel not supported — single-screen only
  }
}

function _broadcastScroll() {
  if (!_channel || !_scroller) return;
  // Throttle to every 4 frames (~66ms at 60fps)
  if (Math.round(_scroller.scrollTop) % 4 !== 0) return;
  _channel.postMessage({ type: 'scroll', scrollTop: _scroller.scrollTop });
}

function _openSecondScreen() {
  if (_secondWin && !_secondWin.closed) {
    _secondWin.focus();
    return;
  }
  // Pass serialised content via sessionStorage (avoids URL length limits)
  const html  = document.querySelector('.pres-body')?.innerHTML || '';
  const title = document.querySelector('.pres-sermon-title')?.textContent || '';
  sessionStorage.setItem('berean-pres-payload', JSON.stringify({ title, html }));

  _secondWin = window.open(
    `${window.location.origin}${window.location.pathname}#pres-display`,
    'berean-display',
    'width=1280,height=720'
  );
}

// ── Close ─────────────────────────────────────────────────

function _close() {
  if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
  document.removeEventListener('keydown', _onKey);
  _overlay?.remove();
  _overlay = null;
  _scroller = null;
  _running = false;
  _channel?.close();
  _channel = null;
  if (_secondWin && !_secondWin.closed) _secondWin.close();
  _secondWin = null;
}

// ── Display window (second screen) ───────────────────────

/**
 * Call this from main.js bootstrap when #pres-display is detected.
 * Renders a read-only display view that follows the presenter's scroll.
 */
export function tryRenderDisplayWindow() {
  if (!window.location.hash.startsWith('#pres-display')) return false;

  const payload = sessionStorage.getItem('berean-pres-payload');
  if (!payload) {
    document.body.innerHTML = '<p style="color:#fff;padding:2rem">No presentation data. Open from the Berean sermon editor.</p>';
    return true;
  }

  const { title, html } = JSON.parse(payload);
  _renderDisplayView(title, html);
  return true;
}

function _renderDisplayView(title, html) {
  document.documentElement.style.background = '#000';
  document.body.style.cssText = 'margin:0;padding:0;background:#000;overflow:hidden;';

  const scroller = document.createElement('div');
  scroller.style.cssText = `
    position:fixed;inset:0;overflow:hidden;
    font-family:'EB Garamond',Georgia,serif;
    color:#F4F1EA;background:#000;
    padding:5vw 10vw;box-sizing:border-box;
    font-size:clamp(1.5rem,3vw,2.5rem);
    line-height:1.5;
  `;

  scroller.innerHTML = `
    <h1 style="font-size:1.25em;color:#D4AF37;margin:0 0 1em;font-weight:700">${_esc(title)}</h1>
    <div>${html}</div>
    <div style="height:60vh"></div>`;

  document.body.appendChild(scroller);

  // Listen for scroll commands from presenter window
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.addEventListener('message', e => {
      if (e.data?.type === 'scroll') {
        scroller.scrollTop = e.data.scrollTop;
      }
    });
  } catch {
    // No BroadcastChannel support
  }
}

// ── Helpers ───────────────────────────────────────────────

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CSS ───────────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('pres-styles')) return;
  const style = document.createElement('style');
  style.id = 'pres-styles';
  style.textContent = `
    .pres-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: #000;
      display: flex; flex-direction: column;
      font-family: 'EB Garamond', Georgia, serif;
    }
    .pres-controls {
      position: absolute; top: 0; left: 0; right: 0; z-index: 10001;
      display: flex; align-items: center; gap: .75rem;
      padding: .625rem 1rem;
      background: rgba(0,0,0,.85);
      backdrop-filter: blur(8px);
      transition: opacity 250ms ease;
    }
    .pres-controls--hidden { opacity: 0; pointer-events: none; }
    .pres-title {
      flex: 1; font-family: Inter, system-ui, sans-serif;
      font-size: .875rem; color: #D4AF37; font-weight: 600;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .pres-controls__right { display: flex; align-items: center; gap: .5rem; }
    .pres-btn {
      background: rgba(255,255,255,.1); border: none; color: #E8E6E1;
      padding: .25rem .625rem; border-radius: .25rem; cursor: pointer;
      font-size: .875rem; font-family: Inter, system-ui, sans-serif;
      line-height: 1.4;
    }
    .pres-btn:hover { background: rgba(255,255,255,.2); }
    .pres-btn--close { color: #aaa; }
    .pres-btn--close:hover { color: #fff; background: rgba(220,0,0,.4); }
    .pres-speed-label {
      font-size: .75rem; color: #aaa; font-family: 'Fira Code', monospace;
      min-width: 2.5rem; text-align: center;
    }
    .pres-scroller {
      flex: 1; overflow-y: scroll; overflow-x: hidden;
      padding: 8vh 12vw 0;
      scrollbar-width: none;
    }
    .pres-scroller::-webkit-scrollbar { display: none; }
    .pres-sermon-title {
      font-size: clamp(1.75rem, 4vw, 3.5rem);
      color: #D4AF37; font-weight: 700; margin: 0 0 1.5em;
      line-height: 1.2;
    }
    .pres-body {
      font-size: clamp(1.25rem, 2.5vw, 2rem);
      line-height: 1.65; color: #F4F1EA;
    }
    .pres-body h2, .pres-body h3 { color: #D4AF37; margin: 1.25em 0 .5em; }
    .pres-body blockquote {
      border-left: 3px solid #D4AF37; margin: 1em 0;
      padding-left: 1.25em; color: #c8c4bc; font-style: italic;
    }
    .pres-body p { margin: 0 0 .75em; }
    .pres-body strong { color: #fff; }
    .pres-progress {
      position: fixed; bottom: 0; left: 0; height: 3px;
      background: #D4AF37; width: 0%; transition: width 100ms linear;
      z-index: 10001;
    }
    @media (prefers-reduced-motion: reduce) {
      .pres-controls { transition-duration: 0ms !important; }
      .pres-progress { transition-duration: 0ms !important; }
    }
  `;
  document.head.appendChild(style);
}
