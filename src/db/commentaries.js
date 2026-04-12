/* ============================================================
   commentaries.js — Commentary query layer
   ============================================================ */

let _dbWorker  = null;
let _dbReady   = false;
let _initProm  = null;
let _lastError = null;   // exposed so the UI can show a helpful message

export function isCommentaryReady() { return _dbReady; }
export function getCommentaryError() { return _lastError; }

export async function initCommentaryDb() {
  if (_dbReady)  return true;
  if (_initProm) return _initProm;
  _lastError = null;
  _initProm = _doInit();
  return _initProm;
}

/** Reset so the DB can be retried after a failure. */
export function resetCommentaryDb() {
  if (_dbReady) return;   // already working, don't reset
  _dbWorker = null;
  _dbReady  = false;
  _initProm = null;
  _lastError = null;
}

async function _doInit() {
  try {
    const { DB_CHUNKS }      = await import('./chunks-manifest.js');
    const { createDbWorker } = await import('sql.js-httpvfs');

    if (!DB_CHUNKS.commentaries) {
      console.info('[commentaries.js] commentaries not in chunks manifest — skipping');
      return false;
    }

    _dbWorker = await createDbWorker(
      [{ from: 'inline', config: DB_CHUNKS.commentaries }],
      '/sqlite.worker.js', '/sql-wasm.wasm', 1024 * 1024 * 128
    );

    // Use a cheap 1-row probe — COUNT(*) triggers a full index scan across all
    // 13 chunk files (313 MB total), making the first load extremely slow.
    const check = await _dbWorker.db.query(
      `SELECT book_id FROM commentaries LIMIT 1`
    );
    _dbReady = check.length > 0;
    console.info(`[commentaries.js] ✅ Loaded (probe ok: ${_dbReady})`);
    return true;
  } catch (err) {
    _lastError = err.message || String(err);
    console.error('[commentaries.js] Init failed:', err);
    return false;
  }
}

async function query(sql, params = []) {
  if (!_dbReady) return null;
  try { return await _dbWorker.db.query(sql, params); }
  catch (err) { console.error('[commentaries.js]', err); return null; }
}

/**
 * Get all commentary entries for a passage.
 * Returns all sources (MHC, JFB, BARNES) sorted by source then verse.
 */
export async function getCommentaries(book, chapter) {
  await initCommentaryDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT id, book_id, chapter, verse_start, verse_end, source_abbr, author, html_content
     FROM commentaries
     WHERE book_id = ? AND chapter = ?
     ORDER BY source_abbr, verse_start`,
    [book, chapter]
  );
  return rows || [];
}

/** Get commentary for a single verse (all sources). */
export async function getVerseCommentary(book, chapter, verse) {
  await initCommentaryDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT source_abbr, author, html_content, verse_start, verse_end
     FROM commentaries
     WHERE book_id = ? AND chapter = ?
       AND verse_start <= ? AND verse_end >= ?
     ORDER BY source_abbr, verse_start`,
    [book, chapter, verse, verse]
  );
  return rows || [];
}
