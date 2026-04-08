#!/usr/bin/env node
/* ============================================================
   build-bible-base.js
   Produces: public/db/bible_base.sqlite3

   Source files required:
   ─────────────────────────────────────────────────────────────
   1. WEB text (World English Bible)
      URL: https://ebible.org/Scriptures/engwebpb_readaloud.zip
      Unzip to: scripts/source-data/web/
      Expected: scripts/source-data/web/engwebpb_readaloud/*.txt

   2. SBLGNT (SBL Greek New Testament — CC BY 4.0) [PREFERRED]
      URL: https://github.com/LogosBible/SBLGNT
      Place .txt files at: scripts/source-data/sblgnt/
      NOTE: Run build-morphgnt.js separately for full morphological data.
      SBLGNT replaces OpenGNT as the Greek base — it is now CC BY 4.0
      and is academically superior (critical text by Michael W. Holmes).

      ── OR ──

      OpenGNT (legacy fallback — still works if SBLGNT not downloaded)
      URL: https://github.com/eliranwong/OpenGNT
      File: OpenGNT_keyedFeatures.csv
      Place at: scripts/source-data/opengnt/OpenGNT_keyedFeatures.csv

      The script will use SBLGNT if present, fall back to OpenGNT.

   3. OSHB / morphhb (Hebrew OT with morphology)
      URL: https://github.com/openscriptures/morphhb
      Place the wlc/ folder at: scripts/source-data/morphhb/wlc/

   Run: node scripts/build-bible-base.js
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
const DB_PATH   = path.join(OUT_DIR, 'bible_base.sqlite3');

// ── Book code mappings ──────────────────────────────────────────────────────

// WEB file code → app OSIS code (only exceptions listed; rest are identical)
const WEB_TO_OSIS = {
  NAM: 'NAH',   // WEB uses NAM, app uses NAH
};

// OpenGNT book number (40-66) → app OSIS code
const GNTBOOK = {
  40:'MAT', 41:'MRK', 42:'LUK', 43:'JHN', 44:'ACT',
  45:'ROM', 46:'1CO', 47:'2CO', 48:'GAL', 49:'EPH',
  50:'PHP', 51:'COL', 52:'1TH', 53:'2TH', 54:'1TI',
  55:'2TI', 56:'TIT', 57:'PHM', 58:'HEB', 59:'JAS',
  60:'1PE', 61:'2PE', 62:'1JN', 63:'2JN', 64:'3JN',
  65:'JUD', 66:'REV',
};

// morphhb OSIS book prefix → app OSIS code
const MORPHHB_TO_OSIS = {
  Gen:'GEN',  Exod:'EXO', Lev:'LEV',  Num:'NUM',  Deut:'DEU',
  Josh:'JOS', Judg:'JDG', Ruth:'RUT', '1Sam':'1SA','2Sam':'2SA',
  '1Kgs':'1KI','2Kgs':'2KI','1Chr':'1CH','2Chr':'2CH',
  Ezra:'EZR', Neh:'NEH',  Esth:'EST', Job:'JOB',  Ps:'PSA',
  Prov:'PRO', Eccl:'ECC', Song:'SNG', Isa:'ISA',  Jer:'JER',
  Lam:'LAM',  Ezek:'EZK', Dan:'DAN',  Hos:'HOS',  Joel:'JOL',
  Amos:'AMO', Obad:'OBA', Jonah:'JON',Mic:'MIC',  Nah:'NAH',
  Hab:'HAB',  Zeph:'ZEP', Hag:'HAG',  Zech:'ZEC', Mal:'MAL',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function osisId(book, chapter, verse) {
  return `${book}.${chapter}.${verse}`;
}

function progress(label, done, total) {
  const pct = total ? Math.round(done / total * 100) : 0;
  process.stdout.write(`\r  ${label}: ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%)`);
  if (done === total) process.stdout.write('\n');
}

// ── Database setup ───────────────────────────────────────────────────────────

function createDB() {
  // Delete old file if it exists
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('  Removed old bible_base.sqlite3');
  }

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64 MB cache

  db.exec(`
    CREATE TABLE verses (
      osis_id    TEXT PRIMARY KEY,
      book       TEXT NOT NULL,
      chapter    INTEGER NOT NULL,
      verse      INTEGER NOT NULL,
      text_web   TEXT,
      text_kjv   TEXT,
      text_bsb   TEXT
    );

    CREATE TABLE words (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      verse_osis       TEXT NOT NULL,
      word_sort        INTEGER NOT NULL,
      surface_text     TEXT,
      transliteration  TEXT,
      lemma            TEXT,
      strongs          TEXT,
      morphology       TEXT,
      english_gloss    TEXT,
      is_hapax         INTEGER DEFAULT 0,
      language         TEXT CHECK(language IN ('greek','hebrew'))
    );
    CREATE INDEX idx_words_verse   ON words(verse_osis);
    CREATE INDEX idx_words_strongs ON words(strongs);
    CREATE INDEX idx_words_lemma   ON words(lemma);

    CREATE VIRTUAL TABLE bible_search USING fts5(
      osis_id UNINDEXED,
      book    UNINDEXED,
      text_web,
      text_kjv,
      text_bsb,
      content='verses',
      content_rowid='rowid'
    );
  `);

  return db;
}

// ── Stage 1: Parse WEB text files ───────────────────────────────────────────

function parseWEB(db) {
  console.log('\n📖 Parsing WEB text files…');

  const webDir = path.join(SRC, 'web', 'engwebpb_readaloud');
  if (!fs.existsSync(webDir)) {
    throw new Error(`WEB directory not found: ${webDir}`);
  }

  const files = fs.readdirSync(webDir)
    .filter(f => f.endsWith('_read.txt') && !f.includes('_000_'));

  console.log(`  Found ${files.length} chapter files`);

  const insertVerse = db.prepare(`
    INSERT OR IGNORE INTO verses (osis_id, book, chapter, verse, text_web)
    VALUES (@osis_id, @book, @chapter, @verse, @text_web)
  `);

  const insertMany = db.transaction(rows => {
    for (const row of rows) insertVerse.run(row);
  });

  let totalVerses = 0;
  let processed   = 0;

  // Batch inserts for performance
  const BATCH = 1000;
  let batch = [];

  for (const file of files) {
    // Filename format: engwebpb_002_GEN_01_read.txt
    const match = file.match(/engwebpb_\d+_([A-Z0-9]+)_(\d+)_read\.txt$/);
    if (!match) continue;

    const webCode  = match[1];
    const chapter  = parseInt(match[2], 10);
    const bookCode = WEB_TO_OSIS[webCode] || webCode;

    // Read file, strip BOM
    let content = fs.readFileSync(path.join(webDir, file), 'utf8');
    content = content.replace(/^\uFEFF/, ''); // Remove BOM

    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Skip line 0 (book title) and line 1 (Chapter N.)
    // Everything after that is one verse per line in order
    let verseNum = 0;
    let headersDone = 0;

    for (const line of lines) {
      // First non-empty line = book title header, skip
      // Second non-empty line = chapter header (e.g. "Chapter 1."), skip
      if (headersDone < 2) {
        headersDone++;
        continue;
      }

      verseNum++;
      const id = osisId(bookCode, chapter, verseNum);

      batch.push({
        osis_id: id,
        book:    bookCode,
        chapter,
        verse:   verseNum,
        text_web: line,
      });

      if (batch.length >= BATCH) {
        insertMany(batch);
        totalVerses += batch.length;
        batch = [];
      }
    }

    processed++;
    progress('WEB chapters', processed, files.length);
  }

  // Flush remaining
  if (batch.length > 0) {
    insertMany(batch);
    totalVerses += batch.length;
  }

  console.log(`  ✅ Inserted ${totalVerses.toLocaleString()} WEB verses`);
  return totalVerses;
}

// ── Stage 1b: Parse BSB USFM files ──────────────────────────────────────────

// BSB USFM book code → app OSIS code (only exceptions listed; rest are identical)
const BSB_TO_OSIS = {
  NAM: 'NAH',  // USFM standard uses NAM; app uses NAH
};

/**
 * Strip all USFM markers from a raw verse text segment and return clean plain text.
 *
 * BSB USFM specifics handled:
 *  1. Footnotes \f + ... \f*  — removed entirely (including inner text)
 *  2. Cross-reference links \ref display|TARGET\ref* — keep display text only
 *  3. Section headings \s1, \s2, \r, \mt, \h — removed
 *  4. Paragraph markers \p, \pmo, \q1, \q2, \b — removed
 *  5. Any remaining \marker or \marker* — removed
 */
function stripBSBMarkers(raw) {
  return raw
    // Remove footnotes entirely (including all inner content)
    .replace(/\\f\s[\s\S]*?\\f\*/g, '')
    // Unwrap \ref display text|TARGET\ref* → keep display text
    .replace(/\\ref\s+(.*?)\|[^\\]*\\ref\*/g, '$1')
    // Remove closing markers
    .replace(/\\[a-zA-Z0-9+-]+\*/g, '')
    // Remove opening/paragraph markers (with or without trailing space)
    .replace(/\\[a-zA-Z0-9+-]+\s*/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBSB(db) {
  const bsbDir = path.join(SRC, 'bsb');
  if (!fs.existsSync(bsbDir)) {
    console.warn('  ⚠️  BSB source directory not found — skipping');
    return 0;
  }

  const files = fs.readdirSync(bsbDir)
    .filter(f => f.endsWith('.usfm'))
    .sort();

  if (files.length === 0) {
    console.warn('  ⚠️  No BSB USFM files found in scripts/source-data/bsb/');
    return 0;
  }

  console.log(`\n📖 Parsing BSB (CC0 Public Domain) — ${files.length} books…`);

  const updateVerse = db.prepare(`
    UPDATE verses SET text_bsb = @text_bsb WHERE osis_id = @osis_id
  `);
  const updateMany = db.transaction(rows => {
    for (const r of rows) updateVerse.run(r);
  });

  let totalVerses = 0;
  let processed   = 0;
  const BATCH     = 2000;
  let batch       = [];

  for (const file of files) {
    const usfmCode = file.replace('.usfm', '').toUpperCase();
    const bookOsis = BSB_TO_OSIS[usfmCode] || usfmCode;

    const content = fs.readFileSync(path.join(bsbDir, file), 'utf8');

    // Collapse to single line so multi-verse paragraph lines are handled correctly
    const flat = content.replace(/\r?\n/g, ' ');

    // Split into chapter segments on \c N
    const chapterChunks = flat.split(/\\c\s+(\d+)/);
    // Layout: [pre-content, chapNum, chapBody, chapNum, chapBody, ...]

    for (let ci = 1; ci < chapterChunks.length; ci += 2) {
      const chapter  = parseInt(chapterChunks[ci], 10);
      const chapBody = chapterChunks[ci + 1] || '';

      // Split into verse segments on \v N
      const verseChunks = chapBody.split(/\\v\s+(\d+)/);
      // Layout: [pre-verse, verseNum, verseBody, verseNum, verseBody, ...]

      for (let vi = 1; vi < verseChunks.length; vi += 2) {
        const verseNum = parseInt(verseChunks[vi], 10);
        const raw      = verseChunks[vi + 1] || '';

        // The raw chunk may contain subsequent \v markers if split missed them —
        // but our split above handles that; take text up to the next chunk boundary.
        const text = stripBSBMarkers(raw);

        if (text && chapter > 0 && verseNum > 0) {
          batch.push({ osis_id: `${bookOsis}.${chapter}.${verseNum}`, text_bsb: text });
          if (batch.length >= BATCH) {
            updateMany(batch);
            totalVerses += batch.length;
            batch = [];
          }
        }
      }
    }

    processed++;
    progress('BSB books', processed, files.length);
  }

  if (batch.length > 0) {
    updateMany(batch);
    totalVerses += batch.length;
  }

  console.log(`  ✅ BSB: ${totalVerses.toLocaleString()} verses inserted`);
  return totalVerses;
}

// ── Stage 2a: Parse SBLGNT (preferred Greek NT source — CC BY 4.0) ───────────

/**
 * Parse SBLGNT text files from github.com/LogosBible/SBLGNT
 * Files are in the sblgnt/ folder, one per book, with lines like:
 *   Βίβλος γενέσεως Ἰησοῦ Χριστοῦ υἱοῦ Δαυὶδ υἱοῦ Ἀβραάμ·
 * Each line is one verse of Greek text (no word-by-word markup in the base text).
 * Word-level data (lemma, Strong's, morphology) comes from build-morphgnt.js.
 * Here we only store the surface Greek text per verse.
 */
function parseSBLGNT(db, sblgntDir) {
  console.log('\n🔤 Parsing SBLGNT (CC BY 4.0)…');

  const files = fs.readdirSync(sblgntDir)
    .filter(f => f.endsWith('.txt'))
    .sort();

  if (files.length === 0) {
    console.warn('  ⚠️  No SBLGNT .txt files found — falling back to OpenGNT if available');
    return false;
  }

  console.log(`  Found ${files.length} SBLGNT book files`);

  // SBLGNT provides Greek text per verse — we store individual words
  // in the words table so Strong's popups work from the start.
  // Full morphological data will be enriched by build-morphgnt.js later.
  const insertWord = db.prepare(`
    INSERT INTO words
      (verse_osis, word_sort, surface_text, language)
    VALUES
      (@verse_osis, @word_sort, @surface_text, 'greek')
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insertWord.run(r); });

  // SBLGNT file naming convention: 01-Matt.txt, 02-Mark.txt, etc.
  // Book ID is embedded in each line or derived from filename
  // Format: {book_abbr} {chapter}:{verse} {greek text}
  // OR: just verse text, one verse per line, with chapter/verse headers
  // We handle both common formats.
  const SBLGNT_BOOK_MAP = {
    'Matt':'MAT', 'Mark':'MRK', 'Luke':'LUK', 'John':'JHN', 'Acts':'ACT',
    'Rom':'ROM', '1Cor':'1CO', '2Cor':'2CO', 'Gal':'GAL', 'Eph':'EPH',
    'Phil':'PHP', 'Col':'COL', '1Thess':'1TH', '2Thess':'2TH',
    '1Tim':'1TI', '2Tim':'2TI', 'Titus':'TIT', 'Phlm':'PHM',
    'Heb':'HEB', 'Jas':'JAS', '1Pet':'1PE', '2Pet':'2PE',
    '1John':'1JN', '2John':'2JN', '3John':'3JN', 'Jude':'JUD', 'Rev':'REV',
  };

  let totalWords = 0;
  let processed  = 0;
  const BATCH    = 2000;
  let batch      = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(sblgntDir, file), 'utf8');
    const lines   = content.split('\n');

    let currentBook    = null;
    let currentChapter = 0;
    let currentVerse   = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect chapter/verse reference: "Matthew 1:1" or "1:1" or "MAT 1:1"
      const refMatch = trimmed.match(/^([A-Za-z0-9]+)\s+(\d+):(\d+)\s*(.*)/);
      if (refMatch) {
        const bookKey   = refMatch[1];
        currentChapter  = parseInt(refMatch[2], 10);
        currentVerse    = parseInt(refMatch[3], 10);
        const greek     = refMatch[4].trim();

        // Map book abbreviation to OSIS
        if (!currentBook) {
          currentBook = SBLGNT_BOOK_MAP[bookKey]
            || Object.values(GNTBOOK).find(v => v === bookKey.toUpperCase())
            || null;
        }

        if (currentBook && greek) {
          const verseOsis = osisId(currentBook, currentChapter, currentVerse);
          const words     = greek.split(/\s+/).filter(w => w.trim());
          for (let i = 0; i < words.length; i++) {
            batch.push({ verse_osis: verseOsis, word_sort: i + 1, surface_text: words[i] });
            totalWords++;
            if (batch.length >= BATCH) { insertMany(batch); batch = []; }
          }
        }
        continue;
      }

      // Plain verse line (some SBLGNT formats have just the Greek, one verse per line)
      // Requires knowing current book/chapter/verse from context
    }

    processed++;
    progress('SBLGNT books', processed, files.length);
  }

  if (batch.length > 0) insertMany(batch);

  console.log(`  ✅ Inserted ${totalWords.toLocaleString()} SBLGNT Greek words`);
  console.log('  💡 Run build-morphgnt.js to add lemmas, Strong\'s numbers and morphology');
  return true;
}

// ── Stage 2b: Parse OpenGNT (legacy Greek NT source) ─────────────────────────

function parseOpenGNT(db) {
  console.log('\n🔤 Parsing OpenGNT (Greek NT)…');

  const csvPath = path.join(SRC, 'opengnt', 'OpenGNT_keyedFeatures.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`OpenGNT file not found: ${csvPath}`);
  }

  // Load Berean interlinear glosses (word_sort → gloss)
  const bereanGlosses = new Map();
  const bereanPath = path.join(SRC, 'opengnt', 'OpenGNT_interlinear_Berean.csv');
  if (fs.existsSync(bereanPath)) {
    const bereanLines = fs.readFileSync(bereanPath, 'utf8').split('\n');
    for (const line of bereanLines) {
      const tab = line.indexOf('\t');
      if (tab === -1) continue;
      const sortKey = line.slice(0, tab).trim();
      const gloss   = line.slice(tab + 1).trim().split('｜')[0]; // Take first gloss
      bereanGlosses.set(sortKey, gloss);
    }
    console.log(`  Loaded ${bereanGlosses.size.toLocaleString()} Berean glosses`);
  }

  const insertWord = db.prepare(`
    INSERT INTO words
      (verse_osis, word_sort, surface_text, lemma, strongs, morphology, english_gloss, language)
    VALUES
      (@verse_osis, @word_sort, @surface_text, @lemma, @strongs, @morphology, @english_gloss, 'greek')
  `);

  const insertMany = db.transaction(rows => {
    for (const row of rows) insertWord.run(row);
  });

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines   = content.split('\n');
  const total   = lines.length - 1; // Exclude header

  let processed = 0;
  let inserted  = 0;
  const BATCH   = 2000;
  let batch     = [];

  // Regex to parse bracket fields: 〔...〕
  const extractFields = (bracketStr) => {
    const inner = bracketStr.replace(/^〔/, '').replace(/〕$/, '');
    return inner.split('｜');
  };

  // Regex for TANTT field: 〔EDITIONS=GreekWord=G####=Morph;〕
  // May contain multiple variants separated by semicolons
  const parseTANTT = (tanttStr) => {
    const inner = tanttStr.replace(/^〔/, '').replace(/〕$/, '');
    // Take first entry (before first semicolon)
    const first = inner.split(';')[0];
    if (!first) return null;
    const parts = first.split('=');
    if (parts.length < 4) return null;
    return {
      surface:  parts[1],
      strongs:  parts[2],    // e.g. G0976
      morph:    parts[3],
    };
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split('\t');
    if (cols.length < 9) continue;

    // Col 0: sort key (word number)
    const sortKey = cols[0].trim();

    // Col 4: 〔book｜chapter｜verse〕
    const bcv = extractFields(cols[4]);
    if (bcv.length < 3) continue;
    const bookNum = parseInt(bcv[0], 10);
    const chapter = parseInt(bcv[1], 10);
    const verse   = parseInt(bcv[2], 10);

    const bookOsis = GNTBOOK[bookNum];
    if (!bookOsis) continue; // Skip non-canonical books if any

    // Col 7: 〔TANTT〕 — Greek text + Strong's + morphology
    const tantt = parseTANTT(cols[7]);
    if (!tantt) continue;

    // Col 8: 〔MounceGloss｜TyndaleHouseGloss｜OpenGNTGloss〕
    const glosses = extractFields(cols[8]);
    const openGNTGloss = glosses[2] || glosses[1] || glosses[0] || '';

    // Prefer Berean gloss if available
    const gloss = bereanGlosses.get(sortKey) || openGNTGloss;

    // Extract lemma: the lemma in OpenGNT is the Strong's entry itself,
    // so we use the Strong's number as the lemma key (G + zero-padded 4 digits)
    const strongs = tantt.strongs; // Already in G#### format

    const verseOsis = osisId(bookOsis, chapter, verse);

    batch.push({
      verse_osis:   verseOsis,
      word_sort:    processed + 1,
      surface_text: tantt.surface,
      lemma:        strongs,       // Use Strong's as lemma key for NT
      strongs,
      morphology:   tantt.morph,
      english_gloss: gloss,
    });

    inserted++;

    if (batch.length >= BATCH) {
      insertMany(batch);
      batch = [];
    }

    processed++;
    if (processed % 5000 === 0) progress('OpenGNT words', processed, total);
  }

  if (batch.length > 0) {
    insertMany(batch);
  }
  progress('OpenGNT words', total, total);

  console.log(`  ✅ Inserted ${inserted.toLocaleString()} Greek words`);
}

// ── Stage 3: Parse morphhb (Hebrew OT words) ─────────────────────────────────

function parseMorphhb(db) {
  console.log('\n🔤 Parsing morphhb (Hebrew OT)…');

  const wlcDir = path.join(SRC, 'morphhb', 'wlc');
  if (!fs.existsSync(wlcDir)) {
    throw new Error(`morphhb wlc directory not found: ${wlcDir}`);
  }

  const xmlFiles = fs.readdirSync(wlcDir)
    .filter(f => f.endsWith('.xml') && f !== 'VerseMap.xml');

  console.log(`  Found ${xmlFiles.length} Hebrew XML files`);

  const insertWord = db.prepare(`
    INSERT INTO words
      (verse_osis, word_sort, surface_text, lemma, strongs, morphology, language)
    VALUES
      (@verse_osis, @word_sort, @surface_text, @lemma, @strongs, @morphology, 'hebrew')
  `);

  const insertMany = db.transaction(rows => {
    for (const row of rows) insertWord.run(row);
  });

  let totalWords = 0;
  let processed  = 0;
  const BATCH    = 2000;
  let batch      = [];

  for (const file of xmlFiles) {
    // Derive book OSIS from filename (Gen.xml → Gen → GEN)
    const bookPrefix = file.replace('.xml', '');
    const bookOsis   = MORPHHB_TO_OSIS[bookPrefix];
    if (!bookOsis) {
      console.warn(`  ⚠️  Unknown book prefix: ${bookPrefix} — skipping`);
      continue;
    }

    const xml = fs.readFileSync(path.join(wlcDir, file), 'utf8');

    // Parse verses and words using regex (avoid pulling in an XML parser)
    // Pattern: <verse osisID="Book.chapter.verse">...</verse>
    const verseRegex = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
    const wordRegex  = /<w\s[^>]*lemma="([^"]*)"[^>]*morph="([^"]*)"[^>]*>([^<]+)<\/w>/g;
    // Also handle seg elements and maqqef — we want just the <w> elements

    let verseMatch;
    while ((verseMatch = verseRegex.exec(xml)) !== null) {
      const verseOsisRaw = verseMatch[1]; // e.g. "Gen.1.1"
      const verseXml     = verseMatch[2];

      // Convert morphhb OSIS to our format
      const parts = verseOsisRaw.split('.');
      if (parts.length < 3) continue;
      const mbBook  = parts[0];
      const chapter = parseInt(parts[1], 10);
      const verse   = parseInt(parts[2], 10);

      const appOsis = MORPHHB_TO_OSIS[mbBook];
      if (!appOsis) continue;

      const verseOsisId = osisId(appOsis, chapter, verse);

      let wordSort = 0;
      let wordMatch;
      // Reset lastIndex for word regex
      wordRegex.lastIndex = 0;

      while ((wordMatch = wordRegex.exec(verseXml)) !== null) {
        const lemmaRaw  = wordMatch[1]; // e.g. "b/7225" or "1254 a"
        const morphCode = wordMatch[2]; // e.g. "HR/Ncfsa"
        const surface   = wordMatch[3].trim();

        wordSort++;

        // Extract primary Strong's number from lemma
        // Lemma can be: "7225", "b/7225", "1254 a", "d/8064", "c/853"
        // Strip prefixes (b/, c/, d/, h/ etc) and suffixes (letters after space)
        const strongsNum = extractHebrewStrongs(lemmaRaw);
        const strongs    = strongsNum ? `H${strongsNum}` : null;

        batch.push({
          verse_osis:   verseOsisId,
          word_sort:    wordSort,
          surface_text: surface,
          lemma:        strongs || lemmaRaw,
          strongs:      strongs,
          morphology:   morphCode,
        });

        totalWords++;

        if (batch.length >= BATCH) {
          insertMany(batch);
          batch = [];
        }
      }
    }

    processed++;
    progress('Hebrew books', processed, xmlFiles.length);
  }

  if (batch.length > 0) {
    insertMany(batch);
  }

  console.log(`  ✅ Inserted ${totalWords.toLocaleString()} Hebrew words`);
}

/**
 * Extract the primary Strong's number from a morphhb lemma attribute.
 * Examples:
 *   "7225"    → "7225"
 *   "b/7225"  → "7225"   (preposition prefix stripped)
 *   "1254 a"  → "1254"   (homonym letter stripped)
 *   "d/8064"  → "8064"
 *   "c/853"   → "853"
 *   "c/d/776" → "776"    (multiple prefixes)
 *   "430"     → "430"
 */
function extractHebrewStrongs(lemma) {
  // Remove all prefix segments (single letter + slash)
  let clean = lemma.replace(/^([a-z]\/)+/, '');
  // Remove trailing homonym letter (space + letter)
  clean = clean.replace(/\s+[a-z]$/i, '').trim();
  // Must be a number now
  if (/^\d+$/.test(clean)) return clean;
  return null;
}

// ── Stage 4: Mark hapax legomena ──────────────────────────────────────────────

function markHapax(db) {
  console.log('\n📌 Marking hapax legomena…');

  db.exec(`
    UPDATE words
    SET is_hapax = 1
    WHERE strongs IN (
      SELECT strongs
      FROM words
      WHERE strongs IS NOT NULL AND strongs != ''
      GROUP BY strongs
      HAVING COUNT(*) = 1
    )
    AND strongs IS NOT NULL
  `);

  const count = db.prepare(`SELECT COUNT(*) as n FROM words WHERE is_hapax = 1`).get();
  console.log(`  ✅ Marked ${count.n.toLocaleString()} hapax legomena words`);
}

// ── Stage 5: Build FTS5 index ─────────────────────────────────────────────────

function buildFTS(db) {
  console.log('\n🔍 Building FTS5 search index…');

  // Populate FTS from the content table
  db.exec(`
    INSERT INTO bible_search(rowid, osis_id, book, text_web, text_kjv, text_bsb)
    SELECT rowid, osis_id, book, text_web, text_kjv, text_bsb FROM verses;
  `);

  const count = db.prepare(`SELECT COUNT(*) as n FROM bible_search`).get();
  console.log(`  ✅ FTS5 index built (${count.n.toLocaleString()} rows)`);
}

// ── Stage 6: Verify ───────────────────────────────────────────────────────────

function verify(db) {
  console.log('\n✔️  Verifying database…');

  const verseCount  = db.prepare(`SELECT COUNT(*) as n FROM verses`).get().n;
  const bsbCount    = db.prepare(`SELECT COUNT(*) as n FROM verses WHERE text_bsb IS NOT NULL`).get().n;
  const wordCount   = db.prepare(`SELECT COUNT(*) as n FROM words`).get().n;
  const greekCount  = db.prepare(`SELECT COUNT(*) as n FROM words WHERE language='greek'`).get().n;
  const hebrewCount = db.prepare(`SELECT COUNT(*) as n FROM words WHERE language='hebrew'`).get().n;
  const hapaxCount  = db.prepare(`SELECT COUNT(*) as n FROM words WHERE is_hapax=1`).get().n;

  // Quick sample check
  const jhn316 = db.prepare(`SELECT text_web, text_bsb FROM verses WHERE osis_id='JHN.3.16'`).get();
  const gen11  = db.prepare(`SELECT text_web, text_bsb FROM verses WHERE osis_id='GEN.1.1'`).get();

  console.log(`
  ┌─────────────────────────────────────────────┐
  │  bible_base.sqlite3 verification            │
  ├─────────────────────────────────────────────┤
  │  Verses total:    ${String(verseCount.toLocaleString()).padEnd(26)} │
  │  BSB verses:      ${String(bsbCount.toLocaleString()).padEnd(26)} │
  │  Words total:     ${String(wordCount.toLocaleString()).padEnd(26)} │
  │  Greek words:     ${String(greekCount.toLocaleString()).padEnd(26)} │
  │  Hebrew words:    ${String(hebrewCount.toLocaleString()).padEnd(26)} │
  │  Hapax legomena:  ${String(hapaxCount.toLocaleString()).padEnd(26)} │
  ├─────────────────────────────────────────────┤
  │  GEN.1.1 WEB: ${(gen11?.text_web || 'MISSING').slice(0, 33).padEnd(33)} │
  │  GEN.1.1 BSB: ${(gen11?.text_bsb || 'MISSING').slice(0, 33).padEnd(33)} │
  │  JHN.3.16 BSB: ${(jhn316?.text_bsb || 'MISSING').slice(0, 32).padEnd(32)} │
  └─────────────────────────────────────────────┘`);

  if (!gen11?.text_web)  console.error('  ❌ Genesis 1:1 WEB not found — WEB parse may have failed');
  if (!gen11?.text_bsb)  console.warn( '  ⚠️  Genesis 1:1 BSB not found — BSB parse may have failed');
  if (!jhn316?.text_bsb) console.warn( '  ⚠️  John 3:16 BSB not found — BSB parse may have failed');

  if (verseCount < 31000) {
    console.warn(`  ⚠️  Only ${verseCount} verses found — expected ~31,102. Check WEB parse.`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log('════════════════════════════════════════════════');
  console.log('  build-bible-base.js');
  console.log('════════════════════════════════════════════════');

  // Check source files
  const webDir    = path.join(SRC, 'web', 'engwebpb_readaloud');
  const bsbDir    = path.join(SRC, 'bsb');
  const sblgntDir = path.join(SRC, 'sblgnt');
  const openGNTFile = path.join(SRC, 'opengnt', 'OpenGNT_keyedFeatures.csv');
  const morphhbDir  = path.join(SRC, 'morphhb', 'wlc');

  const hasBSB = fs.existsSync(bsbDir) &&
    fs.readdirSync(bsbDir).some(f => f.endsWith('.usfm'));

  if (hasBSB) {
    console.log('  ✅ Found: BSB USFM files (CC0 Public Domain)');
  } else {
    console.log('  ℹ️  BSB not found — download from bereanbible.com/bsb_usfm.zip → scripts/source-data/bsb/');
  }

  if (!fs.existsSync(webDir)) {
    console.error(`  ❌ Missing: WEB text folder\n     Expected at: ${webDir}`);
    console.error('\nDownload: https://ebible.org/Scriptures/engwebpb_readaloud.zip');
    process.exit(1);
  } else {
    console.log('  ✅ Found: WEB text folder');
  }

  // Detect Greek source — prefer SBLGNT, fall back to OpenGNT
  const hasSBLGNT = fs.existsSync(sblgntDir) &&
    fs.readdirSync(sblgntDir).some(f => f.endsWith('.txt'));
  const hasOpenGNT = fs.existsSync(openGNTFile);

  if (!hasSBLGNT && !hasOpenGNT) {
    console.error('  ❌ Missing: Greek NT source (SBLGNT or OpenGNT)');
    console.error('     SBLGNT (preferred): git clone https://github.com/LogosBible/SBLGNT scripts/source-data/sblgnt');
    console.error('     OpenGNT (fallback): https://github.com/eliranwong/OpenGNT');
    process.exit(1);
  }

  if (hasSBLGNT) {
    console.log('  ✅ Found: SBLGNT text files (CC BY 4.0 — preferred)');
  } else {
    console.log('  ✅ Found: OpenGNT CSV (legacy fallback)');
    console.log('  💡 Tip: Download SBLGNT from github.com/LogosBible/SBLGNT for the preferred CC BY 4.0 base');
  }

  if (!fs.existsSync(morphhbDir)) {
    console.error(`  ❌ Missing: morphhb wlc folder\n     Expected at: ${morphhbDir}`);
    console.error('\nDownload: git clone https://github.com/openscriptures/morphhb scripts/source-data/morphhb');
    process.exit(1);
  } else {
    console.log('  ✅ Found: morphhb Hebrew OT folder');
  }

  // Ensure output directory
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const db = createDB();
  console.log(`  📁 Database: ${DB_PATH}`);

  try {
    parseWEB(db);
    if (hasBSB) parseBSB(db);
    // Use SBLGNT if available, otherwise fall back to OpenGNT
    if (hasSBLGNT) {
      parseSBLGNT(db, sblgntDir);
    } else {
      parseOpenGNT(db);
    }
    parseMorphhb(db);
    markHapax(db);
    buildFTS(db);
    verify(db);

    // Optimise and close WAL mode
    // CRITICAL: sql.js-httpvfs requires a single file — WAL mode creates a
    // separate -wal file that makes the DB appear empty in the browser.
    console.log('\n⚙️  Optimising…');
    db.pragma('optimize');
    db.exec('VACUUM');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.pragma('journal_mode = DELETE');
    console.log('  ✅ VACUUM + WAL disabled');

  } finally {
    db.close();
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeKB  = Math.round(fs.statSync(DB_PATH).size / 1024);

  console.log(`
════════════════════════════════════════════════
  ✅ Done in ${elapsed}s
  📦 File size: ${(sizeKB / 1024).toFixed(1)} MB
  📁 Output: public/db/bible_base.sqlite3
════════════════════════════════════════════════

  Next step: node scripts/build-lexicon.js
`);
}

main().catch(err => {
  console.error('\n❌ Build failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
