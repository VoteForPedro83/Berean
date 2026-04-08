/* ============================================================
   ai-notes.js — IDB persistence for AI Panel responses

   One record per passage+mode combination.
   Key: "{osisRef}_{mode}" e.g. "JHN.3.16_plain"
   ============================================================ */
import { getDB } from './schema.js';

const STORE = 'AiNotes';

/**
 * Save (or overwrite) an AI panel response.
 */
export async function saveAiNote(osisRef, book, mode, modeName, passageLabel, content) {
  const db = await getDB();
  await db.put(STORE, {
    noteId: `${osisRef}_${mode}`,
    osisRef, book, mode, modeName, passageLabel, content,
    generatedAt: Date.now(),
  });
}

/**
 * Load all saved notes for a passage (all modes).
 * Returns an array sorted newest-first.
 */
export async function loadAiNotesForPassage(osisRef) {
  const db  = await getDB();
  const all = await db.getAllFromIndex(STORE, 'osisRef', osisRef);
  return all.sort((a, b) => b.generatedAt - a.generatedAt);
}

/**
 * Load a specific note by passage + mode.
 */
export async function loadAiNote(osisRef, mode) {
  const db = await getDB();
  return db.get(STORE, `${osisRef}_${mode}`);
}

/**
 * Delete a specific note.
 */
export async function deleteAiNote(osisRef, mode) {
  const db = await getDB();
  return db.delete(STORE, `${osisRef}_${mode}`);
}
