/* ============================================================
   translations.js — CC translations query layer
   Queries translations_cc.sqlite3 for ULT, UST, and any future
   CC-licensed translations stored in the cc_translations table.
   ============================================================ */

let _dbWorker = null;
let _dbReady  = false;
let _initProm = null;

export function isTranslationsReady() { return _dbReady; }

export async function initTranslationsDb() {
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
      [{ from: 'inline', config: DB_CHUNKS.translations_cc }],
      '/sqlite.worker.js', '/sql-wasm.wasm',
      1024 * 1024 * 64   // 64 MB max (translations_cc is ~9 MB)
    );

    const check = await _dbWorker.db.query(`SELECT COUNT(*) as n FROM cc_translations`);
    const count = check[0]?.n ?? 0;
    if (count < 100) throw new Error(`cc_translations seems empty (${count} rows)`);

    _dbReady = true;
    console.info(`[translations.js] ✅ Loaded — ${count.toLocaleString()} verse-translation rows`);
    return true;
  } catch (err) {
    console.warn('[translations.js] Init failed:', err.message);
    return false;
  }
}

async function query(sql, params = []) {
  if (!_dbReady) return null;
  try { return await _dbWorker.db.query(sql, params); }
  catch (err) { console.error('[translations.js]', err); return null; }
}

/**
 * Get a chapter from a CC translation (ULT, UST, etc.).
 * Returns [{osisId, verse, text}] sorted by verse number.
 *
 * @param {string} book           OSIS book code (e.g. 'JHN')
 * @param {number} chapter
 * @param {string} translationId  e.g. 'ULT' or 'UST'
 */
export async function getCCChapter(book, chapter, translationId) {
  await initTranslationsDb();
  if (!_dbReady) return [];

  // LIKE pattern matches 'JHN.3.%' — parse verse number in JS to avoid
  // SQLite string-math complications with multi-digit verse numbers.
  const rows = await query(
    `SELECT osis_id, text
     FROM cc_translations
     WHERE osis_id LIKE ? AND translation_id = ?`,
    [`${book}.${chapter}.%`, translationId]
  );

  if (!rows || rows.length === 0) return [];

  return rows
    .map(r => ({
      osisId: r.osis_id,
      verse:  parseInt(r.osis_id.split('.')[2], 10),
      text:   r.text || '',
    }))
    .sort((a, b) => a.verse - b.verse);
}

/**
 * Get a single verse from a CC translation.
 */
export async function getCCVerse(osisId, translationId) {
  await initTranslationsDb();
  if (!_dbReady) return null;

  const rows = await query(
    `SELECT osis_id, text FROM cc_translations WHERE osis_id = ? AND translation_id = ? LIMIT 1`,
    [osisId, translationId]
  );
  if (!rows || !rows[0]) return null;
  return { osisId, text: rows[0].text || '' };
}
