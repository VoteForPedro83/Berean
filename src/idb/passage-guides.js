/* ============================================================
   passage-guides.js — IDB persistence for AI Passage Guides

   One record per passage reference (osisRef).
   If the same passage is regenerated, the record is overwritten.
   ============================================================ */
import { getDB } from './schema.js';

const STORE = 'PassageGuides';

/**
 * Save (or overwrite) a passage guide.
 * @param {string} osisRef     — e.g. "JHN.3.16" or "JHN.3.16-20"
 * @param {string} book        — e.g. "JHN"
 * @param {string} passageLabel — e.g. "John 3:16"
 * @param {object} sections    — { historical, literary, crossrefs, theological, language }
 */
export async function savePassageGuide(osisRef, book, passageLabel, sections) {
  const db = await getDB();
  await db.put(STORE, { osisRef, book, passageLabel, sections, generatedAt: Date.now() });
}

/**
 * Load a saved guide. Returns the record or undefined.
 */
export async function loadPassageGuide(osisRef) {
  const db = await getDB();
  return db.get(STORE, osisRef);
}

/**
 * Delete a saved guide (e.g. when user clicks Regenerate).
 */
export async function deletePassageGuide(osisRef) {
  const db = await getDB();
  return db.delete(STORE, osisRef);
}
