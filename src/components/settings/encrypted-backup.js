/* ============================================================
   encrypted-backup.js — AES-GCM encrypted export/import

   Exports ALL IDB data as an encrypted .berean file.
   Password → PBKDF2 → AES-256-GCM key → encrypt JSON.

   File format (binary):
   [4 bytes magic "BREN"] [1 byte version=1]
   [16 bytes salt] [12 bytes IV] [encrypted JSON...]

   This is a standalone backup — no cloud required.
   ============================================================ */

import { exportAllData, importAllData } from './cloud-sync.js';

const MAGIC   = new TextEncoder().encode('BREN');
const VERSION = 1;

// ── Export (encrypt + download) ───────────────────────────

export async function exportEncryptedBackup(password) {
  if (!password) throw new Error('Password required');

  const json = await exportAllData();
  const plaintext = new TextEncoder().encode(json);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await _deriveKey(password, salt);

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  );

  // Assemble file: magic(4) + version(1) + salt(16) + iv(12) + ciphertext
  const file = new Uint8Array(4 + 1 + 16 + 12 + ciphertext.length);
  file.set(MAGIC,      0);
  file.set([VERSION],  4);
  file.set(salt,       5);
  file.set(iv,        21);
  file.set(ciphertext,33);

  const date = new Date().toISOString().slice(0,10);
  _downloadBinary(file, `berean-backup-${date}.berean`);
}

// ── Import (decrypt + restore) ────────────────────────────

export async function importEncryptedBackup(file, password) {
  if (!password) throw new Error('Password required');

  const buffer = new Uint8Array(await file.arrayBuffer());

  // Validate magic bytes
  const magic = buffer.slice(0, 4);
  if (String.fromCharCode(...magic) !== 'BREN') {
    throw new Error('Not a valid Berean backup file');
  }

  const version = buffer[4];
  if (version !== VERSION) throw new Error(`Unsupported backup version: ${version}`);

  const salt       = buffer.slice(5, 21);
  const iv         = buffer.slice(21, 33);
  const ciphertext = buffer.slice(33);

  const key = await _deriveKey(password, salt);

  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Wrong password or corrupted file');
  }

  const json = new TextDecoder().decode(plaintext);
  await importAllData(json);
}

// ── Key derivation ────────────────────────────────────────

async function _deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Download helper ───────────────────────────────────────

function _downloadBinary(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
