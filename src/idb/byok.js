/* ============================================================
   byok.js — Bring-Your-Own-Key encrypted API key storage
   AES-GCM encryption using a random device key stored in
   localStorage. Keys never leave the device unencrypted.
   No user PIN required — the device key acts as the secret.
   ============================================================ */
import { getDB } from './schema.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Get or create a persistent random device encryption key */
function _getDeviceSecret() {
  const KEY = 'berean_dks';
  let secret = localStorage.getItem(KEY);
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY, secret);
  }
  return secret;
}

async function _deriveKey(secret, salt) {
  const raw  = enc.encode(secret);
  const base = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function saveApiKey(provider, rawKey) {
  const secret = _getDeviceSecret();
  const salt   = crypto.getRandomValues(new Uint8Array(16));
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const key    = await _deriveKey(secret, salt);
  const ct     = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(rawKey));
  const db     = await getDB();
  await db.put('ByokKeys', {
    provider,
    ciphertext: Array.from(new Uint8Array(ct)),
    salt:       Array.from(salt),
    iv:         Array.from(iv),
    savedAt:    Date.now(),
  });
}

export async function getApiKey(provider) {
  const db  = await getDB();
  const rec = await db.get('ByokKeys', provider);
  if (!rec) return null;
  try {
    const secret = _getDeviceSecret();
    const key    = await _deriveKey(secret, new Uint8Array(rec.salt));
    const plain  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(rec.iv) }, key, new Uint8Array(rec.ciphertext)
    );
    return dec.decode(plain);
  } catch { return null; }
}

export async function hasApiKey(provider) {
  const db = await getDB(); return !!(await db.get('ByokKeys', provider));
}
export async function deleteApiKey(provider) {
  const db = await getDB(); await db.delete('ByokKeys', provider);
}
export async function listStoredProviders() {
  const db = await getDB(); return (await db.getAll('ByokKeys')).map(k => k.provider);
}

// ── Bookmarks ─────────────────────────────────────────────
export async function toggleBookmark(osisId) {
  const db = await getDB();
  if (await db.get('Bookmarks', osisId)) {
    await db.delete('Bookmarks', osisId); return false;
  }
  await db.put('Bookmarks', { osisId, savedAt: Date.now() }); return true;
}
export async function isBookmarked(osisId) {
  const db = await getDB(); return !!(await db.get('Bookmarks', osisId));
}
export async function getAllBookmarks() {
  const db = await getDB(); return db.getAll('Bookmarks');
}
