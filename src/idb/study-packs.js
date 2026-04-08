/* ============================================================
   study-packs.js — StudyPacks IDB CRUD
   ============================================================ */
import { getDB } from './schema.js';

/**
 * Create a study pack and return the record.
 */
export async function createStudyPack(pack) {
  const db = await getDB();
  const record = {
    id:        pack.id || _shortId(),
    title:     pack.title || 'Untitled Study',
    passage:   pack.passage || '',
    osisRef:   pack.osisRef || '',
    scripture: pack.scripture || '',
    sections:  pack.sections || [],
    sermonId:  pack.sermonId || null,
    createdAt: Date.now(),
    status:    'draft',
  };
  await db.put('StudyPacks', record);
  return record;
}

export async function getStudyPack(id) {
  const db = await getDB();
  return (await db.get('StudyPacks', id)) ?? null;
}

export async function updateStudyPack(id, updates) {
  const db = await getDB();
  const existing = await db.get('StudyPacks', id);
  if (!existing) throw new Error(`Study pack ${id} not found`);
  const updated = { ...existing, ...updates };
  await db.put('StudyPacks', updated);
  return updated;
}

export async function deleteStudyPack(id) {
  const db = await getDB();
  await db.delete('StudyPacks', id);
}

export async function listStudyPacks() {
  const db = await getDB();
  const all = await db.getAll('StudyPacks');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Generate a short 8-char alphanumeric ID */
function _shortId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  const arr = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) id += chars[arr[i] % chars.length];
  return id;
}
