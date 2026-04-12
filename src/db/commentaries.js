/* ============================================================
   commentaries.js — Commentary query layer
   ============================================================ */

// ── Commentary source prefs (localStorage) ────────────────────
// null = all sources enabled; string[] = only those abbrs shown
const _PREFS_KEY      = 'berean_comm_prefs';
const _USER_META_KEY  = 'berean_user_comm_meta';
const _USER_OPFS_FILE = 'user_commentary.sqlite3';

export function getCommentaryPrefs() {
  try { return JSON.parse(localStorage.getItem(_PREFS_KEY)); } catch { return null; }
}
export function saveCommentaryPrefs(enabled) {
  // enabled: string[] | null (null = all)
  if (enabled === null) localStorage.removeItem(_PREFS_KEY);
  else localStorage.setItem(_PREFS_KEY, JSON.stringify(enabled));
}

export function getUserCommentaryMeta() {
  try { return JSON.parse(localStorage.getItem(_USER_META_KEY)); } catch { return null; }
}
function _saveUserMeta(meta) {
  if (meta) localStorage.setItem(_USER_META_KEY, JSON.stringify(meta));
  else localStorage.removeItem(_USER_META_KEY);
}

// ── User commentary DB (OPFS-backed) ─────────────────────────
let _userDbWorker = null;
let _userDbReady  = false;
let _userInitProm = null;

async function _initUserDbFromBuffer(ab) {
  const { createDbWorker } = await import('sql.js-httpvfs');
  _userDbWorker = await createDbWorker(
    [{ from: 'array', data: new Uint8Array(ab) }],
    '/sqlite.worker.js', '/sql-wasm.wasm', 1024 * 1024 * 128
  );
  const probe = await _userDbWorker.db.query(`SELECT book_id FROM commentaries LIMIT 1`);
  _userDbReady = probe.length > 0;
}

async function _opfsSave(ab) {
  const root = await navigator.storage.getDirectory();
  const fh   = await root.getFileHandle(_USER_OPFS_FILE, { create: true });
  const w    = await fh.createWritable();
  await w.write(ab);
  await w.close();
}
async function _opfsLoad() {
  try {
    const root = await navigator.storage.getDirectory();
    const fh   = await root.getFileHandle(_USER_OPFS_FILE);
    const file = await fh.getFile();
    return await file.arrayBuffer();
  } catch { return null; }
}
async function _opfsDelete() {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(_USER_OPFS_FILE);
  } catch { /* file may not exist */ }
}

/** Auto-load user commentary from OPFS on first getCommentaries() call. */
async function _ensureUserDb() {
  if (_userDbReady)  return;
  if (_userInitProm) return _userInitProm;
  if (!getUserCommentaryMeta()) return;
  _userInitProm = (async () => {
    const ab = await _opfsLoad();
    if (!ab) { _saveUserMeta(null); return; }
    try {
      await _initUserDbFromBuffer(ab);
      console.info('[commentaries.js] ✅ User commentary loaded from OPFS');
    } catch (err) {
      console.warn('[commentaries.js] User commentary init failed:', err);
    }
  })();
  return _userInitProm;
}

/**
 * Upload a user commentary database file.
 * Must be a SQLite3 file with a `commentaries` table matching the Berean schema:
 *   commentaries(book_id TEXT, chapter INT, verse_start INT, verse_end INT,
 *                source_abbr TEXT, html_content TEXT, ...)
 */
export async function loadUserCommentaryDb(file) {
  // Validate SQLite magic bytes: "SQLite format 3\0"
  const hdr   = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const magic = [0x53,0x51,0x4C,0x69,0x74,0x65,0x20,0x66,0x6F,0x72,0x6D,0x61,0x74,0x20,0x33,0x00];
  if (!magic.every((b, i) => hdr[i] === b)) throw new Error('Not a valid SQLite database.');

  const ab = await file.arrayBuffer();

  // Reset any previously loaded user DB
  _userDbWorker = null;
  _userDbReady  = false;
  _userInitProm = null;

  await _initUserDbFromBuffer(ab);
  if (!_userDbReady) throw new Error('No "commentaries" table found. See the schema requirements.');

  await _opfsSave(ab);
  const label = file.name.replace(/\.sqlite3$/i, '').replace(/[_-]/g, ' ');
  _saveUserMeta({ label, filename: file.name, uploadedAt: Date.now() });
}

/** Remove the user commentary DB entirely. */
export async function deleteUserCommentaryDb() {
  _userDbWorker = null;
  _userDbReady  = false;
  _userInitProm = null;
  await _opfsDelete();
  _saveUserMeta(null);
}

// ── Built-in commentary DB ────────────────────────────────────
let _dbWorker  = null;
let _dbReady   = false;
let _initProm  = null;
let _lastError = null;

export function isCommentaryReady()  { return _dbReady; }
export function getCommentaryError() { return _lastError; }

export async function initCommentaryDb() {
  if (_dbReady)  return true;
  if (_initProm) return _initProm;
  _lastError = null;
  _initProm  = _doInit();
  return _initProm;
}

/** Reset so the built-in DB can be retried after a failure. */
export function resetCommentaryDb() {
  if (_dbReady) return;
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
    const check = await _dbWorker.db.query(`SELECT book_id FROM commentaries LIMIT 1`);
    _dbReady = check.length > 0;
    console.info(`[commentaries.js] ✅ Loaded (probe ok: ${_dbReady})`);
    return true;
  } catch (err) {
    _lastError = err.message || String(err);
    console.error('[commentaries.js] Init failed:', err);
    return false;
  }
}

async function _query(worker, sql, params = []) {
  try { return await worker.db.query(sql, params); }
  catch (err) { console.error('[commentaries.js]', err); return []; }
}

// ── Public query API ──────────────────────────────────────────

/**
 * Get all commentary entries for a chapter.
 * Merges built-in + user DB; filters by saved source prefs.
 */
export async function getCommentaries(book, chapter) {
  await Promise.all([initCommentaryDb(), _ensureUserDb()]);

  const prefs = getCommentaryPrefs(); // null = all; string[] = filter

  const builtinRows = _dbReady
    ? await _query(_dbWorker,
        `SELECT id, book_id, chapter, verse_start, verse_end, source_abbr, author, html_content
         FROM commentaries WHERE book_id = ? AND chapter = ?
         ORDER BY source_abbr, verse_start`, [book, chapter])
    : [];

  const userRows = _userDbReady
    ? await _query(_userDbWorker,
        `SELECT id, book_id, chapter, verse_start, verse_end, source_abbr, author, html_content
         FROM commentaries WHERE book_id = ? AND chapter = ?
         ORDER BY source_abbr, verse_start`, [book, chapter])
    : [];

  const all = [...builtinRows, ...userRows];
  return prefs ? all.filter(r => prefs.includes(r.source_abbr)) : all;
}

/** Get commentary for a single verse (all sources). */
export async function getVerseCommentary(book, chapter, verse) {
  await Promise.all([initCommentaryDb(), _ensureUserDb()]);

  const builtinRows = _dbReady
    ? await _query(_dbWorker,
        `SELECT source_abbr, author, html_content, verse_start, verse_end
         FROM commentaries WHERE book_id = ? AND chapter = ?
           AND verse_start <= ? AND verse_end >= ?
         ORDER BY source_abbr, verse_start`, [book, chapter, verse, verse])
    : [];

  const userRows = _userDbReady
    ? await _query(_userDbWorker,
        `SELECT source_abbr, author, html_content, verse_start, verse_end
         FROM commentaries WHERE book_id = ? AND chapter = ?
           AND verse_start <= ? AND verse_end >= ?
         ORDER BY source_abbr, verse_start`, [book, chapter, verse, verse])
    : [];

  return [...builtinRows, ...userRows];
}
