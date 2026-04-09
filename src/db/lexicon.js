/* ============================================================
   lexicon.js — Lexicon query layer
   Connects to lexicon.sqlite3 via sql.js-httpvfs.
   Provides Strong's definitions and Louw-Nida semantic domains.
   ============================================================ */

let _dbWorker = null;
let _dbReady  = false;
let _initProm = null;

export function isLexiconReady() { return _dbReady; }

// ── Initialisation ────────────────────────────────────────────────────────────

export async function initLexiconDb() {
  if (_dbReady)  return true;
  if (_initProm) return _initProm;
  _initProm = _doInit();
  return _initProm;
}

async function _doInit() {
  try {
    const configUrl = '/db/chunks/lexicon/config.json';
    const probe = await fetch(configUrl, { method: 'HEAD' });
    if (!probe.ok) {
      console.info('[lexicon.js] lexicon chunks not found');
      return false;
    }

    const { createDbWorker } = await import('sql.js-httpvfs');

    _dbWorker = await createDbWorker(
      [{ from: 'jsonconfig', configUrl }],
      '/sqlite.worker.js',
      '/sql-wasm.wasm',
      1024 * 1024 * 16  // 16 MB max — lexicon is ~6 MB
    );

    const check = await _dbWorker.db.query(`SELECT COUNT(*) as n FROM strongs`);
    const count = check[0]?.n ?? 0;
    if (count < 100) throw new Error(`Lexicon appears empty (${count} entries)`);

    _dbReady = true;
    console.info(`[lexicon.js] ✅ Lexicon loaded — ${count.toLocaleString()} entries`);
    return true;

  } catch (err) {
    console.warn('[lexicon.js] Lexicon init failed:', err.message);
    return false;
  }
}

async function query(sql, params = []) {
  if (!_dbReady) return null;
  try {
    return await _dbWorker.db.query(sql, params);
  } catch (err) {
    console.error('[lexicon.js] Query error:', err);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get Strong's entry by ID (e.g. "G0025" or "H430").
 * @returns {Promise<{strongs_id, lemma, transliteration, pronunciation, part_of_speech, definition, kjv_usage, derivation, language} | null>}
 */
export async function getStrongs(strongsId) {
  await initLexiconDb();
  if (!_dbReady) return null;

  const rows = await query(
    `SELECT strongs_id, lemma, transliteration, pronunciation,
            part_of_speech, definition, kjv_usage, derivation, language
     FROM strongs WHERE strongs_id = ? LIMIT 1`,
    [strongsId]
  );
  return rows?.[0] ?? null;
}

/**
 * Get Thayer's Greek Lexicon entry for a Strong's ID.
 * Returns null if Thayer's table doesn't exist or has no entry.
 * (Public domain — always available once built)
 * @returns {Promise<{strongs_id, lemma, short_def, long_def, cognates} | null>}
 */
export async function getThayers(strongsId) {
  await initLexiconDb();
  if (!_dbReady) return null;

  try {
    const rows = await query(
      `SELECT strongs_id, lemma, short_def, long_def, cognates
       FROM thayers WHERE strongs_id = ? LIMIT 1`,
      [strongsId]
    );
    return rows?.[0] ?? null;
  } catch {
    // Table doesn't exist yet — Thayer's source not downloaded
    return null;
  }
}

/**
 * Get Enhanced Brown-Driver-Briggs Hebrew entry for a Strong's ID.
 * Returns null if BDB table doesn't exist or has no entry.
 * (CC BY 4.0 — Eliran Wong — always available once built)
 * @returns {Promise<{strongs_id, lemma, transliteration, short_def, long_def, twot_number} | null>}
 */
export async function getBDB(strongsId) {
  await initLexiconDb();
  if (!_dbReady) return null;

  try {
    const rows = await query(
      `SELECT strongs_id, lemma, transliteration, short_def, long_def, twot_number
       FROM bdb WHERE strongs_id = ? LIMIT 1`,
      [strongsId]
    );
    return rows?.[0] ?? null;
  } catch {
    // Table doesn't exist yet — Enhanced BDB source not downloaded
    return null;
  }
}

/**
 * Get the richest available lexical entry for a Strong's ID.
 * Priority: Thayer's (Greek) or BDB (Hebrew) > Strong's definition > nothing
 * This is the preferred function for the Strong's popup in interlinear.js.
 *
 * @returns {Promise<{
 *   strongs_id, lemma, transliteration, pronunciation,
 *   definition, kjv_usage, derivation, language,
 *   short_def, long_def, cognates, twot_number,
 *   source: 'thayers'|'bdb'|'strongs'
 * } | null>}
 */
export async function getEnrichedStrongs(strongsId) {
  await initLexiconDb();
  if (!_dbReady) return null;

  // Get the base Strong's entry first
  const base = await getStrongs(strongsId);
  if (!base) return null;

  // For Greek: try to enrich with Thayer's
  if (base.language === 'greek') {
    const thayers = await getThayers(strongsId);
    if (thayers) {
      return {
        ...base,
        // Prefer Thayer's definition over bare Strong's
        definition: thayers.long_def || thayers.short_def || base.definition,
        short_def:  thayers.short_def,
        long_def:   thayers.long_def,
        cognates:   thayers.cognates,
        source:     'thayers',
      };
    }
  }

  // For Hebrew: try to enrich with Enhanced BDB
  if (base.language === 'hebrew') {
    const bdb = await getBDB(strongsId);
    if (bdb) {
      return {
        ...base,
        // Prefer BDB definition over bare Strong's
        definition:     bdb.long_def || bdb.short_def || base.definition,
        short_def:      bdb.short_def,
        long_def:       bdb.long_def,
        twot_number:    bdb.twot_number,
        transliteration: bdb.transliteration || base.transliteration,
        source:         'bdb',
      };
    }
  }

  // Fall back to bare Strong's
  return { ...base, source: 'strongs' };
}

/**
 * Get Louw-Nida semantic domains for a Strong's ID.
 * @returns {Promise<Array<{domain_number, domain_name, subdomain, gloss}>>}
 */
export async function getLouwNida(strongsId) {
  await initLexiconDb();
  if (!_dbReady) return [];

  const rows = await query(
    `SELECT domain_number, domain_name, subdomain, gloss
     FROM louw_nida WHERE strongs_id = ?
     ORDER BY domain_number`,
    [strongsId]
  );
  return rows || [];
}

/**
 * Batch-fetch kjv_usage short glosses for multiple Strong's IDs at once.
 * Used by interlinear.js to populate Hebrew/Greek gloss rows from lexicon data.
 * @param {string[]} ids - Array of Strong's IDs e.g. ["H7225", "H430"]
 * @returns {Promise<Map<string, string>>} - Map of strongsId → short gloss
 */
export async function getLexiconGlossBatch(ids) {
  await initLexiconDb();
  const result = new Map();
  if (!_dbReady || !ids.length) return result;

  // SQLite doesn't support JS array params directly — build placeholders
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT strongs_id, kjv_usage, definition FROM strongs WHERE strongs_id IN (${placeholders})`,
    ids
  );

  for (const row of (rows || [])) {
    // Use the first KJV rendering as a short gloss (before the first comma)
    const gloss = (row.kjv_usage || row.definition || '')
      .split(/[,;]/)[0]
      .replace(/^\s*[+×\-–—]\s*/, '')  // strip leading symbols
      .replace(/\{.*?\}/g, '')           // strip curly-brace content
      .trim()
      .toLowerCase();
    if (gloss) result.set(row.strongs_id, gloss);
  }

  return result;
}

/**
 * Search the lexicon by term (word or Strong's number).
 * @returns {Promise<Array<{strongs_id, lemma, definition, language}>>}
 */
export async function searchLexicon(term, limit = 20) {
  await initLexiconDb();
  if (!_dbReady) return [];

  // If it looks like a Strong's ID, do a direct lookup
  if (/^[GH]\d+$/i.test(term.trim())) {
    const normalized = term.trim().toUpperCase().startsWith('G')
      ? `G${String(parseInt(term.slice(1), 10)).padStart(4, '0')}`
      : term.trim().toUpperCase();
    const rows = await query(
      `SELECT strongs_id, lemma, definition, kjv_usage, language
       FROM strongs WHERE strongs_id = ? LIMIT 1`,
      [normalized]
    );
    return rows || [];
  }

  // Otherwise FTS5 search
  const rows = await query(
    `SELECT s.strongs_id, s.lemma, s.definition, s.kjv_usage, s.language
     FROM strongs_search ss
     JOIN strongs s ON s.strongs_id = ss.strongs_id
     WHERE strongs_search MATCH ?
     LIMIT ?`,
    [term, limit]
  );
  return rows || [];
}
