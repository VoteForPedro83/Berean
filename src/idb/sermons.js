/* ============================================================
   sermons.js — Sermon CRUD operations (IndexedDB)
   ============================================================ */
import { getDB } from './schema.js';

/**
 * Create a new sermon and return the full record.
 */
export async function createSermon({ title = 'Untitled Sermon', osisAnchor = '', seriesId = '' } = {}) {
  const db = await getDB();
  const sermon = {
    id: crypto.randomUUID(),
    title,
    osisAnchor,
    seriesId,
    content: null,   // TipTap JSON stored here
    wordCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await db.put('Sermons', sermon);
  return sermon;
}

export async function getSermon(id) {
  const db = await getDB();
  return (await db.get('Sermons', id)) ?? null;
}

export async function updateSermon(id, updates) {
  const db = await getDB();
  const existing = await db.get('Sermons', id);
  if (!existing) throw new Error(`Sermon ${id} not found`);
  const updated = { ...existing, ...updates, updatedAt: Date.now() };
  await db.put('Sermons', updated);
  return updated;
}

export async function deleteSermon(id) {
  const db = await getDB();
  await db.delete('Sermons', id);
}

/**
 * List all sermons, newest first.
 */
export async function listSermons() {
  const db = await getDB();
  const all = await db.getAll('Sermons');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Append-only revision snapshot (for future undo/history UI).
 */
export async function saveRevision(sermonId, content) {
  const db = await getDB();
  const rev = {
    revisionId: crypto.randomUUID(),
    sermonId,
    content,
    createdAt: Date.now(),
  };
  await db.put('SermonRevisions', rev);
  return rev;
}
