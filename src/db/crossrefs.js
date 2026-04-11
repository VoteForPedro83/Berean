/* ============================================================
   crossrefs.js — Cross-reference query layer
   ============================================================ */

let _dbWorker = null;
let _dbReady  = false;
let _initProm = null;

export function isCrossRefsReady() { return _dbReady; }

export async function initCrossRefsDb() {
  if (_dbReady)  return true;
  if (_initProm) return _initProm;
  _initProm = _doInit();
  return _initProm;
}

async function _doInit() {
  try {
    const { DB_CHUNKS }      = await import('./chunks-manifest.js');
    const { createDbWorker } = await import('sql.js-httpvfs');
    _dbWorker = await createDbWorker(
      [{ from: 'inline', config: DB_CHUNKS.cross_refs }],
      '/sqlite.worker.js', '/sql-wasm.wasm', 1024 * 1024 * 64
    );

    const check = await _dbWorker.db.query(`SELECT COUNT(*) as n FROM cross_references`);
    const ntot  = await _dbWorker.db.query(`SELECT COUNT(*) as n FROM nt_ot_quotes`);
    _dbReady = true;
    console.info(`[crossrefs.js] ✅ Loaded — ${check[0]?.n ?? 0} cross-refs, ${ntot[0]?.n ?? 0} NT-OT quotes`);
    return true;
  } catch (err) {
    console.warn('[crossrefs.js] Init failed:', err.message);
    return false;
  }
}

async function query(sql, params = []) {
  if (!_dbReady) return null;
  try { return await _dbWorker.db.query(sql, params); }
  catch (err) { console.error('[crossrefs.js]', err); return null; }
}

/**
 * Get top cross-references for a single verse, sorted by vote count.
 * Returns up to `limit` results (default 15).
 */
export async function getCrossRefs(osisId, limit = 15) {
  await initCrossRefsDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT target_osis, votes, dataset
     FROM cross_references
     WHERE source_osis = ?
     ORDER BY votes DESC
     LIMIT ?`,
    [osisId, limit]
  );
  return rows || [];
}

/**
 * Get NT-OT quotations for a verse (checks both NT→OT and OT→NT directions).
 */
export async function getNtOtQuotes(osisId) {
  await initCrossRefsDb();
  if (!_dbReady) return { asNt: [], asOt: [] };

  const [asNt, asOt] = await Promise.all([
    query(`SELECT ot_osis, relationship FROM nt_ot_quotes WHERE nt_osis = ?`, [osisId]),
    query(`SELECT nt_osis, relationship FROM nt_ot_quotes WHERE ot_osis = ?`, [osisId]),
  ]);
  return { asNt: asNt || [], asOt: asOt || [] };
}

/**
 * Get all NT-OT quotations for every verse in a chapter (batch lookup).
 * Returns an array of { nt_osis, ot_osis, relationship }.
 * Used by the reading pane to mark NT verses that quote the OT.
 */
export async function getNtOtQuotesForChapter(book, chapter) {
  await initCrossRefsDb();
  if (!_dbReady) return [];

  const prefix = `${book}.${chapter}.`;
  const rows = await query(
    `SELECT nt_osis, ot_osis, relationship FROM nt_ot_quotes WHERE nt_osis LIKE ?`,
    [prefix + '%']
  );
  return rows || [];
}

/**
 * Get all cross-references where this verse appears as target (reverse lookup).
 */
export async function getReverseCrossRefs(osisId, limit = 10) {
  await initCrossRefsDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT source_osis, votes, dataset
     FROM cross_references
     WHERE target_osis = ?
     ORDER BY votes DESC
     LIMIT ?`,
    [osisId, limit]
  );
  return rows || [];
}
