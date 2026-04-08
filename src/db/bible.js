/* ============================================================
   bible.js — Bible query layer
   Uses sql.js-httpvfs to query bible_base.sqlite3 in-browser.
   Falls back to mock data if the database is not yet available.
   ============================================================ */

import { getMockChapter, hasMockData, getMockVerse, MOCK_COVERAGE } from './mock-data.js';

// ── Translation licence map ───────────────────────────────────────────────────
// Re-exported here so UI components can import from one place.
// Canonical definitions live in src/ai/context.js.

/**
 * aiPermitted: true  — full text may be sent to AI providers
 * aiPermitted: false — use REFERENCE_RECALL or WEB_FALLBACK strategy
 * offline: true      — available from local SQLite without internet
 */
export const TRANSLATION_LICENCES = {
  BSB:   { aiPermitted: true,  offline: true,  label: 'Berean Standard Bible (CC0)' },
  WEB:   { aiPermitted: true,  offline: true,  label: 'World English Bible' },
  KJV:   { aiPermitted: true,  offline: true,  label: 'King James Version (1769)' },
  ASV:   { aiPermitted: true,  offline: true,  label: 'American Standard Version' },
  SBLGNT:{ aiPermitted: true,  offline: true,  label: 'SBL Greek New Testament' },
  ULT:   { aiPermitted: true,  offline: true,  label: 'unfoldingWord Literal Text' },
  UST:   { aiPermitted: true,  offline: true,  label: 'unfoldingWord Simplified Text' },
  ESV:   { aiPermitted: false, offline: false, label: 'English Standard Version' },
  NASB:  { aiPermitted: false, offline: false, label: 'New American Standard Bible' },
  CSB:   { aiPermitted: false, offline: false, label: 'Christian Standard Bible' },
  NET:   { aiPermitted: false, offline: false, label: 'New English Translation' },
  // NIV EXCLUDED ENTIRELY — Biblica prohibits NIV in any app with AI features
  AFR53: { aiPermitted: false, offline: false, label: 'Afrikaans 1933/53' },
  AFR83: { aiPermitted: false, offline: false, label: 'Afrikaans 1983' },
  AFR20: { aiPermitted: false, offline: false, label: 'Die Bybel 2020' },
  ZUL59: { aiPermitted: false, offline: false, label: 'IBhayibheli Elingcwele (Zulu)' },
  XHO75: { aiPermitted: false, offline: false, label: 'IziBhalo Ezingcwele (Xhosa)' },
  SSO61: { aiPermitted: false, offline: false, label: 'Bibele (Sesotho)' },
  TSW70: { aiPermitted: false, offline: false, label: 'Bebele (Tswana)' },
};

// ── State ────────────────────────────────────────────────────────────────────

let _dbWorker  = null;   // sql.js-httpvfs WorkerHttpvfs instance
let _dbReady   = false;  // true once database is loaded and verified
let _initError = null;   // stores any init error for diagnostics
let _initProm  = null;   // single init promise (prevents double-init)

/** Returns true when the real SQLite DB is loaded. */
export function isDbReady() { return _dbReady; }

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialise the sql.js-httpvfs worker and connect to bible_base.sqlite3.
 * Safe to call multiple times — will only run once.
 * Called automatically on first query, but can also be called eagerly from main.js.
 */
export async function initBibleDb() {
  if (_dbReady) return true;
  if (_initError) return false;
  if (_initProm)  return _initProm;

  _initProm = _doInit();
  return _initProm;
}

async function _doInit() {
  try {
    // Check if the database file exists before spending time on the worker
    const probe = await fetch('/db/bible_base.sqlite3', { method: 'HEAD' });
    if (!probe.ok) {
      console.info('[bible.js] bible_base.sqlite3 not found — using mock data');
      return false;
    }

    // Dynamically import the library
    const { createDbWorker } = await import('sql.js-httpvfs');

    // Worker and WASM are copied to public/ (run: cp node_modules/sql.js-httpvfs/dist/sqlite.worker.js public/)
    // This approach works reliably in both Vite dev mode and production build.
    const workerUrl = '/sqlite.worker.js';
    const wasmUrl   = '/sql-wasm.wasm';

    _dbWorker = await createDbWorker(
      [
        {
          from: 'inline',
          config: {
            serverMode:       'full',         // Single file — no chunking needed for dev
            url:              '/db/bible_base.sqlite3',
            requestChunkSize: 4096,           // Match SQLite page size (pragma page_size=4096)
          },
        },
      ],
      workerUrl,
      wasmUrl,
      1024 * 1024 * 128  // Max 128 MB to read (our DB is ~56 MB)
    );

    // Quick sanity check
    const check = await _dbWorker.db.query(
      `SELECT COUNT(*) as n FROM verses`
    );
    const verseCount = check[0]?.n ?? 0;

    if (verseCount < 1000) {
      throw new Error(`Database seems empty — only ${verseCount} verses found`);
    }

    _dbReady = true;
    console.info(`[bible.js] ✅ Real database loaded — ${verseCount.toLocaleString()} verses`);
    return true;

  } catch (err) {
    _initError = err;
    console.warn('[bible.js] Database init failed, falling back to mock data:', err.message);
    return false;
  }
}

// ── Query helpers ─────────────────────────────────────────────────────────────

async function query(sql, params = []) {
  if (!_dbReady) return null;
  try {
    return await _dbWorker.db.query(sql, params);
  } catch (err) {
    console.error('[bible.js] Query error:', err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get all verses for a chapter.
 * @returns {Promise<Array<{osisId, book, chapter, verse, text}>>}
 */
export async function getChapter(book, chapter) {
  // Ensure DB is initialised (no-op if already done or already failed)
  await initBibleDb();

  if (_dbReady) {
    const rows = await query(
      `SELECT osis_id, book, chapter, verse, text_web
       FROM verses
       WHERE book = ? AND chapter = ?
       ORDER BY verse`,
      [book, chapter]
    );

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        osisId:  r.osis_id,
        book:    r.book,
        chapter: r.chapter,
        verse:   r.verse,
        text:    r.text_web || '',
      }));
    }
  }

  // Fall back to mock data
  return getMockChapter(book, chapter);
}

/**
 * Get a single verse by OSIS ID (e.g. "JHN.3.16").
 * @returns {Promise<{osisId, book, chapter, verse, text} | null>}
 */
export async function getVerse(osisId) {
  await initBibleDb();

  if (_dbReady) {
    const rows = await query(
      `SELECT osis_id, book, chapter, verse, text_web
       FROM verses WHERE osis_id = ? LIMIT 1`,
      [osisId]
    );
    if (rows && rows[0]) {
      const r = rows[0];
      return {
        osisId:  r.osis_id,
        book:    r.book,
        chapter: r.chapter,
        verse:   r.verse,
        text:    r.text_web || '',
      };
    }
  }

  // Mock fallback
  const text = getMockVerse(osisId);
  if (!text) return null;
  const [b, ch, v] = osisId.split('.');
  return {
    osisId,
    book:    b,
    chapter: parseInt(ch, 10),
    verse:   parseInt(v, 10),
    text,
  };
}

/**
 * Fetch multiple verses by OSIS ID in a single query.
 * Returns array of { osis_id, text_web } rows.
 */
export async function getVerseBatch(osisIds) {
  await initBibleDb();
  if (!_dbReady || !osisIds.length) return [];

  // SQLite IN clause — build placeholders
  const placeholders = osisIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT osis_id, text_web FROM verses WHERE osis_id IN (${placeholders})`,
    osisIds
  );
  return rows || [];
}

/**
 * Check if a chapter has data available (real DB or mock).
 * Synchronous — returns true optimistically if DB is ready (all chapters available).
 */
export function hasChapterData(book, chapter) {
  if (_dbReady) return true;
  return hasMockData(book, chapter);
}

/**
 * Full-text search using FTS5.
 * @param {string} query   - Search query (plain text or FTS5 syntax)
 * @param {object} options - { limit: number, book: string }
 * @returns {Promise<Array<{osisId, book, chapter, verse, text, snippet}>>}
 */
export async function searchBible(queryStr, options = {}) {
  await initBibleDb();

  const limit = options.limit ?? 50;

  if (_dbReady) {
    try {
      // Filter directly on the FTS5 table's own book column — joining verses
      // and using v.book breaks FTS5 query planning.
      const bookFilter = options.book ? 'AND bs.book = ?' : '';
      const params     = options.book ? [queryStr, options.book, limit] : [queryStr, limit];

      const rows = await query(
        `SELECT v.osis_id, v.book, v.chapter, v.verse, v.text_web,
                snippet(bible_search, 2, '<mark>', '</mark>', '…', 20) as snippet
         FROM bible_search bs
         JOIN verses v ON v.osis_id = bs.osis_id
         WHERE bible_search MATCH ?
         ${bookFilter}
         ORDER BY rank
         LIMIT ?`,
        params
      );

      if (rows && rows.length > 0) {
        return rows.map(r => ({
          osisId:  r.osis_id,
          book:    r.book,
          chapter: r.chapter,
          verse:   r.verse,
          text:    r.text_web || '',
          snippet: r.snippet || r.text_web || '',
        }));
      }
    } catch (err) {
      console.warn('[bible.js] FTS search error:', err.message);
    }
  }

  // Mock fallback — simple substring search
  const q = queryStr.toLowerCase();
  const results = [];
  for (const { book, chapter } of MOCK_COVERAGE) {
    for (const v of getMockChapter(book, chapter)) {
      if (v.text.toLowerCase().includes(q)) {
        results.push({ ...v, snippet: v.text });
      }
    }
  }
  return results.slice(0, limit);
}

/**
 * Get all verses for a chapter in the KJV translation.
 * KJV text is stored in the text_kjv column of bible_base.sqlite3.
 * Returns [{osisId, verse, text}] — same shape as parallel.js expects.
 */
export async function getChapterKjv(book, chapter) {
  await initBibleDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT osis_id, verse, text_kjv
     FROM verses
     WHERE book = ? AND chapter = ?
     ORDER BY verse`,
    [book, chapter]
  );

  return (rows || [])
    .filter(r => r.text_kjv)
    .map(r => ({
      osisId: r.osis_id,
      verse:  r.verse,
      text:   r.text_kjv,
    }));
}

/**
 * Get a chapter in the Berean Standard Bible (CC0 public domain).
 * Returns [{osisId, verse, text}] — same shape as parallel.js expects.
 */
export async function getChapterBsb(book, chapter) {
  await initBibleDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT osis_id, verse, text_bsb
     FROM verses
     WHERE book = ? AND chapter = ?
     ORDER BY verse`,
    [book, chapter]
  );

  return (rows || [])
    .filter(r => r.text_bsb)
    .map(r => ({
      osisId: r.osis_id,
      verse:  r.verse,
      text:   r.text_bsb,
    }));
}

/**
 * Get all words for a verse (Greek or Hebrew interlinear data).
 * @returns {Promise<Array<{surface_text, transliteration, lemma, strongs, morphology, english_gloss, is_hapax, language}>>}
 */
export async function getVerseWords(osisId) {
  await initBibleDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT surface_text, transliteration, lemma, strongs, morphology,
            english_gloss, is_hapax, language
     FROM words
     WHERE verse_osis = ?
     ORDER BY word_sort`,
    [osisId]
  );

  return rows || [];
}

/**
 * Get all verses containing a specific Strong's number.
 * Used for concordance view.
 * @returns {Promise<Array<{osisId, book, chapter, verse, text}>>}
 */
export async function getStrongsConcordance(strongsNum, limit = 200) {
  await initBibleDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT DISTINCT v.osis_id, v.book, v.chapter, v.verse, v.text_web
     FROM words w
     JOIN verses v ON v.osis_id = w.verse_osis
     WHERE w.strongs = ?
     ORDER BY v.book, v.chapter, v.verse
     LIMIT ?`,
    [strongsNum, limit]
  );

  return (rows || []).map(r => ({
    osisId:  r.osis_id,
    book:    r.book,
    chapter: r.chapter,
    verse:   r.verse,
    text:    r.text_web || '',
  }));
}

/**
 * Get database stats (for debug/settings display).
 */
export async function getDbStats() {
  if (!_dbReady) return null;
  try {
    return _dbWorker.worker.getStats?.();
  } catch {
    return null;
  }
}
