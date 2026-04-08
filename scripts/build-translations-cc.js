#!/usr/bin/env node
/* ============================================================
   build-translations-cc.js
   Produces: public/db/translations_cc.sqlite3

   LICENCE: CC BY-SA 4.0 — SEGREGATED DATABASE
   This database must NEVER be merged with bible_base.sqlite3.
   Attribution required: "unfoldingWord® Literal Text (ULT) and
   Simplified Text (UST), CC BY-SA 4.0, unfoldingWord.org"

   Source files required:
   ─────────────────────────────────────────────────────────────
   1. unfoldingWord Literal Translation (ULT) — USFM files
      URL: https://github.com/unfoldingWord/en_ult
      Place at: scripts/source-data/ult/
      Licence: CC BY-SA 4.0

   2. unfoldingWord Simplified Translation (UST) — USFM files
      URL: https://github.com/unfoldingWord/en_ust
      Place at: scripts/source-data/ust/
      Licence: CC BY-SA 4.0

   USFM format expected:
   ─────────────────────────────────────────────────────────────
   Files named like: 41-MRK.usfm, 01-GEN.usfm, etc.
   \id GEN
   \c 1
   \v 1 In the beginning...
   \v 2 ...

   Run: node scripts/build-translations-cc.js
   ============================================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SRC       = path.join(__dirname, 'source-data');
const OUT_DIR   = path.join(ROOT, 'public', 'db');
const DB_PATH   = path.join(OUT_DIR, 'translations_cc.sqlite3');

// USFM book ID → OSIS code
const USFM_TO_OSIS = {
  GEN:'GEN', EXO:'EXO', LEV:'LEV', NUM:'NUM', DEU:'DEU',
  JOS:'JOS', JDG:'JDG', RUT:'RUT', '1SA':'1SA','2SA':'2SA',
  '1KI':'1KI','2KI':'2KI','1CH':'1CH','2CH':'2CH',
  EZR:'EZR', NEH:'NEH', EST:'EST', JOB:'JOB', PSA:'PSA',
  PRO:'PRO', ECC:'ECC', SNG:'SNG', ISA:'ISA', JER:'JER',
  LAM:'LAM', EZK:'EZK', DAN:'DAN', HOS:'HOS', JOL:'JOL',
  AMO:'AMO', OBA:'OBA', JON:'JON', MIC:'MIC', NAH:'NAH',
  HAB:'HAB', ZEP:'ZEP', HAG:'HAG', ZEC:'ZEC', MAL:'MAL',
  MAT:'MAT', MRK:'MRK', LUK:'LUK', JHN:'JHN', ACT:'ACT',
  ROM:'ROM', '1CO':'1CO','2CO':'2CO', GAL:'GAL', EPH:'EPH',
  PHP:'PHP', COL:'COL', '1TH':'1TH','2TH':'2TH','1TI':'1TI',
  '2TI':'2TI', TIT:'TIT', PHM:'PHM', HEB:'HEB', JAS:'JAS',
  '1PE':'1PE','2PE':'2PE','1JN':'1JN','2JN':'2JN','3JN':'3JN',
  JUD:'JUD', REV:'REV',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function progress(label, done, total) {
  const pct = total ? Math.round(done / total * 100) : 0;
  process.stdout.write(`\r  ${label}: ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%)`);
  if (done === total) process.stdout.write('\n');
}

// ── Database setup ────────────────────────────────────────────────────────────

function createDB() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('  Removed old translations_cc.sqlite3');
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -32000');

  db.exec(`
    CREATE TABLE cc_translations (
      osis_id        TEXT NOT NULL,
      translation_id TEXT NOT NULL,
      text           TEXT NOT NULL,
      PRIMARY KEY (osis_id, translation_id)
    );
    CREATE INDEX idx_cct_osis  ON cc_translations(osis_id);
    CREATE INDEX idx_cct_trans ON cc_translations(translation_id);
  `);

  return db;
}

// ── USFM parser ───────────────────────────────────────────────────────────────

/**
 * Parse a USFM file and return an array of { osis_id, text } verse objects.
 *
 * unfoldingWord ULT/UST uses word-level alignment USFM where verse text is
 * spread across multiple lines, one \zaln-s...\zaln-e block per word:
 *
 *   \v 1 \zaln-s |x-strong="G37560" ...\*
 *   \w In|lemma="ἐν"...\w*
 *   \zaln-e\*
 *   \zaln-s |x-strong="G07460" ...\*
 *   \w the|lemma="ὁ"...\w*
 *   \zaln-e\*
 *   ...
 *
 * Strategy: join all lines, split on chapter/verse markers, then strip USFM.
 */
function parseUSFM(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // ── 1. Get book OSIS code ────────────────────────────────────────────────────
  const idMatch = content.match(/\\id\s+([A-Z0-9]+)/);
  if (!idMatch) return [];
  const usfmId = idMatch[1].toUpperCase().replace(/^0+/, '');
  const bookOsis = USFM_TO_OSIS[usfmId];
  if (!bookOsis) {
    console.warn(`  ⚠️  Unknown USFM book ID: ${usfmId} in ${path.basename(filePath)}`);
    return [];
  }

  // ── 2. Collapse to a single line (verse text spans newlines in alignment USFM)
  const flat = content.replace(/\r?\n/g, ' ');

  // ── 3. Split into chapter segments on \c N ────────────────────────────────────
  const verses = [];
  const chunksByChapter = flat.split(/\\c\s+(\d+)/);
  // Layout: [pre-content, chapNum, chapBody, chapNum, chapBody, ...]

  for (let ci = 1; ci < chunksByChapter.length; ci += 2) {
    const chapter = parseInt(chunksByChapter[ci], 10);
    const chapBody = chunksByChapter[ci + 1] || '';

    // ── 4. Split into verse segments on \v N ─────────────────────────────────
    const chunksByVerse = chapBody.split(/\\v\s+(\d+)/);
    // Layout: [pre-verse, verseNum, verseBody, verseNum, verseBody, ...]

    for (let vi = 1; vi < chunksByVerse.length; vi += 2) {
      const verseNum = parseInt(chunksByVerse[vi], 10);
      let   raw      = chunksByVerse[vi + 1] || '';

      const text = stripUSFM(raw);

      if (text && chapter > 0 && verseNum > 0) {
        verses.push({ osis_id: `${bookOsis}.${chapter}.${verseNum}`, text });
      }
    }
  }

  return verses;
}

/**
 * Strip all USFM markers from a raw verse segment and return clean plain text.
 *
 * Order matters:
 *  1. Remove footnotes / cross-refs (have inner content we don't want)
 *  2. Remove milestone markers (zaln-s/e, k-s/e — attribute-only, no text)
 *  3. Extract surface word from \w word|attributes\w* → word
 *  4. Extract text from paired character markers (\add text\add* → text)
 *  5. Strip any remaining markers
 */
function stripUSFM(raw) {
  return raw
    // Remove footnotes and cross-references entirely (including inner text)
    .replace(/\\f\s[\s\S]*?\\f\*/g, '')
    .replace(/\\fe\s[\s\S]*?\\fe\*/g, '')
    .replace(/\\x\s[\s\S]*?\\x\*/g, '')
    // Remove milestone markers with attributes: \zaln-s |...\* and \zaln-e\*
    // These look like \marker-s |attrs\* and \marker-e\*
    .replace(/\\[a-zA-Z]+-s\s*\|[^\\]*\\\*/g, '')
    .replace(/\\[a-zA-Z]+-e\\\*/g, '')
    // Extract surface text from word markers: \w word|lemma="..."\w* → word
    .replace(/\\w\s+([^|\\]+)\|[^\\]*\\w\*/g, '$1')
    // Extract text from paired character markers (keep inner text):
    //   \add word\add*, \nd word\nd*, \bd word\bd*, etc.
    .replace(/\\(?:add|nd|bk|dc|k|qs|sig|sls|tl|wg|wh|wa|bd|it|em|sc|sup)\s+(.*?)\\(?:add|nd|bk|dc|k|qs|sig|sls|tl|wg|wh|wa|bd|it|em|sc|sup)\*/g, '$1')
    // Strip any remaining closing markers (\word*)
    .replace(/\\[a-zA-Z0-9+-]+\*/g, '')
    // Strip any remaining opening/paragraph markers (\word or \word )
    .replace(/\\[a-zA-Z0-9+-]+\s*/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Build translation ─────────────────────────────────────────────────────────

function buildTranslation(db, transId, srcDir) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`  ⚠️  ${transId} source directory not found: ${srcDir}`);
    console.warn(`     Download: https://github.com/unfoldingWord/en_${transId.toLowerCase()}`);
    return 0;
  }

  const files = fs.readdirSync(srcDir)
    .filter(f => f.endsWith('.usfm') || f.endsWith('.USFM'))
    .sort();

  if (files.length === 0) {
    console.warn(`  ⚠️  No USFM files found in ${srcDir}`);
    return 0;
  }

  console.log(`  Building ${transId} from ${files.length} USFM files…`);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO cc_translations (osis_id, translation_id, text)
    VALUES (@osis_id, @translation_id, @text)
  `);
  const insertMany = db.transaction(rows => {
    for (const r of rows) insert.run(r);
  });

  let totalVerses = 0;
  let processed   = 0;
  const BATCH     = 2000;
  let batch       = [];

  for (const file of files) {
    const filePath = path.join(srcDir, file);
    const verses   = parseUSFM(filePath);

    for (const v of verses) {
      batch.push({ ...v, translation_id: transId });
      if (batch.length >= BATCH) {
        insertMany(batch);
        totalVerses += batch.length;
        batch = [];
      }
    }

    processed++;
    progress(`${transId} books`, processed, files.length);
  }

  if (batch.length > 0) {
    insertMany(batch);
    totalVerses += batch.length;
  }

  console.log(`  ✅ ${transId}: ${totalVerses.toLocaleString()} verses inserted`);
  return totalVerses;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log('════════════════════════════════════════════════');
  console.log('  build-translations-cc.js');
  console.log('  LICENCE: CC BY-SA 4.0 — SEGREGATED DATABASE');
  console.log('  Attribution: unfoldingWord® ULT + UST');
  console.log('════════════════════════════════════════════════');

  const db = createDB();

  try {
    console.log('\n📖 Building CC-licensed translations…\n');

    const ultCount = buildTranslation(db, 'ULT', path.join(SRC, 'ult'));
    const ustCount = buildTranslation(db, 'UST', path.join(SRC, 'ust'));

    if (ultCount + ustCount === 0) {
      console.error('\n❌ No translations built. Download sources first:');
      console.error('   ULT: git clone https://github.com/unfoldingWord/en_ult scripts/source-data/ult');
      console.error('   UST: git clone https://github.com/unfoldingWord/en_ust scripts/source-data/ust');
      process.exit(1);
    }

    // Verify
    const ult = db.prepare(`SELECT COUNT(*) as n FROM cc_translations WHERE translation_id='ULT'`).get();
    const ust = db.prepare(`SELECT COUNT(*) as n FROM cc_translations WHERE translation_id='UST'`).get();
    console.log(`\n✔️  Verification: ULT ${ult.n.toLocaleString()} verses, UST ${ust.n.toLocaleString()} verses`);

    // CRITICAL: disable WAL mode before closing
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.pragma('journal_mode = DELETE');
    db.pragma('optimize');

  } finally {
    db.close();
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB  = Math.round(fs.statSync(DB_PATH).size / 1024);

  console.log(`
════════════════════════════════════════════════
  ✅ Done in ${elapsed}s
  📦 File size: ${(sizeKB / 1024).toFixed(1)} MB
  📁 Output: public/db/translations_cc.sqlite3
  ⚠️  SEGREGATED DB — CC BY-SA 4.0
  📝 Attribution required: unfoldingWord® CC BY-SA 4.0
════════════════════════════════════════════════

  Next step: node scripts/build-lexicon.js
`);
}

main().catch(err => {
  console.error('\n❌ Build failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
