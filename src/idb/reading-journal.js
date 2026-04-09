/* ============================================================
   reading-journal.js — IDB CRUD + aggregation for ReadingJournal
   ============================================================ */
import { getDB } from './schema.js';

function _newId() {
  return crypto.randomUUID().slice(0, 8);
}

function _dateFields(ms = Date.now()) {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return { year, yearMonth: `${year}-${month}` };
}

// ── Write ─────────────────────────────────────────────────

export async function logRead(osisRef, book, chapter, { note = '', sessionId = null } = {}) {
  const db = await getDB();
  const { year, yearMonth } = _dateFields();
  const record = {
    id: _newId(),
    osisRef,       // e.g. "JHN.3"
    book,          // e.g. "JHN"
    chapter,       // e.g. 3
    readAt: Date.now(),
    year,          // e.g. 2026
    yearMonth,     // e.g. "2026-04"
    note,
    sessionId,
  };
  await db.put('ReadingJournal', record);
  return record;
}

export async function updateNote(id, note) {
  const db = await getDB();
  const record = await db.get('ReadingJournal', id);
  if (!record) return;
  record.note = note;
  await db.put('ReadingJournal', record);
}

export async function deleteRead(id) {
  const db = await getDB();
  await db.delete('ReadingJournal', id);
}

/** Remove all read entries for a chapter (used to toggle unread). */
export async function deleteAllReadsForChapter(osisRef) {
  const db = await getDB();
  const records = await db.getAllFromIndex('ReadingJournal', 'osisRef', osisRef);
  await Promise.all(records.map(r => db.delete('ReadingJournal', r.id)));
}

// ── Read ──────────────────────────────────────────────────

// All reads, newest first
export async function getAllReads() {
  const db = await getDB();
  const all = await db.getAllFromIndex('ReadingJournal', 'readAt');
  return all.reverse();
}

// Set of osisRefs (e.g. "JHN.3") read in a given calendar year
export async function getReadOsisRefsForYear(year) {
  const db = await getDB();
  const records = await db.getAllFromIndex('ReadingJournal', 'year', year);
  return new Set(records.map(r => r.osisRef));
}

// Set of all osisRefs ever read (for all-time coverage)
export async function getAllReadOsisRefs() {
  const db = await getDB();
  const all = await db.getAll('ReadingJournal');
  return new Set(all.map(r => r.osisRef));
}

// How many times has this specific chapter been read?
export async function getChapterReadCount(osisRef) {
  const db = await getDB();
  const records = await db.getAllFromIndex('ReadingJournal', 'osisRef', osisRef);
  return records.length;
}

// Monthly read counts: [{yearMonth, count}] sorted chronologically
export async function getMonthlyReadCounts() {
  const db = await getDB();
  const all = await db.getAll('ReadingJournal');
  const counts = {};
  for (const r of all) {
    counts[r.yearMonth] = (counts[r.yearMonth] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, count]) => ({ yearMonth, count }));
}
