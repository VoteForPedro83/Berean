/* ============================================================
   clippings.js — IndexedDB helpers for ClippingsTray store
   Each record: { clipId, osisId, osisEnd, reference, text, timestamp, sermonId }
   ============================================================ */
import { getDB } from './schema.js';

/**
 * Save a new clipping to IDB.
 * @param {object} opts
 * @param {string} opts.osisId     — first verse OSIS (e.g. "JHN.3.16")
 * @param {string} [opts.osisEnd]  — last verse OSIS for a range (defaults to osisId)
 * @param {string} opts.reference  — human label (e.g. "John 3:16–18")
 * @param {string} opts.text       — plain verse text(s)
 * @returns {Promise<object>}      — the saved record
 */
export async function addClipping({ osisId, osisEnd, reference, text }) {
  const db  = await getDB();
  const rec = {
    clipId:    crypto.randomUUID(),
    osisId,
    osisEnd:   osisEnd || osisId,
    reference,
    text,
    timestamp: Date.now(),
    sermonId:  null,
  };
  await db.put('ClippingsTray', rec);
  return rec;
}

/** Return all clippings, newest first. */
export async function getAllClippings() {
  try {
    const db  = await getDB();
    const all = await db.getAll('ClippingsTray');
    return all.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

/** Delete a single clipping by clipId. */
export async function deleteClipping(clipId) {
  const db = await getDB();
  await db.delete('ClippingsTray', clipId);
}

/** Count of all pending clippings. */
export async function getClippingCount() {
  try {
    const db = await getDB();
    return await db.count('ClippingsTray');
  } catch {
    return 0;
  }
}
