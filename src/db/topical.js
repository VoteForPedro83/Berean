/* ============================================================
   topical.js — Nave's topical Bible + dictionary query layer
   ============================================================ */

let _dbWorker = null;
let _dbReady  = false;
let _initProm = null;

export function isTopicalReady() { return _dbReady; }

export async function initTopicalDb() {
  if (_dbReady)  return true;
  if (_initProm) return _initProm;
  _initProm = _doInit();
  return _initProm;
}

async function _doInit() {
  try {
    const probe = await fetch('/db/topical.sqlite3', { method: 'HEAD' });
    if (!probe.ok) { console.info('[topical.js] topical.sqlite3 not found'); return false; }

    const { createDbWorker } = await import('sql.js-httpvfs');
    _dbWorker = await createDbWorker(
      [{ from: 'inline', config: { serverMode: 'full', url: '/db/topical.sqlite3', requestChunkSize: 4096 } }],
      '/sqlite.worker.js', '/sql-wasm.wasm', 1024 * 1024 * 64
    );

    const topics = await _dbWorker.db.query(`SELECT COUNT(*) as n FROM nave_topics`);
    const dicts  = await _dbWorker.db.query(`SELECT COUNT(*) as n FROM dictionaries`);
    _dbReady = true;
    console.info(`[topical.js] ✅ Loaded — ${topics[0]?.n ?? 0} topics, ${dicts[0]?.n ?? 0} dictionary entries`);
    return true;
  } catch (err) {
    console.warn('[topical.js] Init failed:', err.message);
    return false;
  }
}

async function query(sql, params = []) {
  if (!_dbReady) return null;
  try { return await _dbWorker.db.query(sql, params); }
  catch (err) { console.error('[topical.js]', err); return null; }
}

/**
 * Get all Nave's topics that reference a specific verse (OSIS ID).
 */
export async function getTopicsForVerse(osisId) {
  await initTopicalDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT t.topic_id, t.topic_name, t.description
     FROM nave_topics t
     JOIN nave_verses v ON v.topic_id = t.topic_id
     WHERE v.osis_id = ?
     ORDER BY t.topic_name`,
    [osisId]
  );
  return rows || [];
}

/**
 * Search Nave's topics by name (FTS5).
 */
export async function searchTopics(term, limit = 20) {
  await initTopicalDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT t.topic_id, t.topic_name, t.description
     FROM nave_search s
     JOIN nave_topics t ON t.topic_id = s.rowid
     WHERE nave_search MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [term, limit]
  );
  return rows || [];
}

/**
 * Get all verses for a Nave's topic.
 */
export async function getTopicVerses(topicId) {
  await initTopicalDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT osis_id FROM nave_verses WHERE topic_id = ? ORDER BY osis_id`,
    [topicId]
  );
  return rows || [];
}

/**
 * Look up a term in a Bible dictionary (Easton's, Smith's, Hitchcock's).
 * Searches across all sources if no source specified.
 */
export async function getDictionaryEntry(term, source = null) {
  await initTopicalDb();
  if (!_dbReady) return [];

  let rows;
  if (source) {
    rows = await query(
      `SELECT entry_id, source, term, definition_html
       FROM dictionaries WHERE term = ? AND source = ?`,
      [term, source]
    );
  } else {
    rows = await query(
      `SELECT entry_id, source, term, definition_html
       FROM dictionaries WHERE LOWER(term) = LOWER(?)
       ORDER BY source`,
      [term]
    );
  }
  return rows || [];
}

/**
 * Search dictionary entries by term (FTS5).
 */
export async function searchDictionary(term, limit = 10) {
  await initTopicalDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT d.entry_id, d.source, d.term, d.definition_html
     FROM dict_search s
     JOIN dictionaries d ON d.entry_id = s.rowid
     WHERE dict_search MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [term, limit]
  );
  return rows || [];
}
