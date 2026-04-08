/* ============================================================
   participant.js — Read-only participant view for shared studies

   Renders a mobile-friendly study session view. Detected by:
   - URL fragment: #study=<base64url-gzipped-json>
   - Pathname:     /s/<id> (KV Worker-backed)

   This module takes over the entire viewport when a study URL
   is detected, hiding the normal Berean app chrome.
   ============================================================ */
import { decodeStudyFromFragment, fetchStudyFromKv } from './publisher.js';

/**
 * Check if the current URL contains a study session.
 * If so, render the participant view and return true.
 * Otherwise return false (normal app boot continues).
 */
export async function tryRenderParticipantView() {
  let study = null;

  // Check for URL fragment: #study=...
  const hash = window.location.hash;
  if (hash.startsWith('#study=')) {
    study = await decodeStudyFromFragment(hash);
  }

  // Check for pathname: /s/<id>
  if (!study && window.location.pathname.startsWith('/s/')) {
    const id = window.location.pathname.replace('/s/', '').split('/')[0];
    if (id) study = await fetchStudyFromKv(id);
  }

  if (!study) return false;

  // Take over the viewport
  _renderStudy(study);
  return true;
}

function _renderStudy(study) {
  const app = document.getElementById('app');
  if (!app) return;

  // Hide loading screen if present
  document.getElementById('loading-screen')?.remove();

  app.innerHTML = `
    <div class="sp">
      <header class="sp__header">
        <h1 class="sp__title">${_esc(study.title)}</h1>
        ${study.passage ? `<p class="sp__passage">${_esc(study.passage)}</p>` : ''}
      </header>

      ${study.scripture ? `
        <section class="sp__section sp__section--scripture">
          <h2 class="sp__section-heading">Scripture</h2>
          <div class="sp__scripture-text">${_formatScripture(study.scripture)}</div>
        </section>
      ` : study.passage ? `
        <section class="sp__section sp__section--scripture">
          <h2 class="sp__section-heading">Scripture</h2>
          <p class="sp__scripture-text">Read <strong>${_esc(study.passage)}</strong> in your Bible</p>
        </section>
      ` : ''}

      ${(study.sections || []).map(sec => _renderSection(sec)).join('')}

      <footer class="sp__footer">
        <p class="sp__footer-text">
          Created with <a href="${window.location.origin}" class="sp__footer-link">Berean</a>
          — free Bible study tools for pastors
        </p>
        <button class="sp__open-btn" id="sp-open-berean">Open in Berean</button>
      </footer>
    </div>`;

  // Inject participant CSS
  _injectCSS();

  // "Open in Berean" navigates to the main app
  document.getElementById('sp-open-berean')?.addEventListener('click', () => {
    window.location.href = window.location.origin;
  });
}

function _renderSection(sec) {
  if (!sec) return '';

  if (sec.type === 'outline') {
    const items = (sec.items || []).filter(Boolean);
    if (items.length === 0) return '';
    return `
      <section class="sp__section">
        <h2 class="sp__section-heading">${_esc(sec.heading)}</h2>
        <ol class="sp__list sp__list--outline">
          ${items.map(item => `<li class="sp__list-item">${_esc(item)}</li>`).join('')}
        </ol>
      </section>`;
  }

  if (sec.type === 'discussion') {
    const items = (sec.items || []).filter(Boolean);
    if (items.length === 0) return '';
    return `
      <section class="sp__section">
        <h2 class="sp__section-heading">${_esc(sec.heading)}</h2>
        <ol class="sp__list sp__list--discussion">
          ${items.map(item => `<li class="sp__list-item">${_esc(item)}</li>`).join('')}
        </ol>
      </section>`;
  }

  // Notes, application, prayer — body text
  if (!sec.body) return '';
  return `
    <section class="sp__section">
      <h2 class="sp__section-heading">${_esc(sec.heading)}</h2>
      <div class="sp__body">${_formatParagraphs(sec.body)}</div>
    </section>`;
}

function _formatScripture(text) {
  if (!text) return '';
  // Format [N] verse numbers
  return _esc(text)
    .replace(/\[(\d+)\]/g, '<sup class="sp__verse-num">$1</sup>')
    .replace(/\n/g, '<br>');
}

function _formatParagraphs(text) {
  if (!text) return '';
  return _esc(text)
    .split(/\n\n+/)
    .map(p => `<p class="sp__p">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Participant CSS (self-contained — doesn't depend on main app styles) ─────

function _injectCSS() {
  if (document.getElementById('sp-styles')) return;
  const style = document.createElement('style');
  style.id = 'sp-styles';
  style.textContent = `
    .sp {
      max-width: 40rem;
      margin: 0 auto;
      padding: 1.5rem 1rem 3rem;
      font-family: 'EB Garamond', Georgia, serif;
      color: #E8E6E1;
      background: #121212;
      min-height: 100vh;
    }
    .sp__header {
      text-align: center;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #3E3E3E;
      margin-bottom: 1.5rem;
    }
    .sp__title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #F4F1EA;
      margin: 0 0 .5rem;
    }
    .sp__passage {
      font-size: 1.125rem;
      color: #D4AF37;
      margin: 0;
    }
    .sp__section {
      margin-bottom: 2rem;
    }
    .sp__section--scripture {
      background: #1E1E1E;
      border-left: 3px solid #D4AF37;
      border-radius: 0 .375rem .375rem 0;
      padding: 1rem 1.25rem;
    }
    .sp__section-heading {
      font-size: 1rem;
      font-weight: 600;
      color: #D4AF37;
      text-transform: uppercase;
      letter-spacing: .05em;
      margin: 0 0 .75rem;
      font-family: Inter, system-ui, sans-serif;
    }
    .sp__scripture-text {
      font-size: 1.125rem;
      line-height: 1.75;
      color: #F4F1EA;
    }
    .sp__verse-num {
      font-family: 'Fira Code', monospace;
      font-size: .625rem;
      color: #D4AF37;
      margin-right: .2em;
      vertical-align: super;
    }
    .sp__list {
      padding-left: 1.5rem;
      margin: 0;
    }
    .sp__list--outline { list-style-type: upper-roman; }
    .sp__list--discussion { list-style-type: decimal; }
    .sp__list-item {
      font-size: 1.0625rem;
      line-height: 1.6;
      margin-bottom: .5rem;
      color: #E8E6E1;
    }
    .sp__body {
      font-size: 1.0625rem;
      line-height: 1.6;
    }
    .sp__p {
      margin: 0 0 .75rem;
    }
    .sp__footer {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid #3E3E3E;
      margin-top: 2rem;
    }
    .sp__footer-text {
      font-size: .8125rem;
      color: #6B675F;
      font-family: Inter, system-ui, sans-serif;
      margin: 0 0 1rem;
    }
    .sp__footer-link {
      color: #D4AF37;
      text-decoration: none;
    }
    .sp__footer-link:hover { text-decoration: underline; }
    .sp__open-btn {
      background: #D4AF37;
      color: #121212;
      border: none;
      padding: .625rem 1.5rem;
      border-radius: .375rem;
      font-size: .875rem;
      font-weight: 600;
      font-family: Inter, system-ui, sans-serif;
      cursor: pointer;
    }
    .sp__open-btn:hover { opacity: .9; }

    /* Light mode */
    @media (prefers-color-scheme: light) {
      .sp { background: #FAF9F6; color: #1A1A1A; }
      .sp__title { color: #0A0A0A; }
      .sp__passage { color: #8B6914; }
      .sp__section--scripture { background: #F4F2EC; border-color: #8B6914; }
      .sp__scripture-text { color: #0A0A0A; }
      .sp__section-heading { color: #8B6914; }
      .sp__list-item { color: #1A1A1A; }
      .sp__verse-num { color: #8B6914; }
      .sp__header { border-color: #D5D1C8; }
      .sp__footer { border-color: #D5D1C8; }
    }

    /* Mobile */
    @media (max-width: 600px) {
      .sp { padding: 1rem .75rem 2rem; }
      .sp__title { font-size: 1.375rem; }
    }

    @media print {
      .sp__open-btn,
      .sp__footer-link { display: none; }
      .sp { color: black; background: white; }
      .sp__title { color: black; }
      .sp__section--scripture { border-color: #8B6914; background: #F8F8F6; }
    }
  `;
  document.head.appendChild(style);
}
