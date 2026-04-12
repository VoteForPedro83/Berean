/* ============================================================
   byok-modal.js — Settings modal: API keys + theme + language
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';
import {
  getCommentaryPrefs, saveCommentaryPrefs,
  getUserCommentaryMeta, loadUserCommentaryDb, deleteUserCommentaryDb,
} from '../../db/commentaries.js';
import { saveApiKey, deleteApiKey, hasApiKey, listStoredProviders } from '../../idb/byok.js';
import { toast } from '../layout/toast.js';
import { toggleTheme, setLang, setFontSize, state } from '../../state/study-mode.js';
import {
  githubSync, githubRestore, getGithubToken, clearGithubToken,
  googleSignIn, googleDriveSync, googleDriveRestore, getGoogleClientId, clearGoogleToken,
} from './cloud-sync.js';
import { exportEncryptedBackup, importEncryptedBackup } from './encrypted-backup.js';

const PROVIDERS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    note: 'Free tier available — recommended',
    hasFree: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keySteps: 'Go to Google AI Studio → sign in with a Google account → click <strong>Get API key</strong> → Create API key. It\'s free with generous daily limits.',
  },
  {
    id: 'groq',
    name: 'Groq',
    note: 'llama-3.3-70b · free tier, low rate limits',
    hasFree: true,
    keyUrl: 'https://console.groq.com/keys',
    keySteps: 'Go to Groq Console → sign up (free) → click <strong>API Keys</strong> in the sidebar → Create API Key. Free tier: 6,000 tokens/min on Llama 3.3.',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    note: 'mistral-small-latest · free Codestral tier',
    hasFree: true,
    keyUrl: 'https://console.mistral.ai/api-keys/',
    keySteps: 'Go to Mistral La Plateforme → sign up (free) → click <strong>API keys</strong> → Create new key. Free tier available for experimentation.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    note: 'claude-3-5-haiku · requires payment',
    hasFree: false,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keySteps: 'Go to Anthropic Console → sign up → add a credit card (no free tier) → Settings → API Keys → Create Key.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    note: 'gpt-4o-mini · requires payment (via Cloudflare proxy)',
    hasFree: false,
    keyUrl: 'https://platform.openai.com/api-keys',
    keySteps: 'Go to OpenAI Platform → sign up → add a credit card → API Keys → Create new secret key. Requires a Cloudflare Worker proxy to be deployed.',
  },
];

// Known built-in commentary sources — shown as checkboxes in Settings
const COMM_SOURCES = [
  { abbr: 'CALVIN',   name: "Calvin's Commentaries" },
  { abbr: 'GENEVA',   name: 'Geneva Bible Notes' },
  { abbr: 'MHC',      name: 'Matthew Henry Complete' },
  { abbr: 'MHCC',     name: 'Matthew Henry Concise' },
  { abbr: 'JFB',      name: 'Jamieson, Fausset & Brown' },
  { abbr: 'BARNES',   name: "Barnes' Notes" },
  { abbr: 'TRAPP',    name: "Trapp's Commentary" },
  { abbr: 'POOLE',    name: "Poole's Commentary" },
  { abbr: 'ALFORD',   name: "Alford's Greek Testament" },
  { abbr: 'RYLE',     name: "Ryle's Expository Thoughts" },
  { abbr: 'SPURG',    name: "Spurgeon's Commentary" },
  { abbr: 'LUTHER',   name: "Luther's Commentary" },
  { abbr: 'EDWARDS',  name: 'Jonathan Edwards' },
  { abbr: 'PINK',     name: "A.W. Pink's Commentary" },
  { abbr: 'OWEN',     name: "John Owen's Commentary" },
  { abbr: 'CAMB',     name: 'Cambridge Bible Commentary' },
  { abbr: 'MACL',     name: "MacLaren's Expositions" },
  { abbr: 'MACK',     name: "MacKnight's Epistles" },
  { abbr: 'CLARKE',   name: "Adam Clarke's Commentary" },
  { abbr: 'TSK',      name: 'Treasury of Scripture Knowledge' },
];

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let dialog = null;

export function initSettingsModal() {
  dialog = document.getElementById('settings-modal');
  if (!dialog) return;

  dialog.addEventListener('click', e => { if (e.target === dialog) closeSettings(); });
  dialog.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });

  bus.on(EVENTS.MODAL_OPEN, name => { if (name === 'settings') openSettings(); });
  bus.on(EVENTS.MODAL_CLOSE, name => { if (name === 'settings') closeSettings(); });
}

export async function openSettings() {
  if (!dialog) {
    dialog = document.getElementById('settings-modal');
    if (!dialog) { console.error('[settings] settings-modal element not found'); return; }
  }

  // Fetch stored data with safe fallbacks — if any lookup fails (e.g. old IDB
  // schema version without CloudSyncTokens), still open the modal with defaults.
  let stored = [], ghToken = null, googleClientId = null;
  try { stored = await listStoredProviders(); } catch { /* no keys stored */ }
  try { ghToken = await getGithubToken(); }     catch { /* no github token */ }
  try { googleClientId = await getGoogleClientId(); } catch { /* no google id */ }

  dialog.innerHTML = buildModalHTML(stored, ghToken, googleClientId);
  // Guard against calling showModal() when the dialog is already open
  // (happens when openSettings() is called again from within wireSettingsEvents)
  if (!dialog.open) dialog.showModal();
  wireSettingsEvents();
}

function closeSettings() {
  dialog?.close();
}

function buildModalHTML(storedProviders, ghToken, googleClientId) {
  return `
    <div class="settings-modal__inner">
      <header class="settings-modal__header">
        <h2 class="settings-modal__title">Settings</h2>
        <button class="settings-modal__close" id="settings-close" aria-label="Close settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <div class="settings-modal__body">

        <!-- Appearance -->
        <section class="settings-section">
          <h3 class="settings-section__title">Appearance</h3>
          <div class="settings-row">
            <span class="settings-row__label">Theme</span>
            <div class="settings-row__control">
              <button class="settings-theme-btn${state.theme === 'dark-mode' ? ' active' : ''}" data-theme="dark-mode">
                Dark (Scholar)
              </button>
              <button class="settings-theme-btn${state.theme === 'light-mode' ? ' active' : ''}" data-theme="light-mode">
                Light (Print)
              </button>
            </div>
          </div>
          <div class="settings-row">
            <span class="settings-row__label">Scripture size</span>
            <div class="settings-row__control settings-row__control--font">
              ${['sm','md','lg','xl'].map(s => `
                <button class="settings-font-btn${state.fontSize === s ? ' active' : ''}" data-size="${s}">
                  ${s === 'sm' ? 'Small' : s === 'md' ? 'Default' : s === 'lg' ? 'Large' : 'XL'}
                </button>`).join('')}
            </div>
          </div>
        </section>

        <!-- Language -->
        <section class="settings-section">
          <h3 class="settings-section__title">Language</h3>
          <div class="settings-row">
            <span class="settings-row__label">UI language</span>
            <div class="settings-row__control">
              <button class="settings-lang-btn${state.lang === 'en' ? ' active' : ''}" data-lang="en">English</button>
              <button class="settings-lang-btn${state.lang === 'afr' ? ' active' : ''}" data-lang="afr">Afrikaans</button>
            </div>
          </div>
        </section>

        <!-- AI API Keys -->
        <section class="settings-section">
          <h3 class="settings-section__title">AI API Keys <span class="settings-section__note">(stored encrypted, never leave your device)</span></h3>

          <div class="settings-ai-multi-key">
            <p class="settings-ai-multi-key__text">You can add keys for multiple providers. When one provider is rate-limited or unavailable, Berean automatically falls back to the next available option — so adding more keys means fewer interruptions.</p>
          </div>

          <div class="settings-ai-disclaimer">
            <p class="settings-ai-disclaimer__text">By entering an API key, you confirm that you are responsible for your own usage of that AI service and compliance with its terms. This application does not transmit copyrighted Bible translation text to AI providers. You are responsible for any data you choose to include in your queries.</p>
          </div>

          ${PROVIDERS.map(p => `
            <div class="settings-provider" data-provider="${p.id}">
              <div class="settings-provider__info">
                <span class="settings-provider__name">
                  ${p.name}
                  ${p.hasFree ? '<span class="settings-provider__free-badge">Free tier</span>' : ''}
                </span>
                <span class="settings-provider__note">${p.note}</span>
                ${p.keyUrl ? `<a class="settings-provider__key-link" href="${p.keyUrl}" target="_blank" rel="noopener noreferrer">Get API key ↗</a>` : ''}
              </div>
              <div class="settings-provider__status">
                ${storedProviders.includes(p.id)
                  ? `<span class="settings-provider__saved">Key saved</span>
                     <button class="settings-provider__delete" data-delete="${p.id}" aria-label="Remove ${p.name} key">Remove</button>`
                  : `<button class="settings-provider__add" data-add="${p.id}">Add key</button>`}
              </div>
            </div>`).join('')}
        </section>

        <!-- Add key form (hidden by default) -->
        <section class="settings-section settings-key-form" id="key-form" hidden>
          <h3 class="settings-section__title" id="key-form-title">Add API key</h3>
          <!-- Provider-specific instructions injected here -->
          <div id="key-form-instructions"></div>
          <div class="settings-field">
            <label class="settings-field__label" for="key-input">API key</label>
            <input type="password" id="key-input" class="settings-field__input" placeholder="Paste your API key here…" autocomplete="off" spellcheck="false"/>
          </div>
          <div class="settings-field settings-field--actions">
            <button class="settings-btn settings-btn--primary" id="save-key-btn">Save Key</button>
            <button class="settings-btn" id="cancel-key-btn">Cancel</button>
          </div>
        </section>

        <!-- Cloud Sync -->
        <section class="settings-section">
          <h3 class="settings-section__title">Cloud Sync <span class="settings-section__note">(optional — your data, your accounts)</span></h3>

          <!-- GitHub Gist -->
          <div class="settings-sync-block">
            <div class="settings-sync-block__header">
              <span class="settings-sync-block__name">GitHub Gist</span>
              ${ghToken?.lastSync ? `<span class="settings-sync-block__last">Last sync: ${new Date(ghToken.lastSync).toLocaleDateString()}</span>` : ''}
            </div>
            <div class="settings-field">
              <input type="password" id="gh-pat-input" class="settings-field__input"
                     placeholder="${ghToken?.pat ? '••••••••••••••••••••' : 'Personal Access Token (gist scope)'}"
                     autocomplete="off" spellcheck="false"/>
            </div>
            <div class="settings-field settings-field--actions settings-field--actions-row">
              <button class="settings-btn settings-btn--primary settings-btn--sm" id="gh-sync-btn">Sync now</button>
              <button class="settings-btn settings-btn--sm" id="gh-restore-btn">Restore</button>
              ${ghToken ? `<button class="settings-btn settings-btn--sm settings-btn--danger" id="gh-clear-btn">Disconnect</button>` : ''}
            </div>
            <p class="settings-hint">Create a token at github.com → Settings → Developer settings → Personal access tokens. Enable the <code>gist</code> scope only.</p>
          </div>

          <!-- Google Drive -->
          <div class="settings-sync-block">
            <div class="settings-sync-block__header">
              <span class="settings-sync-block__name">Google Drive</span>
              ${googleClientId ? `<span class="settings-sync-block__last">Client ID configured</span>` : ''}
            </div>
            <div class="settings-field">
              <input type="text" id="gdrive-client-id" class="settings-field__input"
                     placeholder="${googleClientId ? googleClientId : 'OAuth Client ID from Google Cloud Console'}"
                     autocomplete="off" spellcheck="false"/>
            </div>
            <div class="settings-field settings-field--actions settings-field--actions-row">
              <button class="settings-btn settings-btn--primary settings-btn--sm" id="gdrive-signin-btn">Sign in &amp; Sync</button>
              <button class="settings-btn settings-btn--sm" id="gdrive-restore-btn">Restore</button>
              ${googleClientId ? `<button class="settings-btn settings-btn--sm settings-btn--danger" id="gdrive-clear-btn">Disconnect</button>` : ''}
            </div>
            <p class="settings-hint">Create an OAuth 2.0 Client ID at console.cloud.google.com. Enable the Google Drive API and add your site as an authorised origin.</p>
          </div>
        </section>

        <!-- Encrypted Backup -->
        <section class="settings-section">
          <h3 class="settings-section__title">Encrypted Backup <span class="settings-section__note">(AES-256 · stays on your device)</span></h3>
          <div class="settings-field">
            <input type="password" id="backup-password" class="settings-field__input"
                   placeholder="Password for encryption" autocomplete="new-password"/>
          </div>
          <div class="settings-field settings-field--actions settings-field--actions-row">
            <button class="settings-btn settings-btn--primary settings-btn--sm" id="backup-export-btn">Export .berean file</button>
            <label class="settings-btn settings-btn--sm settings-label-btn" for="backup-import-file">Import .berean file</label>
            <input type="file" id="backup-import-file" accept=".berean" style="display:none"/>
          </div>
        </section>

        <!-- Commentaries -->
        ${_buildCommentariesSection()}

        <!-- About -->
        <section class="settings-section settings-section--about">
          <p class="settings-about">Berean — free, open-source, non-commercial Bible study platform for pastors.</p>
          <p class="settings-about settings-about--muted">No accounts. No servers. No ads. For the Body of Christ.</p>
        </section>

      </div>
    </div>`;
}

function _buildCommentariesSection() {
  const enabled = getCommentaryPrefs(); // null = all; string[] = filter
  const meta    = getUserCommentaryMeta();

  const checksHtml = COMM_SOURCES.map(s => {
    const checked = enabled === null || enabled.includes(s.abbr);
    return `<label class="settings-comm__item">
      <input type="checkbox" class="settings-comm__check" data-abbr="${s.abbr}"${checked ? ' checked' : ''}>
      <span class="settings-comm__label">${_esc(s.name)}</span>
    </label>`;
  }).join('');

  const uploadHtml = meta
    ? `<div class="settings-comm__upload-row">
         <span class="settings-comm__upload-file">✓ ${_esc(meta.label || meta.filename)}</span>
         <span class="settings-comm__upload-date">Uploaded ${new Date(meta.uploadedAt).toLocaleDateString()}</span>
         <button class="settings-btn settings-btn--sm settings-btn--danger" id="comm-delete-upload">Remove</button>
       </div>`
    : `<div class="settings-comm__upload-row">
         <label class="settings-btn settings-btn--sm settings-label-btn" for="comm-upload-file">Upload .sqlite3</label>
         <input type="file" id="comm-upload-file" accept=".sqlite3,.db" style="display:none"/>
         <span class="settings-comm__upload-hint">Must have a <code>commentaries</code> table</span>
       </div>`;

  return `<section class="settings-section">
    <h3 class="settings-section__title">Commentaries</h3>
    <div class="settings-comm__toolbar">
      <span class="settings-comm__hint">Choose which sources appear in the Commentary panel.</span>
      <div class="settings-comm__toolbar-btns">
        <button class="settings-btn settings-btn--sm" id="comm-select-all">All</button>
        <button class="settings-btn settings-btn--sm" id="comm-select-none">None</button>
      </div>
    </div>
    <div class="settings-comm__grid">${checksHtml}</div>
    <div class="settings-comm__upload-block">
      <span class="settings-comm__upload-title">Your commentary database</span>
      ${uploadHtml}
      <p class="settings-comm__upload-schema">
        Schema: <code>commentaries(book_id, chapter, verse_start, verse_end, source_abbr, html_content)</code>
      </p>
    </div>
  </section>`;
}

function _refreshCommentaryPanel() {
  if (state.book) bus.emit(EVENTS.CHAPTER_LOADED, { book: state.book, chapter: state.chapter });
}

function wireSettingsEvents() {
  document.getElementById('settings-close')?.addEventListener('click', closeSettings);

  // Theme buttons
  dialog.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      if (state.theme !== theme) {
        toggleTheme();
        dialog.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
      }
    });
  });

  // Font size
  dialog.querySelectorAll('[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      setFontSize(btn.dataset.size);
      dialog.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('active', b.dataset.size === btn.dataset.size));
    });
  });

  // Language
  dialog.querySelectorAll('[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang);
      dialog.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('active', b.dataset.lang === btn.dataset.lang));
      toast(`Language changed to ${btn.textContent.trim()}`, 'info');
    });
  });

  // Add key
  let _addingProvider = null;
  dialog.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      _addingProvider = btn.dataset.add;
      const provMeta = PROVIDERS.find(p => p.id === _addingProvider);
      const form = document.getElementById('key-form');
      document.getElementById('key-form-title').textContent =
        `Add ${provMeta?.name ?? _addingProvider} key`;

      // Inject step-by-step instructions for this provider
      const instructEl = document.getElementById('key-form-instructions');
      if (instructEl && provMeta?.keySteps) {
        instructEl.innerHTML = `
          <div class="settings-key-instructions ${provMeta.hasFree ? 'settings-key-instructions--free' : ''}">
            ${provMeta.hasFree ? '<span class="settings-key-instructions__badge">Free tier available</span>' : ''}
            <p class="settings-key-instructions__text">${provMeta.keySteps}</p>
            ${provMeta.keyUrl ? `<a class="settings-key-instructions__link" href="${provMeta.keyUrl}" target="_blank" rel="noopener noreferrer">Open ${provMeta.name} → ↗</a>` : ''}
          </div>`;
      } else if (instructEl) {
        instructEl.innerHTML = '';
      }

      form.hidden = false;
      document.getElementById('key-input').focus();
    });
  });

  // Delete key
  dialog.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteApiKey(btn.dataset.delete);
      toast('API key removed', 'info');
      openSettings(); // Refresh
    });
  });

  // Save key
  document.getElementById('save-key-btn')?.addEventListener('click', async () => {
    const key = document.getElementById('key-input')?.value.trim();
    if (!key) { toast('Please enter an API key', 'error'); return; }
    await saveApiKey(_addingProvider, key);
    toast('API key saved', 'info');
    openSettings();
  });

  document.getElementById('cancel-key-btn')?.addEventListener('click', () => {
    document.getElementById('key-form').hidden = true;
  });

  // ── GitHub Gist sync ─────────────────────────────────────
  document.getElementById('gh-sync-btn')?.addEventListener('click', async () => {
    const pat = document.getElementById('gh-pat-input')?.value.trim() || undefined;
    try {
      await githubSync(pat);
      toast('Synced to GitHub Gist', 'info');
      openSettings();
    } catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('gh-restore-btn')?.addEventListener('click', async () => {
    const pat = document.getElementById('gh-pat-input')?.value.trim() || undefined;
    if (!confirm('This will overwrite ALL local data with the backup. Continue?')) return;
    try {
      await githubRestore(pat);
      toast('Data restored from GitHub Gist', 'info');
    } catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('gh-clear-btn')?.addEventListener('click', async () => {
    await clearGithubToken();
    toast('GitHub token removed', 'info');
    openSettings();
  });

  // ── Google Drive sync ─────────────────────────────────────
  document.getElementById('gdrive-signin-btn')?.addEventListener('click', async () => {
    const clientId = document.getElementById('gdrive-client-id')?.value.trim();
    if (!clientId && !(await getGoogleClientId())) {
      toast('Enter your Google OAuth Client ID first', 'error'); return;
    }
    try {
      await googleSignIn(clientId || await getGoogleClientId());
      await googleDriveSync();
      toast('Synced to Google Drive', 'info');
      openSettings();
    } catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('gdrive-restore-btn')?.addEventListener('click', async () => {
    if (!confirm('This will overwrite ALL local data with the backup. Continue?')) return;
    try {
      await googleDriveRestore();
      toast('Data restored from Google Drive', 'info');
    } catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('gdrive-clear-btn')?.addEventListener('click', async () => {
    await clearGoogleToken();
    toast('Google Drive disconnected', 'info');
    openSettings();
  });

  // ── Encrypted backup ─────────────────────────────────────
  document.getElementById('backup-export-btn')?.addEventListener('click', async () => {
    const pw = document.getElementById('backup-password')?.value;
    if (!pw) { toast('Enter a password first', 'error'); return; }
    try {
      await exportEncryptedBackup(pw);
      toast('Backup file downloaded', 'info');
    } catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('backup-import-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pw = document.getElementById('backup-password')?.value;
    if (!pw) { toast('Enter the backup password first', 'error'); e.target.value = ''; return; }
    if (!confirm('This will overwrite ALL local data with the backup. Continue?')) { e.target.value = ''; return; }
    try {
      await importEncryptedBackup(file, pw);
      toast('Data restored from backup', 'info');
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  // ── Commentary source prefs ───────────────────────────────
  function _getCheckedAbbrs() {
    return [...dialog.querySelectorAll('.settings-comm__check')]
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.abbr);
  }

  dialog.querySelectorAll('.settings-comm__check').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = _getCheckedAbbrs();
      // null = all enabled (store null so adding new sources works automatically)
      saveCommentaryPrefs(checked.length === COMM_SOURCES.length ? null : checked);
      _refreshCommentaryPanel();
    });
  });

  document.getElementById('comm-select-all')?.addEventListener('click', () => {
    dialog.querySelectorAll('.settings-comm__check').forEach(cb => { cb.checked = true; });
    saveCommentaryPrefs(null);
    _refreshCommentaryPanel();
  });

  document.getElementById('comm-select-none')?.addEventListener('click', () => {
    dialog.querySelectorAll('.settings-comm__check').forEach(cb => { cb.checked = false; });
    saveCommentaryPrefs([]);
    _refreshCommentaryPanel();
  });

  // ── User commentary upload ────────────────────────────────
  document.getElementById('comm-upload-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      toast('Loading commentary database…', 'info');
      await loadUserCommentaryDb(file);
      toast(`"${file.name}" loaded — commentaries refreshed`, 'info');
      _refreshCommentaryPanel();
      openSettings(); // Re-render modal to show file name
    } catch (err) {
      toast(`Upload failed: ${err.message}`, 'error');
    }
  });

  document.getElementById('comm-delete-upload')?.addEventListener('click', async () => {
    if (!confirm('Remove your uploaded commentary database?')) return;
    await deleteUserCommentaryDb();
    toast('Custom commentary removed', 'info');
    _refreshCommentaryPanel();
    openSettings();
  });
}
