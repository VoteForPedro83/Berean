/* ============================================================
   commentaries.js — Commentary query layer
   ============================================================ */

let _dbWorker = null;
let _dbReady  = false;
let _initProm = null;

export function isCommentaryReady() { return _dbReady; }

export async function initCommentaryDb() {
  if (_dbReady)  return true;
  if (_initProm) return _initProm;
  _initProm = _doInit();
  return _initProm;
}

async function _doInit() {
  try {
    const probe = await fetch('/db/commentaries.sqlite3', { method: 'HEAD' });
    if (!probe.ok) { console.info('[commentaries.js] commentaries.sqlite3 not found'); return false; }

    const { createDbWorker } = await import('sql.js-httpvfs');
    _dbWorker = await createDbWorker(
      [{ from: 'inline', config: { serverMode: 'full', url: '/db/commentaries.sqlite3', requestChunkSize: 4096 } }],
      '/sqlite.worker.js', '/sql-wasm.wasm', 1024 * 1024 * 128
    );

    const check = await _dbWorker.db.query(`SELECT COUNT(*) as n FROM commentaries`);
    const count = check[0]?.n ?? 0;
    _dbReady = true;
    console.info(`[commentaries.js] ✅ Loaded — ${count.toLocaleString()} entries`);
    return true;
  } catch (err) {
    console.warn('[commentaries.js] Init failed:', err.message);
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
