/* ============================================================
   cloud-sync.js — Cloud Sync: GitHub Gist + Google Drive

   Lets the pastor back up and restore all their Berean data
   (sermons, clippings, highlights, bookmarks, study packs,
   reading plan progress, etc.) to cloud storage.

   GitHub Gist:
   - User provides a Personal Access Token (gist scope)
   - Data serialised as JSON → stored in a private Gist
   - One Gist per device; ID stored in IDB CloudSyncTokens
   - Uses fetch() → api.github.com (no SDK needed)

   Google Drive:
   - User provides their OAuth Client ID (created in Google Console)
   - We use Google Identity Services (GIS) implicit flow
   - Data stored as a JSON file in Drive AppData folder
   - Tokens cached in memory; refresh on expiry

   Both services:
   - Full export: all IDB stores → single JSON blob
   - Full import: JSON blob → restore all stores
   - Last-sync timestamp shown in UI
   ============================================================ */

import { getDB } from '../../idb/schema.js';

// ── IDB token helpers ─────────────────────────────────────

async function _saveToken(service, data) {
  const db = await getDB();
  await db.put('CloudSyncTokens', { service, ...data, savedAt: Date.now() });
}

async function _loadToken(service) {
  const db = await getDB();
  return db.get('CloudSyncTokens', service);
}

async function _clearToken(service) {
  const db = await getDB();
  await db.delete('CloudSyncTokens', service);
}

// ── Full IDB export / import ──────────────────────────────

const SYNC_STORES = [
  'Sermons', 'SermonSeries', 'ExegesisChecklists', 'ClippingsTray',
  'CitationRegistry', 'StudyPacks', 'IllustrationLibrary',
  'Bookmarks', 'ReadingPlanProgress', 'Highlights', 'PreachingCalendar',
  'TopicWorkspace', 'ReadingJournal',
];

export async function exportAllData() {
  const db = await getDB();
  const snapshot = { version: 4, exportedAt: new Date().toISOString(), stores: {} };
  for (const store of SYNC_STORES) {
    try {
      snapshot.stores[store] = await db.getAll(store);
    } catch {
      snapshot.stores[store] = [];
    }
  }
  return JSON.stringify(snapshot);
}

export async function importAllData(jsonStr) {
  const snapshot = JSON.parse(jsonStr);
  if (!snapshot?.stores) throw new Error('Invalid backup format');
  const db = await getDB();
  for (const [store, records] of Object.entries(snapshot.stores)) {
    if (!SYNC_STORES.includes(store)) continue;
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    for (const record of records) await tx.store.put(record);
    await tx.done;
  }
}

// ── GitHub Gist sync ──────────────────────────────────────

const GIST_FILENAME = 'berean-backup.json';
const GIST_DESCRIPTION = 'Berean Bible Study — automatic backup';

export async function githubSync(pat) {
  const token = pat || (await _loadToken('github'))?.pat;
  if (!token) throw new Error('No GitHub token — enter your Personal Access Token first');

  const json = await exportAllData();
  const existingId = (await _loadToken('github'))?.gistId;

  let gistId = existingId;

  if (gistId) {
    // Update existing Gist
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        files: { [GIST_FILENAME]: { content: json } },
      }),
    });
    if (!res.ok) {
      if (res.status === 404) {
        gistId = null;  // Gist was deleted — create new one below
      } else {
        throw new Error(`GitHub sync failed: ${res.status} ${res.statusText}`);
      }
    }
  }

  if (!gistId) {
    // Create new private Gist
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: { [GIST_FILENAME]: { content: json } },
      }),
    });
    if (!res.ok) throw new Error(`GitHub create failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    gistId = data.id;
  }

  await _saveToken('github', { pat: token, gistId, lastSync: new Date().toISOString() });
  return { gistId };
}

export async function githubRestore(pat) {
  const token = pat || (await _loadToken('github'))?.pat;
  if (!token) throw new Error('No GitHub token');
  const gistId = (await _loadToken('github'))?.gistId;
  if (!gistId) throw new Error('No backup found — sync first to create one');

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  const data = await res.json();
  const content = data.files?.[GIST_FILENAME]?.content;
  if (!content) throw new Error('Backup file not found in Gist');

  await importAllData(content);
}

export async function getGithubToken() {
  return _loadToken('github');
}

export async function clearGithubToken() {
  await _clearToken('github');
}

// ── Google Drive sync ─────────────────────────────────────

const GDRIVE_FILENAME = 'berean-backup.json';
const GDRIVE_MIME = 'application/json';
const GDRIVE_SPACE = 'appDataFolder';  // Hidden app-specific folder, not visible to user

let _googleAccessToken = null;
let _googleTokenExpiry = 0;

/**
 * Sign in with Google using Identity Services implicit flow.
 * clientId is the OAuth 2.0 Client ID from Google Cloud Console.
 */
export async function googleSignIn(clientId) {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      callback: (response) => {
        if (response.error) { reject(new Error(response.error)); return; }
        _googleAccessToken = response.access_token;
        _googleTokenExpiry = Date.now() + (response.expires_in * 1000) - 60_000;
        _saveToken('google', { clientId, lastSync: new Date().toISOString() });
        resolve(response);
      },
    });
    client.requestAccessToken();
  });
}

export async function getGoogleClientId() {
  return (await _loadToken('google'))?.clientId || null;
}

export async function clearGoogleToken() {
  _googleAccessToken = null;
  _googleTokenExpiry = 0;
  await _clearToken('google');
}

function _gdriveHeaders() {
  if (!_googleAccessToken || Date.now() > _googleTokenExpiry) {
    throw new Error('Google session expired — please sign in again');
  }
  return { 'Authorization': `Bearer ${_googleAccessToken}` };
}

async function _findBackupFileId() {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=${GDRIVE_SPACE}&fields=files(id,name)&q=name='${GDRIVE_FILENAME}'`,
    { headers: _gdriveHeaders() }
  );
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

export async function googleDriveSync() {
  const json = await exportAllData();
  const blob = new Blob([json], { type: GDRIVE_MIME });
  const existingId = await _findBackupFileId();

  if (existingId) {
    // Update existing file
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      { method: 'PATCH', headers: { ..._gdriveHeaders(), 'Content-Type': GDRIVE_MIME }, body: blob }
    );
    if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
  } else {
    // Create new file in appDataFolder
    const meta = JSON.stringify({ name: GDRIVE_FILENAME, parents: [GDRIVE_SPACE] });
    const form = new FormData();
    form.append('metadata', new Blob([meta], { type: 'application/json' }));
    form.append('file', blob);
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: _gdriveHeaders(), body: form }
    );
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
  }

  await _saveToken('google', {
    ...(await _loadToken('google')),
    lastSync: new Date().toISOString(),
  });
}

export async function googleDriveRestore() {
  const fileId = await _findBackupFileId();
  if (!fileId) throw new Error('No backup found in Google Drive');

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: _gdriveHeaders() }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const json = await res.text();
  await importAllData(json);
}
