/* ============================================================
   narrative.js — Query layer for narrative.sqlite3

   Provides people, places, and events for a given passage.
   Uses sql.js-httpvfs (same worker pool as bible.js).

   All exported functions return empty arrays gracefully if the
   database is not yet available.
   ============================================================ */

import { DB_CHUNKS } from './chunks-manifest.js';
import { createDbWorker } from 'sql.js-httpvfs';

// ── Book code mapping ──────────────────────────────────────
// Our app uses SBL-style all-caps OSIS codes (JHN, EZK, 1KI).
// Theographic uses a different convention (John, Ezek, 1Kgs).
// This map converts ours → theirs for SQL queries.
const OSIS_TO_THEOGRAPHIC = {
  GEN: 'Gen',   EXO: 'Exod',  LEV: 'Lev',   NUM: 'Num',   DEU: 'Deut',
  JOS: 'Josh',  JDG: 'Judg',  RUT: 'Ruth',  '1SA': '1Sam','2SA': '2Sam',
  '1KI': '1Kgs','2KI': '2Kgs','1CH': '1Chr','2CH': '2Chr', EZR: 'Ezra',
  NEH: 'Neh',   EST: 'Esth',  JOB: 'Job',   PSA: 'Ps',    PRO: 'Prov',
  ECC: 'Eccl',  SNG: 'Song',  ISA: 'Isa',   JER: 'Jer',   LAM: 'Lam',
  EZK: 'Ezek',  DAN: 'Dan',   HOS: 'Hos',   JOL: 'Joel',  AMO: 'Amos',
  OBA: 'Obad',  JON: 'Jonah', MIC: 'Mic',   NAH: 'Nah',   HAB: 'Hab',
  ZEP: 'Zeph',  HAG: 'Hag',   ZEC: 'Zech',  MAL: 'Mal',
  MAT: 'Matt',  MRK: 'Mark',  LUK: 'Luke',  JHN: 'John',  ACT: 'Acts',
  ROM: 'Rom',   '1CO': '1Cor','2CO': '2Cor', GAL: 'Gal',   EPH: 'Eph',
  PHP: 'Phil',  COL: 'Col',   '1TH': '1Thess','2TH': '2Thess',
  '1TI': '1Tim','2TI': '2Tim', TIT: 'Titus', PHM: 'Phlm',  HEB: 'Heb',
  JAS: 'Jas',   '1PE': '1Pet','2PE': '2Pet','1JN': '1John','2JN': '2John',
  '3JN': '3John', JUD: 'Jude',  REV: 'Rev',
};

function _tgBook(osisCode) {
  return OSIS_TO_THEOGRAPHIC[osisCode] ?? osisCode;
}

// Reverse map for converting DB results back to app OSIS codes
const THEOGRAPHIC_TO_OSIS = Object.fromEntries(
  Object.entries(OSIS_TO_THEOGRAPHIC).map(([k, v]) => [v, k])
);

let _worker = null;
let _initProm = null;
let _ready = false;

async function _init() {
  if (_ready) return true;
  if (_initProm) return _initProm;
  _initProm = _doInit();
  return _initProm;
}

async function _doInit() {
  try {
    _worker = await createDbWorker(
      [{ from: 'inline', ...DB_CHUNKS.narrative }],
      '/sqlite.worker.js',
      '/sql-wasm.wasm',
      1024 * 1024 * 64  // 64MB max
    );

    // Sanity check
    const check = await _worker.db.query('SELECT COUNT(*) as n FROM events');
    if ((check[0]?.n ?? 0) < 1) throw new Error('events table empty');

    _ready = true;
    console.info('[narrative.js] ✅ narrative.sqlite3 ready');
    return true;
  } catch (err) {
    console.warn('[narrative.js] Init failed:', err.message);
    return false;
  }
}

async function _query(sql, params = []) {
  const ok = await _init();
  if (!ok) return [];
  return _worker.db.query(sql, params);
}

// ── Public API ─────────────────────────────────────────────

/**
 * Get all events that have verses in the given book+chapter.
 * Returns [{id, title, start_date, duration}]
 */
export async function getEventsForChapter(osisBook, osisChapter) {
  return _query(`
    SELECT DISTINCT e.id, e.title, e.start_date, e.duration
    FROM events e
    JOIN event_verses ev ON ev.event_id = e.id
    JOIN verse_refs vr ON vr.theographic_id = ev.verse_id
    WHERE vr.osis_book = ? AND vr.osis_chapter = ?
    ORDER BY e.start_date
  `, [_tgBook(osisBook), osisChapter]);
}

/**
 * Get all people mentioned in the given book+chapter.
 * Returns [{id, name, gender, birth_year, death_year}]
 */
export async function getPeopleForChapter(osisBook, osisChapter) {
  return _query(`
    SELECT DISTINCT p.id, p.name, p.gender, p.birth_year, p.death_year
    FROM people p
    JOIN person_verses pv ON pv.person_id = p.id
    JOIN verse_refs vr ON vr.theographic_id = pv.verse_id
    WHERE vr.osis_book = ? AND vr.osis_chapter = ?
      AND p.name != ''
    ORDER BY p.name
  `, [_tgBook(osisBook), osisChapter]);
}

/**
 * Get all places mentioned in the given book+chapter.
 * Returns [{id, name, latitude, longitude, feature_type}]
 */
export async function getPlacesForChapter(osisBook, osisChapter) {
  return _query(`
    SELECT DISTINCT pl.id, pl.name, pl.latitude, pl.longitude, pl.feature_type
    FROM places pl
    JOIN place_verses plv ON plv.place_id = pl.id
    JOIN verse_refs vr ON vr.theographic_id = plv.verse_id
    WHERE vr.osis_book = ? AND vr.osis_chapter = ?
      AND pl.name != ''
    ORDER BY pl.name
  `, [_tgBook(osisBook), osisChapter]);
}

/**
 * Get co-occurrence edges: pairs of people who appear in the same verse
 * within a given book+chapter. Used for the entity graph.
 * Returns [{person_a, person_b, shared_verses}]
 */
export async function getPeopleCoOccurrences(osisBook, osisChapter) {
  return _query(`
    SELECT pv1.person_id AS person_a, pv2.person_id AS person_b,
           COUNT(*) AS shared_verses
    FROM person_verses pv1
    JOIN person_verses pv2 ON pv1.verse_id = pv2.verse_id AND pv1.person_id < pv2.person_id
    JOIN verse_refs vr ON vr.theographic_id = pv1.verse_id
    WHERE vr.osis_book = ? AND vr.osis_chapter = ?
    GROUP BY pv1.person_id, pv2.person_id
    HAVING COUNT(*) >= 1
  `, [_tgBook(osisBook), osisChapter]);
}

/**
 * Get person-place co-occurrences for a chapter.
 * Returns [{person_id, place_id, shared_verses}]
 */
export async function getPersonPlaceLinks(osisBook, osisChapter) {
  return _query(`
    SELECT pv.person_id, plv.place_id, COUNT(*) AS shared_verses
    FROM person_verses pv
    JOIN place_verses plv ON pv.verse_id = plv.verse_id
    JOIN verse_refs vr ON vr.theographic_id = pv.verse_id
    WHERE vr.osis_book = ? AND vr.osis_chapter = ?
    GROUP BY pv.person_id, plv.place_id
  `, [_tgBook(osisBook), osisChapter]);
}

/**
 * Get the year range for a chapter.
 * Prefers event-derived dates (semantically correct) over raw verse year_num,
 * which can be misleading — e.g. John 1 has year_num≈-4004 on its prologue
 * verses because they reference creation, not because the chapter occurs then.
 * Falls back to verse_refs.year_num only when no events exist for the chapter.
 * Returns {min_year, max_year} or null.
 */
export async function getChapterYearRange(osisBook, osisChapter) {
  // Try events first
  const eventRows = await _query(`
    SELECT MIN(CAST(e.start_date AS INTEGER)) AS min_year,
           MAX(CAST(e.start_date AS INTEGER)) AS max_year
    FROM events e
    JOIN event_verses ev ON ev.event_id = e.id
    JOIN verse_refs vr   ON vr.theographic_id = ev.verse_id
    WHERE vr.osis_book = ? AND vr.osis_chapter = ?
      AND e.start_date IS NOT NULL AND e.start_date != ''
  `, [_tgBook(osisBook), osisChapter]);

  if (eventRows.length && eventRows[0].min_year != null) return eventRows[0];

  // Fallback: raw verse year_num
  const verseRows = await _query(`
    SELECT MIN(year_num) AS min_year, MAX(year_num) AS max_year
    FROM verse_refs
    WHERE osis_book = ? AND osis_chapter = ?
      AND year_num IS NOT NULL
  `, [_tgBook(osisBook), osisChapter]);

  if (!verseRows.length || verseRows[0].min_year == null) return null;
  return verseRows[0];
}

/**
 * Get the biblical period label for a chapter based on its year range.
 * Returns a string like "United Monarchy · ~1010 BC" or null.
 */
export async function getChapterPeriodLabel(osisBook, osisChapter) {
  const range = await getChapterYearRange(osisBook, osisChapter);
  if (!range) return null;
  const year = range.min_year;
  const period = _periodForYear(year);
  const yearLabel = year < 0 ? `~${Math.abs(year)} BC` : `~${year} AD`;
  return period ? `${period} · ${yearLabel}` : yearLabel;
}

/**
 * Verse numbers in a chapter where a specific person appears.
 * Used for reading-pane entity highlight on graph node tap.
 * Returns [{osis_verse}]
 */
export async function getVerseNumbersForPerson(personId, osisBook, osisChapter) {
  return _query(`
    SELECT DISTINCT vr.osis_verse
    FROM person_verses pv
    JOIN verse_refs vr ON vr.theographic_id = pv.verse_id
    WHERE pv.person_id = ? AND vr.osis_book = ? AND vr.osis_chapter = ?
    ORDER BY vr.osis_verse
  `, [personId, _tgBook(osisBook), osisChapter]);
}

// ── Book-scope queries (for timeline vertical feed) ───────

/**
 * All events in a book, each tagged with the earliest chapter they appear in.
 * Returns [{id, title, start_date, duration, first_chapter}]
 */
export async function getEventsForBook(osisBook) {
  return _query(`
    SELECT DISTINCT e.id, e.title, e.start_date, e.duration,
           MIN(vr.osis_chapter) AS first_chapter
    FROM events e
    JOIN event_verses ev ON ev.event_id = e.id
    JOIN verse_refs vr ON vr.theographic_id = ev.verse_id
    WHERE vr.osis_book = ?
    GROUP BY e.id
    ORDER BY first_chapter, e.start_date
  `, [_tgBook(osisBook)]);
}

/**
 * All people mentioned in a book, tagged with their first appearance chapter.
 * Returns [{id, name, gender, birth_year, death_year, first_chapter}]
 */
export async function getPeopleForBook(osisBook) {
  return _query(`
    SELECT DISTINCT p.id, p.name, p.gender, p.birth_year, p.death_year,
           MIN(vr.osis_chapter) AS first_chapter
    FROM people p
    JOIN person_verses pv ON pv.person_id = p.id
    JOIN verse_refs vr ON vr.theographic_id = pv.verse_id
    WHERE vr.osis_book = ? AND p.name != ''
    GROUP BY p.id
    ORDER BY first_chapter, p.name
  `, [_tgBook(osisBook)]);
}

/**
 * All places mentioned in a book, tagged with their first appearance chapter.
 * Returns [{id, name, latitude, longitude, feature_type, first_chapter}]
 */
export async function getPlacesForBook(osisBook) {
  return _query(`
    SELECT DISTINCT pl.id, pl.name, pl.latitude, pl.longitude,
           pl.feature_type, MIN(vr.osis_chapter) AS first_chapter
    FROM places pl
    JOIN place_verses plv ON plv.place_id = pl.id
    JOIN verse_refs vr ON vr.theographic_id = plv.verse_id
    WHERE vr.osis_book = ? AND pl.name != ''
    GROUP BY pl.id
    ORDER BY first_chapter, pl.name
  `, [_tgBook(osisBook)]);
}

/**
 * First verse reference for an event — used for click-to-navigate.
 * Returns {book, chapter, verse} in app OSIS format, or null.
 */
export async function getFirstVerseForEvent(eventId) {
  const rows = await _query(`
    SELECT vr.osis_book, vr.osis_chapter, vr.osis_verse
    FROM event_verses ev
    JOIN verse_refs vr ON vr.theographic_id = ev.verse_id
    WHERE ev.event_id = ?
    ORDER BY vr.osis_chapter, vr.osis_verse
    LIMIT 1
  `, [eventId]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    book:    THEOGRAPHIC_TO_OSIS[r.osis_book] ?? r.osis_book.toUpperCase(),
    chapter: r.osis_chapter,
    verse:   r.osis_verse,
  };
}

// ── Biblical period lookup ────────────────────────────────
// Approximate ranges based on standard evangelical chronology.
function _periodForYear(year) {
  if (year == null) return null;
  if (year < -2000) return 'Antediluvian / Patriarchs';
  if (year < -1800) return 'Early Patriarchs';
  if (year < -1446) return 'Patriarchs in Egypt';
  if (year < -1406) return 'Exodus & Wilderness';
  if (year < -1050) return 'Conquest & Judges';
  if (year < -931)  return 'United Monarchy';
  if (year < -722)  return 'Divided Kingdom';
  if (year < -586)  return 'Late Judah';
  if (year < -539)  return 'Babylonian Exile';
  if (year < -400)  return 'Persian Period';
  if (year < -332)  return 'Late Persian Period';
  if (year < -63)   return 'Hellenistic Period';
  if (year < 6)     return 'Roman Period (Late BC)';
  if (year < 30)    return 'Life of Christ';
  if (year < 70)    return 'Apostolic Age';
  if (year < 100)   return 'Late Apostolic Age';
  return 'Post-Apostolic';
}
