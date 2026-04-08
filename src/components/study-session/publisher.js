/* ============================================================
   publisher.js — Study pack serialization and sharing

   Two sharing modes:
   1. URL-encoded (small packs < 10KB compressed):
      JSON → gzip (CompressionStream) → base64url → URL fragment
      Works fully offline, no server needed.

   2. KV Worker (large packs ≥ 10KB compressed):
      JSON → POST to /api/study/:id with Bearer token
      Requires deployed Cloudflare Worker + PREACHER_SECRET.

   Participant URLs:
   - URL-encoded: https://berean.app/#study=<base64url>
   - KV-backed:   https://berean.app/s/<id>
   ============================================================ */

const URL_MAX_BYTES = 10_000;  // Switch to KV above this

/**
 * Publish a study pack. Returns { url, method }.
 * method is 'url' (fragment-encoded) or 'kv' (Worker upload).
 */
export async function publishStudyPack(pack, workerToken = null) {
  // Strip IDB-only fields before sharing.
  // For URL-encoded packs, omit scripture text (participants can look it up)
  // to keep the URL short enough for QR codes (~4000 char limit).
  const shareable = {
    id:        pack.id,
    title:     pack.title,
    passage:   pack.passage,
    sections:  pack.sections,
  };

  const json = JSON.stringify(shareable);
  const compressed = await _compress(json);
  const encoded = _toBase64Url(compressed);

  // If small enough, use URL fragment
  if (encoded.length < URL_MAX_BYTES) {
    const url = `${window.location.origin}${window.location.pathname}#study=${encoded}`;
    return { url, method: 'url' };
  }

  // Large pack → try KV Worker
  if (workerToken) {
    try {
      const workerUrl = `${window.location.origin}/api/study/${pack.id}`;
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${workerToken}`,
        },
        body: json,
      });
      if (res.ok) {
        const url = `${window.location.origin}/s/${pack.id}`;
        return { url, method: 'kv' };
      }
    } catch (err) {
      console.warn('[publisher] KV upload failed, falling back to URL:', err);
    }
  }

  // Fallback: URL fragment even if large (may be truncated by some browsers)
  const url = `${window.location.origin}${window.location.pathname}#study=${encoded}`;
  return { url, method: 'url' };
}

/**
 * Decode a study pack from a URL fragment.
 * Returns the parsed study pack object, or null on failure.
 */
export async function decodeStudyFromFragment(fragment) {
  try {
    const encoded = fragment.replace(/^#?study=/, '');
    if (!encoded) return null;
    const compressed = _fromBase64Url(encoded);
    const json = await _decompress(compressed);
    return JSON.parse(json);
  } catch (err) {
    console.error('[publisher] Failed to decode study fragment:', err);
    return null;
  }
}

/**
 * Fetch a study pack from the KV Worker.
 */
export async function fetchStudyFromKv(id) {
  try {
    const res = await fetch(`/api/study/${id}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[publisher] Failed to fetch study from KV:', err);
    return null;
  }
}

// ── Compression (gzip via CompressionStream) ─────────────────

async function _compress(text) {
  const encoder = new TextEncoder();
  const input = encoder.encode(text);
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function _decompress(compressed) {
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}

// ── Base64url encoding (URL-safe, no padding) ────────────────

function _toBase64Url(uint8) {
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
