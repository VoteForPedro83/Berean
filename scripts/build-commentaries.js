#!/usr/bin/env node
/* ============================================================
   build-commentaries.js
   Produces: public/db/commentaries.sqlite3

   Reads MyBible-format commentary SQLite files (.db / .commentaryx)
   from scripts/source-data/commentaries/mybible/

   Download free commentaries from: https://mybible.zone/downloads-eng.php
   Recommended Reformed commentaries:
     - Calvin.commentaryx         (John Calvin)
     - Gill.commentaryx           (John Gill — Calvinist)
     - MHC.commentaryx            (Matthew Henry Complete)
     - JFB.commentaryx            (Jamieson, Fausset & Brown)
     - Barnes.commentaryx         (Barnes' Notes)
     - Geneva.commentaryx         (1599 Geneva Bible Notes)
     - TSK.commentaryx            (Treasury of Scripture Knowledge)
     - Spurgeon-Psalms.commentaryx (Spurgeon — Psalms only)

   MyBible schema:
     commentary(book_number INTEGER, chapter_number_from INTEGER,
                verse_number_from INTEGER, chapter_number_to INTEGER,
                verse_number_to INTEGER, text TEXT)
   Book numbers: multiples of 10 — Gen=10, Exo=20 … Rev=660
                 OR sequential 1-66 (both handled)

   Run: node scripts/build-commentaries.js
   ============================================================ */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire }  from 'module';

const require   = createRequire(import.meta.url);
const Database  = require('better-sqlite3');

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const SRC        = path.join(__dirname, 'source-data', 'commentaries', 'mybible');
const OUTPUT_DIR = path.join(ROOT, 'public', 'db');
const DB_PATH    = path.join(OUTPUT_DIR, 'commentaries.sqlite3');

// ── MyBible book number → OSIS ────────────────────────────────────────────────
// MyBible uses multiples of 10: Gen=10, Exo=20 … Rev=660
// But some modules use sequential 1-66 — we handle both.

const MYBIBLE_TO_OSIS_10 = {
  10:'GEN', 20:'EXO', 30:'LEV', 40:'NUM', 50:'DEU', 60:'JOS', 70:'JDG',
  80:'RUT', 90:'1SA', 100:'2SA', 110:'1KI', 120:'2KI', 130:'1CH', 140:'2CH',
  150:'EZR', 160:'NEH', 170:'EST', 180:'JOB', 190:'PSA', 200:'PRO',
  210:'ECC', 220:'SNG', 230:'ISA', 240:'JER', 250:'LAM', 260:'EZK',
  270:'DAN', 280:'HOS', 290:'JOL', 300:'AMO', 310:'OBA', 320:'JON',
  330:'MIC', 340:'NAH', 350:'HAB', 360:'ZEP', 370:'HAG', 380:'ZEC',
  390:'MAL',
  400:'MAT', 410:'MRK', 420:'LUK', 430:'JHN', 440:'ACT',
  450:'ROM', 460:'1CO', 470:'2CO', 480:'GAL', 490:'EPH',
  500:'PHP', 510:'COL', 520:'1TH', 530:'2TH', 540:'1TI',
  550:'2TI', 560:'TIT', 570:'PHM', 580:'HEB', 590:'JAS',
  600:'1PE', 610:'2PE', 620:'1JN', 630:'2JN', 640:'3JN',
  650:'JUD', 660:'REV',
};

const SEQ_TO_OSIS = [
  null,
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA',
  '1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO',
  'ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO',
  'OBA','JON','MIC','NAH','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH',
  'PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS',
  '1PE','2PE','1JN','2JN','3JN','JUD','REV',
];

function bookNumberToOsis(n) {
  // Try multiples-of-10 first, then sequential
  if (MYBIBLE_TO_OSIS_10[n]) return MYBIBLE_TO_OSIS_10[n];
  if (n >= 1 && n <= 66)     return SEQ_TO_OSIS[n] || null;
  return null;
}

// ── Friendly display names & authors ─────────────────────────────────────────

const MODULE_META = {
  // filename stem (case-insensitive, spaces/hyphens → underscores) → { abbr, author }

  // Calvin
  'calvin_john_complete_commentary':  { abbr: 'CALVIN', author: 'John Calvin' },
  'calvin__john___commentary_on_romans': { abbr: 'CALVIN', author: 'John Calvin' },
  'calvin':                           { abbr: 'CALVIN', author: 'John Calvin' },
  'calvin_comm':                      { abbr: 'CALVIN', author: 'John Calvin' },

  // Gill
  'gill':                             { abbr: 'GILL',   author: 'John Gill' },
  'gill_exp':                         { abbr: 'GILL',   author: 'John Gill' },
  'trapp_john___complete_commentary_ot_nt': { abbr: 'TRAPP', author: 'John Trapp' },

  // Matthew Henry
  'mhc':                              { abbr: 'MHC',    author: 'Matthew Henry (Complete)' },
  'matthew_henry_concise_commentary': { abbr: 'MHCC',   author: 'Matthew Henry (Concise)' },
  'matthewhenry':                     { abbr: 'MHC',    author: 'Matthew Henry (Complete)' },
  'matthew_henry':                    { abbr: 'MHC',    author: 'Matthew Henry (Complete)' },
  'henry':                            { abbr: 'MHC',    author: 'Matthew Henry (Complete)' },
  'mhcc':                             { abbr: 'MHCC',   author: 'Matthew Henry (Concise)' },

  // Matthew Poole
  'mpcc':                             { abbr: 'POOLE',  author: 'Matthew Poole' },
  'matthew_pool_commentary':          { abbr: 'POOLE',  author: 'Matthew Poole' },
  'poole':                            { abbr: 'POOLE',  author: 'Matthew Poole' },

  // JFB
  'jfb':                              { abbr: 'JFB',    author: 'Jamieson, Fausset & Brown' },
  'jamieson':                         { abbr: 'JFB',    author: 'Jamieson, Fausset & Brown' },

  // Barnes
  'barnes':                           { abbr: 'BARNES', author: 'Albert Barnes' },
  'barnes_notes':                     { abbr: 'BARNES', author: 'Albert Barnes' },

  // Geneva
  'geneva':                           { abbr: 'GENEVA', author: 'Geneva Bible Notes (1599)' },
  'genevabiblenotes':                 { abbr: 'GENEVA', author: 'Geneva Bible Notes (1599)' },
  'genevanotes':                      { abbr: 'GENEVA', author: 'Geneva Bible Notes (1599)' },

  // Spurgeon
  'treaury_of_david':                 { abbr: 'SPURG',  author: 'C.H. Spurgeon' },
  'spurgeon_matthew__apple_devices_': { abbr: 'SPURG',  author: 'C.H. Spurgeon' },
  'spurgeon_charles___sermon_bible_commentary_from_the_major_prophets': { abbr: 'SPURG', author: 'C.H. Spurgeon' },
  'spurgeon_charles___sermon_commentary_from_the_books_of_law_and_history': { abbr: 'SPURG', author: 'C.H. Spurgeon' },
  'spurgeon_charles___sermon_commentary_from_the_books_of_poetry': { abbr: 'SPURG', author: 'C.H. Spurgeon' },
  'spurgeon':                         { abbr: 'SPURG',  author: 'C.H. Spurgeon' },
  'treasury':                         { abbr: 'SPURG',  author: 'C.H. Spurgeon' },

  // J.C. Ryle
  'jc_ryle_expository_thoughts':      { abbr: 'RYLE',   author: 'J.C. Ryle' },

  // A.W. Pink
  'aw_pink___john_and_hebrews':       { abbr: 'PINK',   author: 'A.W. Pink' },
  'aw_pink_john_and_hebrews':         { abbr: 'PINK',   author: 'A.W. Pink' },
  'exposition_of_the_gospels_of_john_and_hebrews_by_a_w__pink_commentary': { abbr: 'PINK', author: 'A.W. Pink' },

  // John Owen
  'owenhebrews_commentary__apple_devices_': { abbr: 'OWEN', author: 'John Owen' },
  'owenhebrews_commentary_apple_devices': { abbr: 'OWEN', author: 'John Owen' },
  'owen':                             { abbr: 'OWEN',   author: 'John Owen' },

  // Martin Luther
  'martin_luthers_commentary_on_galatians_galatians_cmt': { abbr: 'LUTHER', author: 'Martin Luther' },
  'martin_luther':                    { abbr: 'LUTHER', author: 'Martin Luther' },

  // Henry Alford (single-underscore normalized keys)
  'alford_henry_the_greek_testament':    { abbr: 'ALFORD', author: 'Henry Alford' },
  'alford__henry___the_greek_testament': { abbr: 'ALFORD', author: 'Henry Alford' },
  'alford_henry___the_greek_testament':  { abbr: 'ALFORD', author: 'Henry Alford' },

  // Jonathan Edwards
  'edwards_jonathan_notes_on_the_scriptures_with_a_commentary_on_hebrews_edited_by_john_h_gerstner': { abbr: 'EDWARDS', author: 'Jonathan Edwards' },
  'edwards_jonathan___notes_on_the_scriptures_with_a_commentary_on_hebrews_edited_by_john_h_gerstner': { abbr: 'EDWARDS', author: 'Jonathan Edwards' },

  // John Trapp
  'trapp_john_complete_commentary_ot_nt':    { abbr: 'TRAPP', author: 'John Trapp' },
  'trapp_john___complete_commentary_ot_nt':  { abbr: 'TRAPP', author: 'John Trapp' },

  // C.H. Mackintosh
  'notes_on_the_pentateuch_by_c_h_mackintosh': { abbr: 'MACK', author: 'C.H. Mackintosh' },

  // Martin Luther
  'martin_luthers_commentary_on_galatians_galatians_cmt': { abbr: 'LUTHER', author: 'Martin Luther' },
  'martin_luther__39_s_commentary_on_galatians__galatians_cmt_': { abbr: 'LUTHER', author: 'Martin Luther' },

  // Others
  'tsk':                              { abbr: 'TSK',    author: 'Treasury of Scripture Knowledge' },
  'clarke':                           { abbr: 'CLARKE', author: 'Adam Clarke' },
  'adam_clarke':                      { abbr: 'CLARKE', author: 'Adam Clarke' },
  'benson':                           { abbr: 'BENSON', author: 'Joseph Benson' },
  'cambridge':                        { abbr: 'CAMB',   author: 'Cambridge Bible Commentary' },
  'cambridge_greek':                  { abbr: 'CAMBGK', author: 'Cambridge Greek Testament' },
  'maclaren':                         { abbr: 'MACL',   author: 'Alexander Maclaren' },
};

function getMeta(filename) {
  const stem = path.basename(filename, path.extname(filename))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')   // spaces, hyphens, dots, commas → underscore
    .replace(/_+/g, '_')           // collapse multiple underscores
    .replace(/^_|_$/g, '');        // trim leading/trailing underscores
  return MODULE_META[stem] || { abbr: stem.toUpperCase().slice(0, 8), author: stem.replace(/_/g, ' ') };
}

// ── Database setup ───────────────────────────────────────────────────────────

function createDB() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) { fs.unlinkSync(DB_PATH); console.log('  Removed old commentaries.sqlite3'); }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');

  db.exec(`
    CREATE TABLE commentaries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id      TEXT NOT NULL,
      chapter      INTEGER NOT NULL,
      verse_start  INTEGER NOT NULL,
      verse_end    INTEGER NOT NULL,
      source_abbr  TEXT NOT NULL,
      author       TEXT,
      html_content TEXT NOT NULL
    );
    CREATE INDEX idx_comm_lookup ON commentaries(book_id, chapter, verse_start);
    CREATE INDEX idx_comm_source ON commentaries(source_abbr);
  `);

  return db;
}

// ── Load a single MyBible commentary .db file ─────────────────────────────────

function loadMyBibleFile(db, filePath) {
  const meta   = getMeta(filePath);
  const insert = db.prepare(
    `INSERT INTO commentaries (book_id, chapter, verse_start, verse_end, source_abbr, author, html_content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  let src;
  try {
    src = new Database(filePath, { readonly: true });
  } catch (err) {
    console.warn(`  ⚠️  Could not open ${path.basename(filePath)}: ${err.message}`);
    return 0;
  }

  // Detect which schema this file uses
  const tables = src.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);

  let rows = null;

  if (tables.includes('VerseCommentary')) {
    // ── e-Sword iOS .cmti format ──────────────────────────────
    // Tables: Details, BookCommentary, ChapterCommentary, VerseCommentary
    // VerseCommentary(Book INT, ChapterBegin INT, VerseBegin INT,
    //                 ChapterEnd INT, VerseEnd INT, Comments TEXT)
    // Book = sequential 1-66
    rows = src.prepare(
      `SELECT Book AS book_number,
              ChapterBegin AS chapter_number_from, VerseBegin AS verse_number_from,
              ChapterEnd   AS chapter_number_to,   VerseEnd   AS verse_number_to,
              Comments AS text
       FROM VerseCommentary
       ORDER BY Book, ChapterBegin, VerseBegin`
    ).all();

  } else if (tables.includes('Verses')) {
    // ── e-Sword PC .cmtx format ───────────────────────────────
    // Tables: Details, Books, Chapters, Verses
    // Verses(Book INT, ChapterBegin INT, ChapterEnd INT,
    //        VerseBegin INT, VerseEnd INT, Comments BLOB_TEXT)
    // Comments is stored as a proprietary encrypted blob — not decodable.
    // Skip silently and prefer the .cmti version if available.
    console.warn(`  ⚠️  Skipping ${path.basename(filePath)} — .cmtx PC format uses proprietary encryption.`);
    console.warn(`      Download the .cmti (iOS) version of this commentary instead.`);
    src.close();
    return 0;

  } else if (tables.includes('commentary')) {
    // ── Try multiple commentary table schemas ──────────────────
    const commentaryTries = [
      // MyBible .commentaries.SQLite3
      `SELECT book_number AS book_number, chapter_number_from, verse_number_from,
              chapter_number_to, verse_number_to, text
       FROM commentary ORDER BY book_number, chapter_number_from, verse_number_from`,
      // Cambridge-style: (id, book, chapter, fromverse, toverse, data)
      `SELECT book AS book_number, chapter AS chapter_number_from, fromverse AS verse_number_from,
              chapter AS chapter_number_to, toverse AS verse_number_to, data AS text
       FROM commentary ORDER BY book, chapter, fromverse`,
      // Generic fallback: book/chapter/verse/text
      `SELECT book AS book_number, chapter AS chapter_number_from, verse AS verse_number_from,
              chapter AS chapter_number_to, verse AS verse_number_to, text
       FROM commentary ORDER BY book, chapter, verse`,
    ];
    for (const sql of commentaryTries) {
      try { rows = src.prepare(sql).all(); break; } catch { /* try next */ }
    }

  } else if (tables.includes('Topics')) {
    // ── e-Sword Reference Book .refx format ───────────────────
    // Not verse-indexed — skip
    console.warn(`  ⚠️  Skipping ${path.basename(filePath)} — .refx reference books are not verse-indexed.`);
    src.close();
    return 0;

  } else {
    const tableList = tables.join(', ');
    console.warn(`  ⚠️  Unknown schema in ${path.basename(filePath)}. Tables: ${tableList}`);
    src.close();
    return 0;
  }
  src.close();

  let count = 0;
  const run = db.transaction(() => {
    for (const r of rows) {
      // SEQ_TO_OSIS handles both sequential 1-66 AND multiples-of-10
      const bookOsis = bookNumberToOsis(r.book_number);
      if (!bookOsis) continue;
      const vs  = r.verse_number_from ?? 1;
      const ve  = r.verse_number_to   ?? vs;
      const ch  = r.chapter_number_from ?? 1;
      const txt = (r.text || '').trim();
      if (!txt) continue;
      insert.run(bookOsis, ch, vs, ve, meta.abbr, meta.author, txt);
      count++;
    }
  });
  run();

  console.log(`  ✅  ${meta.abbr} (${meta.author}): ${count.toLocaleString()} entries`);
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔨 Building commentaries.sqlite3…\n');
  fs.mkdirSync(SRC, { recursive: true });

  // Find all .db and .commentaryx files
  const files = fs.readdirSync(SRC)
    .filter(f => f.endsWith('.db') || f.endsWith('.commentaryx') || f.endsWith('.cmtx')
              || f.endsWith('.cmti') || f.endsWith('.refx') || f.endsWith('.resx')
              || f.endsWith('.sqlite') || f.endsWith('.sqlite3'))
    .map(f => path.join(SRC, f));

  if (files.length === 0) {
    console.log('  ⚠️  No commentary files found.\n');
    console.log('  Download Reformed commentaries from:');
    console.log('  https://mybible.zone/downloads-eng.php\n');
    console.log('  Recommended (Reformed):');
    console.log('    Calvin.commentaryx  — John Calvin (the Reformed classic)');
    console.log('    Gill.commentaryx    — John Gill (strongly Calvinist)');
    console.log('    MHC.commentaryx     — Matthew Henry Complete');
    console.log('    Geneva.commentaryx  — 1599 Geneva Bible Notes');
    console.log('    JFB.commentaryx     — Jamieson, Fausset & Brown');
    console.log('    Barnes.commentaryx  — Barnes\' Notes');
    console.log('    TSK.commentaryx     — Treasury of Scripture Knowledge\n');
    console.log(`  Place downloaded files in:\n  ${SRC}\n`);
  }

  const db = createDB();

  let total = 0;
  for (const f of files) {
    console.log(`  Loading ${path.basename(f)}…`);
    try {
      total += loadMyBibleFile(db, f);
    } catch (err) {
      console.warn(`  ⚠️  Error loading ${path.basename(f)}: ${err.message}`);
    }
  }

  // ── Deduplicate — keep first occurrence of any source+book+chapter+verse ──────
  console.log('\n  Deduplicating…');
  const before = db.prepare('SELECT COUNT(*) as n FROM commentaries').get().n;
  db.exec(`
    DELETE FROM commentaries
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM commentaries
      GROUP BY source_abbr, book_id, chapter, verse_start
    )
  `);
  const after = db.prepare('SELECT COUNT(*) as n FROM commentaries').get().n;
  if (before !== after) console.log(`  Removed ${(before - after).toLocaleString()} duplicate rows`);

  db.pragma('optimize');
  // Switch back to DELETE journal mode so sql.js-httpvfs can read it
  // (WAL mode requires two files; httpvfs only fetches the main file)
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.close();

  const size = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅  commentaries.sqlite3 — ${total.toLocaleString()} entries · ${size} MB\n`);

  if (total === 0) {
    console.log('  The UI shows graceful empty states until data is loaded.\n');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
