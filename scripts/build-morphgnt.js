#!/usr/bin/env node
/* ============================================================
   build-morphgnt.js
   Produces: public/db/morphgnt.sqlite3

   LICENCE: CC BY-SA 4.0 — SEGREGATED DATABASE
   This database must NEVER be merged with bible_base.sqlite3.
   The ShareAlike clause applies only to adapted material that
   is structurally merged with this data. Runtime queries are
   not adaptation. Keep this database isolated.

   Source files required:
   ─────────────────────────────────────────────────────────────
   1. MorphGNT SBLGNT text files
      URL: https://github.com/morphgnt/sblgnt
      Place .txt files at: scripts/source-data/morphgnt/
      Files named like: 61-1Jn.txt, 40-Mt.txt, etc.
      Licence: CC BY-SA 4.0

   2. MACULA Greek (optional — adds token-level Louw-Nida codes per word)
      URL: https://github.com/Clear-Bible/macula-greek
      Place TSV files at: scripts/source-data/macula/
      Files are in macula-greek/SBLGNT/tsv/ — copy all .tsv files
      Licence: CC BY-SA 4.0
      Effect: populates louw_nida_code column in morphgnt_words

   3. BHP apparatus (optional — open apparatus alternative to NA28)
      URL: https://github.com/Center-for-NT-Restoration/BHP
      NOTE: This repo appears to be unavailable — skip if 404
      Place .tsv or .json at: scripts/source-data/bhp/
      Licence: CC BY-SA

   MorphGNT file format (tab-separated, one word per line):
   ─────────────────────────────────────────────────────────────
   Field 1: BCVW — 12-digit word ID: BBCCCVVVWWxx
     BB  = book number (40=Matthew ... 66=Revelation)
     CCC = chapter (zero-padded 3 digits)
     VVV = verse (zero-padded 3 digits)
     WW  = word position in verse
   Field 2: Part of speech (e.g. "N-", "V-", "P-", "RA", "C-")
   Field 3: Parsing code (e.g. "----NSF-", "PAI-3S--")
   Field 4: Text (surface form as it appears)
   Field 5: Word (canonical form)
   Field 6: Normalized (lowercase no accent)
   Field 7: Lemma
   Field 8: Strong's number (e.g. G976)

   Run: node scripts/build-morphgnt.js
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
const DB_PATH   = path.join(OUT_DIR, 'morphgnt.sqlite3');

// MorphGNT internal book number (1–27, NT sequential) → OSIS code
// The word ID prefix uses 01=Matthew through 27=Revelation
// (NOT the 40–66 Protestant Bible order — these files use their own 1-based NT sequence)
const BOOK_MAP = {
   1:'MAT',  2:'MRK',  3:'LUK',  4:'JHN',  5:'ACT',
   6:'ROM',  7:'1CO',  8:'2CO',  9:'GAL', 10:'EPH',
  11:'PHP', 12:'COL', 13:'1TH', 14:'2TH', 15:'1TI',
  16:'2TI', 17:'TIT', 18:'PHM', 19:'HEB', 20:'JAS',
  21:'1PE', 22:'2PE', 23:'1JN', 24:'2JN', 25:'3JN',
  26:'JUD', 27:'REV',
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
    console.log('  Removed old morphgnt.sqlite3');
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -32000');

  db.exec(`
    CREATE TABLE morphgnt_words (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      verse_osis      TEXT NOT NULL,
      word_sort       INTEGER NOT NULL,
      surface_text    TEXT,
      lemma           TEXT,
      strongs         TEXT,
      part_of_speech  TEXT,
      morphology      TEXT,
      person          TEXT,
      tense           TEXT,
      voice           TEXT,
      mood            TEXT,
      case_tag        TEXT,
      number          TEXT,
      gender          TEXT,
      louw_nida_code  TEXT   -- e.g. "33.98" — populated from MACULA if available
    );
    CREATE INDEX idx_morphgnt_verse   ON morphgnt_words(verse_osis);
    CREATE INDEX idx_morphgnt_lemma   ON morphgnt_words(lemma);
    CREATE INDEX idx_morphgnt_strongs ON morphgnt_words(strongs);
    CREATE INDEX idx_morphgnt_ln      ON morphgnt_words(louw_nida_code);

    CREATE TABLE bhp_apparatus (
      verse_osis       TEXT NOT NULL,
      word_sort        INTEGER NOT NULL,
      variant_text     TEXT,
      manuscript_support TEXT,
      variant_type     TEXT CHECK(variant_type IN ('omission','addition','substitution','transposition'))
    );
    CREATE INDEX idx_bhp_verse ON bhp_apparatus(verse_osis);
  `);

  return db;
}

// ── Parse morphological code ──────────────────────────────────────────────────

/**
 * Parse a MorphGNT morphological parsing code into its component fields.
 * MorphGNT uses an 8-character code: [tense][voice][mood]-[person][case][number][gender]-
 * For nouns/adj/pron: ----[case][number][gender]-
 * For verbs: [tense][voice][mood]-[person][number]--
 * Examples: "PAI-3S--" = Present Active Indicative, 3rd person Singular
 *           "----NSF-" = Nominative Singular Feminine
 */
function parseMorphCode(code, pos) {
  if (!code || code.length < 4) return {};

  const result = {};
  const isVerb = pos && (pos.startsWith('V') || pos === 'V-');

  if (isVerb) {
    // Verb: T=tense V=voice M=mood - P=person N=number - -
    const tenseMap = { P:'present', I:'imperfect', F:'future', A:'aorist', X:'perfect', Y:'pluperfect' };
    const voiceMap = { A:'active', M:'middle', P:'passive', N:'middle/passive' };
    const moodMap  = { I:'indicative', S:'subjunctive', O:'optative', D:'imperative', N:'infinitive', P:'participle' };
    const personMap = { '1':'1st', '2':'2nd', '3':'3rd' };

    result.tense  = tenseMap[code[0]] || null;
    result.voice  = voiceMap[code[1]] || null;
    result.mood   = moodMap[code[2]]  || null;
    result.person = personMap[code[4]] || null;
    result.number = code[5] === 'S' ? 'singular' : code[5] === 'P' ? 'plural' : null;

    // Participles also have case/number/gender
    if (result.mood === 'participle') {
      const caseMap   = { N:'nominative', G:'genitive', D:'dative', A:'accusative', V:'vocative' };
      const genderMap = { M:'masculine', F:'feminine', N:'neuter' };
      result.case_tag = caseMap[code[5]]   || null;
      result.number   = code[6] === 'S' ? 'singular' : code[6] === 'P' ? 'plural' : null;
      result.gender   = genderMap[code[7]] || null;
    }
  } else {
    // Noun/Adjective/Pronoun: ----[case][number][gender]-
    const caseMap   = { N:'nominative', G:'genitive', D:'dative', A:'accusative', V:'vocative' };
    const numberMap = { S:'singular', P:'plural' };
    const genderMap = { M:'masculine', F:'feminine', N:'neuter' };

    // Find the first non-dash character cluster (case starts at index 4)
    result.case_tag = caseMap[code[4]]   || null;
    result.number   = numberMap[code[5]] || null;
    result.gender   = genderMap[code[6]] || null;
  }

  return result;
}

// ── Parse MorphGNT files ──────────────────────────────────────────────────────

function parseMorphGNT(db) {
  console.log('\n🔤 Parsing MorphGNT SBLGNT files…');

  const morphDir = path.join(SRC, 'morphgnt');
  if (!fs.existsSync(morphDir)) {
    throw new Error(
      `MorphGNT directory not found: ${morphDir}\n` +
      `Download from: https://github.com/morphgnt/sblgnt\n` +
      `Place .txt files at: scripts/source-data/morphgnt/`
    );
  }

  const files = fs.readdirSync(morphDir)
    .filter(f => f.endsWith('.txt'))
    .sort();

  if (files.length === 0) {
    throw new Error(`No .txt files found in ${morphDir} — download MorphGNT from github.com/morphgnt/sblgnt`);
  }

  console.log(`  Found ${files.length} MorphGNT book files`);

  const insert = db.prepare(`
    INSERT INTO morphgnt_words
      (verse_osis, word_sort, surface_text, lemma, strongs,
       part_of_speech, morphology, person, tense, voice, mood,
       case_tag, number, gender)
    VALUES
      (@verse_osis, @word_sort, @surface_text, @lemma, @strongs,
       @part_of_speech, @morphology, @person, @tense, @voice, @mood,
       @case_tag, @number, @gender)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  let totalWords = 0;
  let processed  = 0;
  const BATCH    = 2000;
  let batch      = [];

  // Track word position within each verse
  const verseWordCount = new Map();

  for (const file of files) {
    const content = fs.readFileSync(path.join(morphDir, file), 'utf8');
    const lines   = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      // MorphGNT format (space-separated, 7 fields):
      //   BBCCVV  POS  PARSING  FORM  WORD  NORMALIZED  LEMMA
      //   010101  N-   ----NSF- Βίβλος Βίβλος βίβλος βίβλος
      //
      // BB = NT book (01=Matt … 27=Rev), CC = chapter, VV = verse
      // All two-digit zero-padded. No Strong's number in these files.
      const fields = line.trim().split(/\s+/);
      if (fields.length < 7) continue;

      const wordId = fields[0];
      if (wordId.length !== 6 || !/^\d{6}$/.test(wordId)) continue;

      const bookNum = parseInt(wordId.slice(0, 2), 10);
      const chapter = parseInt(wordId.slice(2, 4), 10);
      const verse   = parseInt(wordId.slice(4, 6), 10);

      const bookOsis = BOOK_MAP[bookNum];
      if (!bookOsis) continue;

      const verseOsis = `${bookOsis}.${chapter}.${verse}`;
      const wordSort  = (verseWordCount.get(verseOsis) || 0) + 1;
      verseWordCount.set(verseOsis, wordSort);

      const pos       = fields[1] || '';   // Part of speech (e.g. "N-", "V-")
      const morphCode = fields[2] || '';   // Parsing code (e.g. "----NSF-")
      const surface   = fields[3] || '';   // Form as it appears in text
      // fields[4] = canonical word, fields[5] = normalized, fields[6] = lemma
      const lemma     = fields[6] || fields[5] || '';
      // Strong's not in these files — will be NULL; lookup via lemma in lexicon
      const strongs   = null;

      const morphParts = parseMorphCode(morphCode, pos);

      batch.push({
        verse_osis:    verseOsis,
        word_sort:     wordSort,
        surface_text:  surface,
        lemma:         lemma || null,
        strongs:       strongs || null,
        part_of_speech: pos || null,
        morphology:    morphCode || null,
        person:        morphParts.person || null,
        tense:         morphParts.tense  || null,
        voice:         morphParts.voice  || null,
        mood:          morphParts.mood   || null,
        case_tag:      morphParts.case_tag || null,
        number:        morphParts.number || null,
        gender:        morphParts.gender || null,
      });

      totalWords++;
      if (batch.length >= BATCH) {
        insertMany(batch);
        batch = [];
      }
    }

    processed++;
    progress('MorphGNT books', processed, files.length);
  }

  if (batch.length > 0) insertMany(batch);

  console.log(`  ✅ Inserted ${totalWords.toLocaleString()} Greek words with morphology`);
  return totalWords;
}

// ── Apply MACULA Louw-Nida codes ──────────────────────────────────────────────

/**
 * MACULA Greek TSV files contain word-level Louw-Nida domain codes.
 * Each row is one word in the NT, with columns including 'louw-nida' and
 * a reference (book/chapter/verse) that lets us match to our morphgnt_words rows.
 *
 * MACULA uses SBLGNT as its base text — same as morphgnt_words — so the
 * verse_osis + word_sort alignment should be accurate.
 *
 * TSV column header detection: we look for a 'louw' or 'ln' column and
 * a 'ref' or 'verse' column. MACULA's actual headers vary by release.
 *
 * After this runs, morphgnt_words.louw_nida_code is populated for every
 * word MACULA has tagged (most NT words have a code).
 */
function applyMACULA(db) {
  console.log('\n🔗 Applying MACULA Louw-Nida codes (optional)…');

  const maculaDir = path.join(SRC, 'macula');
  if (!fs.existsSync(maculaDir)) {
    console.warn('  ⚠️  MACULA directory not found — skipping LN token codes (optional)');
    console.warn('     To enable: git clone https://github.com/Clear-Bible/macula-greek scripts/source-data/macula-greek');
    console.warn('     Then: cp scripts/source-data/macula-greek/SBLGNT/tsv/*.tsv scripts/source-data/macula/');
    return 0;
  }

  const files = fs.readdirSync(maculaDir).filter(f => f.endsWith('.tsv')).sort();
  if (files.length === 0) {
    console.warn('  ⚠️  No MACULA .tsv files found — skipping');
    return 0;
  }

  // Prepare the update statement — match by verse_osis + word_sort
  const updateLN = db.prepare(`
    UPDATE morphgnt_words SET louw_nida_code = ?
    WHERE verse_osis = ? AND word_sort = ?
  `);
  const applyBatch = db.transaction(rows => {
    for (const r of rows) updateLN.run(r.ln, r.verse_osis, r.word_sort);
  });

  let totalApplied = 0;
  let batch = [];
  const BATCH = 2000;

  for (const file of files) {
    const lines = fs.readFileSync(path.join(maculaDir, file), 'utf8').split('\n');
    if (lines.length < 2) continue;

    // Detect headers — first non-empty line that looks like a header
    const headerLine = lines.find(l => l.trim() && (l.includes('louw') || l.includes('ref') || l.includes('verse')));
    if (!headerLine) continue;
    const headers = headerLine.toLowerCase().split('\t').map(h => h.trim());

    // Find the columns we need
    // MACULA uses 'louw-nida', 'ln', or similar for the domain code
    const lnCol    = headers.findIndex(h => h.includes('louw') || h === 'ln');
    // Reference column: 'ref', 'osisRef', 'verse', or similar
    const refCol   = headers.findIndex(h => h === 'ref' || h.includes('osis') || h.includes('verse'));
    // Word position: 'position', 'wordPosition', or similar
    const posCol   = headers.findIndex(h => h.includes('position') || h === 'pos' || h === 'word_sort' || h.includes('sort'));

    if (lnCol === -1) continue; // No LN column in this file — skip

    const dataStart = lines.indexOf(headerLine) + 1;

    for (let i = dataStart; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split('\t');
      const lnCode = cols[lnCol]?.trim();
      if (!lnCode || lnCode === 'None' || lnCode === '') continue;

      // Parse the verse reference
      let verseOsis = null;
      let wordSort  = null;

      if (refCol >= 0) {
        // MACULA ref format: "MAT 1:1!1" or "MAT.1.1.1" or "40001001001"
        const ref = cols[refCol]?.trim() || '';
        verseOsis = parseMACULARef(ref);
        // Word position from ref suffix or separate column
        if (posCol >= 0) {
          wordSort = parseInt(cols[posCol], 10) || null;
        } else {
          // Try extracting from ref suffix: "MAT 1:1!3" → word 3
          const wordMatch = ref.match(/[!#](\d+)$/);
          wordSort = wordMatch ? parseInt(wordMatch[1], 10) : null;
        }
      }

      if (!verseOsis || !wordSort) continue;

      batch.push({ ln: lnCode, verse_osis: verseOsis, word_sort: wordSort });
      totalApplied++;
      if (batch.length >= BATCH) { applyBatch(batch); batch = []; }
    }
  }

  if (batch.length > 0) applyBatch(batch);

  console.log(`  ✅ MACULA: applied ${totalApplied.toLocaleString()} Louw-Nida codes`);
  return totalApplied;
}

/**
 * Parse a MACULA verse reference string into an OSIS verse ID.
 * MACULA uses several formats depending on file version:
 *   "MAT 1:1"     → MAT.1.1
 *   "MAT.1.1"     → MAT.1.1
 *   "40001001001" → MAT.1.1  (numeric book/chapter/verse/word)
 *   "1CO 13:4"    → 1CO.13.4
 */
function parseMACULARef(ref) {
  if (!ref) return null;

  // Remove word suffix: "MAT 1:1!3" → "MAT 1:1"
  const clean = ref.replace(/[!#]\d+$/, '').trim();

  // Format: "BOOK C:V" or "BOOK C.V"
  const spaceMatch = clean.match(/^([A-Z0-9]+)\s+(\d+)[:.:](\d+)$/i);
  if (spaceMatch) return `${spaceMatch[1].toUpperCase()}.${parseInt(spaceMatch[2])}.${parseInt(spaceMatch[3])}`;

  // Format: "BOOK.C.V" already OSIS-like
  const dotMatch = clean.match(/^([A-Z0-9]+)\.(\d+)\.(\d+)$/i);
  if (dotMatch) return `${dotMatch[1].toUpperCase()}.${parseInt(dotMatch[2])}.${parseInt(dotMatch[3])}`;

  // Numeric: "40001001001" = book(2) chapter(3) verse(3) word(3)
  if (/^\d{9,12}$/.test(clean)) {
    const bookNum = parseInt(clean.slice(0, 2), 10);
    const chapter = parseInt(clean.slice(2, 5), 10);
    const verse   = parseInt(clean.slice(5, 8), 10);
    const bookOsis = BOOK_MAP[bookNum];
    return bookOsis ? `${bookOsis}.${chapter}.${verse}` : null;
  }

  return null;
}

// ── Parse BHP apparatus ───────────────────────────────────────────────────────

function parseBHP(db) {
  console.log('\n📜 Parsing BHP apparatus (optional)…');

  const bhpDir = path.join(SRC, 'bhp');
  if (!fs.existsSync(bhpDir)) {
    console.warn('  ⚠️  BHP directory not found — skipping (optional)');
    console.warn('     Download: https://github.com/Center-for-NT-Restoration/BHP');
    return 0;
  }

  const files = fs.readdirSync(bhpDir)
    .filter(f => f.endsWith('.tsv') || f.endsWith('.json') || f.endsWith('.txt'))
    .sort();

  if (files.length === 0) {
    console.warn('  ⚠️  No BHP files found — skipping');
    return 0;
  }

  const insert = db.prepare(`
    INSERT INTO bhp_apparatus
      (verse_osis, word_sort, variant_text, manuscript_support, variant_type)
    VALUES
      (@verse_osis, @word_sort, @variant_text, @manuscript_support, @variant_type)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  let total = 0;
  let batch = [];
  const BATCH = 1000;

  for (const file of files) {
    const content = fs.readFileSync(path.join(bhpDir, file), 'utf8');

    if (file.endsWith('.json')) {
      try {
        const data = JSON.parse(content);
        const items = Array.isArray(data) ? data : Object.values(data).flat();
        for (const item of items) {
          if (!item.verse_osis) continue;
          batch.push({
            verse_osis:         item.verse_osis  || item.osis || '',
            word_sort:          item.word_sort   || 0,
            variant_text:       item.variant     || item.variant_text || null,
            manuscript_support: item.manuscripts || item.manuscript_support || null,
            variant_type:       item.type        || item.variant_type || null,
          });
          total++;
          if (batch.length >= BATCH) { insertMany(batch); batch = []; }
        }
      } catch (e) {
        console.warn(`  ⚠️  Could not parse ${file}: ${e.message}`);
      }
    } else {
      // TSV or plain text — best-effort parsing
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      for (const line of lines) {
        const fields = line.split('\t');
        if (fields.length < 3) continue;
        batch.push({
          verse_osis:         fields[0]?.trim() || '',
          word_sort:          parseInt(fields[1], 10) || 0,
          variant_text:       fields[2]?.trim() || null,
          manuscript_support: fields[3]?.trim() || null,
          variant_type:       fields[4]?.trim() || null,
        });
        total++;
        if (batch.length >= BATCH) { insertMany(batch); batch = []; }
      }
    }
  }

  if (batch.length > 0) insertMany(batch);
  console.log(`  ✅ BHP: ${total.toLocaleString()} apparatus entries inserted`);
  return total;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log('════════════════════════════════════════════════');
  console.log('  build-morphgnt.js');
  console.log('  LICENCE: CC BY-SA 4.0 — SEGREGATED DATABASE');
  console.log('════════════════════════════════════════════════');

  const morphDir = path.join(SRC, 'morphgnt');
  if (!fs.existsSync(morphDir)) {
    console.error(`\n❌ MorphGNT source directory not found: ${morphDir}`);
    console.error('\nTo download:');
    console.error('  git clone https://github.com/morphgnt/sblgnt scripts/source-data/morphgnt-repo');
    console.error('  cp scripts/source-data/morphgnt-repo/morphgnt/*.txt scripts/source-data/morphgnt/');
    process.exit(1);
  }

  const db = createDB();

  try {
    const wordCount  = parseMorphGNT(db);
    const lnCount    = applyMACULA(db);   // optional — adds LN codes per word
    const bhpCount   = parseBHP(db);      // optional — apparatus entries

    // Verify
    const check = db.prepare('SELECT COUNT(*) as n FROM morphgnt_words').get();
    console.log(`\n✔️  Verification: ${check.n.toLocaleString()} words in morphgnt_words`);

    if (check.n < 100000) {
      console.warn(`  ⚠️  Expected ~138,000+ words — only found ${check.n}. Check source files.`);
    }

    // CRITICAL: disable WAL mode before closing
    // sql.js-httpvfs requires a single file — WAL mode creates a separate -wal file
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
  📁 Output: public/db/morphgnt.sqlite3
  ⚠️  SEGREGATED DB — CC BY-SA 4.0
════════════════════════════════════════════════

  Next step: node scripts/build-translations-cc.js
`);
}

main().catch(err => {
  console.error('\n❌ Build failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
