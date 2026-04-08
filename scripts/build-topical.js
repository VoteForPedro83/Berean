#!/usr/bin/env node
/* ============================================================
   build-topical.js
   Produces: public/db/topical.sqlite3

   Downloads data from:
   - BradyStephenson/bible-data (Nave's Topical + Hitchcock's — CSV)
   - JWBickel/BibleDictionaries on HuggingFace (Easton's + Smith's — JSONL)

   Run: node scripts/build-topical.js
   ============================================================ */

import fs   from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { createRequire }  from 'module';

const require   = createRequire(import.meta.url);
const Database  = require('better-sqlite3');

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const SRC        = path.join(__dirname, 'source-data', 'topical');
const OUTPUT_DIR = path.join(ROOT, 'public', 'db');
const DB_PATH    = path.join(OUTPUT_DIR, 'topical.sqlite3');

const REMOTE_FILES = [
  {
    name: 'NavesTopicalDictionary.csv',
    url:  'https://raw.githubusercontent.com/BradyStephenson/bible-data/master/NavesTopicalDictionary.csv',
    type: 'naves_csv',
  },
  {
    name: 'HitchcocksBibleNamesDictionary.csv',
    url:  'https://raw.githubusercontent.com/BradyStephenson/bible-data/master/HitchcocksBibleNamesDictionary.csv',
    type: 'hitchcock_csv',
  },
  {
    name: 'eastons.jsonl',
    url:  "https://huggingface.co/datasets/JWBickel/BibleDictionaries/raw/main/Easton's%20Bible%20Dictionary.jsonl",
    type: 'easton_jsonl',
  },
  {
    name: 'smiths.jsonl',
    url:  "https://huggingface.co/datasets/JWBickel/BibleDictionaries/raw/main/Smith's%20Bible%20Dictionary.jsonl",
    type: 'smith_jsonl',
  },
];

// ── Download helper ───────────────────────────────────────────────────────────

function httpGetFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;

    function get(u) {
      https.get(u, { headers: { 'User-Agent': 'BereanBibleApp/1.0' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
        if (res.statusCode !== 200) {
          file.close(); try { fs.unlinkSync(destPath); } catch {}
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        res.on('data', c => {
          downloaded += c.length;
          process.stdout.write(`\r    ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
        });
        res.pipe(file);
        file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
        res.on('error', reject);
      }).on('error', reject);
    }
    get(url);
  });
}

async function ensureFile(name, url) {
  const dest = path.join(SRC, name);
  if (fs.existsSync(dest)) {
    console.log(`  ✓ ${name} already present`);
    return dest;
  }
  console.log(`  Downloading ${name}…`);
  try {
    await httpGetFile(url, dest);
    console.log(`  ✅  ${name} saved`);
    return dest;
  } catch (err) {
    console.warn(`  ⚠️  Failed: ${err.message}`);
    return null;
  }
}

// ── Database setup ───────────────────────────────────────────────────────────

function createDB() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) { fs.unlinkSync(DB_PATH); console.log('  Removed old topical.sqlite3'); }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -32000');

  db.exec(`
    CREATE TABLE nave_topics (
      topic_id   INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_name TEXT NOT NULL,
      description TEXT
    );
    CREATE TABLE nave_verses (
      topic_id INTEGER NOT NULL,
      osis_id  TEXT NOT NULL,
      UNIQUE(topic_id, osis_id)
    );
    CREATE INDEX idx_nave_topic ON nave_verses(topic_id);
    CREATE INDEX idx_nave_verse ON nave_verses(osis_id);
    CREATE VIRTUAL TABLE nave_search USING fts5(topic_name, description, content=nave_topics, content_rowid=topic_id);

    CREATE TABLE dictionaries (
      entry_id        INTEGER PRIMARY KEY AUTOINCREMENT,
      source          TEXT CHECK(source IN ('easton','smith','hitchcock')),
      term            TEXT NOT NULL,
      definition_html TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE dict_search USING fts5(term, definition_html, content=dictionaries, content_rowid=entry_id);
  `);

  return db;
}

// ── OSIS normalisation ────────────────────────────────────────────────────────
// BradyStephenson uses OSIS-like IDs but with different book codes
// Format in CSV: "Gen.1.1" or "Ps.23.1" etc.
const BRADY_BOOK_MAP = {
  Gen:'GEN', Exod:'EXO', Lev:'LEV', Num:'NUM', Deut:'DEU',
  Josh:'JOS', Judg:'JDG', Ruth:'RUT', '1Sam':'1SA', '2Sam':'2SA',
  '1Kgs':'1KI', '2Kgs':'2KI', '1Chr':'1CH', '2Chr':'2CH',
  Ezra:'EZR', Neh:'NEH', Esth:'EST', Job:'JOB', Ps:'PSA', Pss:'PSA',
  Prov:'PRO', Eccl:'ECC', Song:'SNG', Isa:'ISA', Jer:'JER',
  Lam:'LAM', Ezek:'EZK', Dan:'DAN', Hos:'HOS', Joel:'JOL',
  Amos:'AMO', Obad:'OBA', Jonah:'JON', Mic:'MIC', Nah:'NAH',
  Hab:'HAB', Zeph:'ZEP', Hag:'HAG', Zech:'ZEC', Mal:'MAL',
  Matt:'MAT', Mark:'MRK', Luke:'LUK', John:'JHN', Acts:'ACT',
  Rom:'ROM', '1Cor':'1CO', '2Cor':'2CO', Gal:'GAL', Eph:'EPH',
  Phil:'PHP', Col:'COL', '1Thess':'1TH', '2Thess':'2TH',
  '1Tim':'1TI', '2Tim':'2TI', Titus:'TIT', Phlm:'PHM',
  Heb:'HEB', Jas:'JAS', '1Pet':'1PE', '2Pet':'2PE',
  '1John':'1JN', '2John':'2JN', '3John':'3JN', Jude:'JUD', Rev:'REV',
  // Also handle our own 3-letter codes and common all-caps variants
  GEN:'GEN', EXO:'EXO', LEV:'LEV', NUM:'NUM', DEU:'DEU',
  JOS:'JOS', JDG:'JDG', RUT:'RUT', PSA:'PSA', PRO:'PRO',
  ECC:'ECC', SNG:'SNG', ISA:'ISA', JER:'JER', LAM:'LAM',
  EZK:'EZK', DAN:'DAN', HOS:'HOS', JOL:'JOL', AMO:'AMO',
  OBA:'OBA', JON:'JON', MIC:'MIC', NAH:'NAH', HAB:'HAB',
  ZEP:'ZEP', HAG:'HAG', ZEC:'ZEC', MAL:'MAL', MAT:'MAT',
  MRK:'MRK', LUK:'LUK', JHN:'JHN', ACT:'ACT', ROM:'ROM',
  GAL:'GAL', EPH:'EPH', PHP:'PHP', COL:'COL', HEB:'HEB',
  JAS:'JAS', JUD:'JUD', REV:'REV',
  // Numbered books uppercase
  '1SA':'1SA','2SA':'2SA','1KI':'1KI','2KI':'2KI',
  '1CH':'1CH','2CH':'2CH','1CO':'1CO','2CO':'2CO',
  '1TH':'1TH','2TH':'2TH','1TI':'1TI','2TI':'2TI',
  '1PE':'1PE','2PE':'2PE','1JN':'1JN','2JN':'2JN','3JN':'3JN',
  // Common alternate abbreviations used in Nave's
  EZR:'EZR', NEH:'NEH', EST:'EST', JOB:'JOB',
  SS:'SNG', SONG:'SNG', SOL:'SNG',
  EZEK:'EZK', ZECH:'ZEC', ZEPH:'ZEP',
  PHIL:'PHP', PHILEM:'PHM', PHM:'PHM',
  PS:'PSA', // short form
};

function normaliseRef(ref) {
  if (!ref) return null;
  const parts = ref.trim().split('.');
  if (parts.length < 2) return null;
  const book = BRADY_BOOK_MAP[parts[0]];
  if (!book) return null;
  const ch = parts[1];
  const v  = parts[2] || '1';
  return `${book}.${ch}.${v}`;
}

// ── Parse Nave's CSV ──────────────────────────────────────────────────────────
// BradyStephenson format: TopicName,Subtopic,Reference,Note
// or: Topic,References (comma-separated OSIS refs)

/** Parse entire CSV content into array of row-arrays, handling multi-line quoted fields */
function parseFullCsv(raw) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuote = false;
  let i = 0;

  while (i < raw.length) {
    const c = raw[i];
    if (inQuote) {
      if (c === '"') {
        if (raw[i + 1] === '"') { cur += '"'; i += 2; continue; } // escaped quote
        inQuote = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') { inQuote = true; }
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else if (c !== '\r') { cur += c; }
    }
    i++;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function loadNavesCsv(db, csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return 0;

  console.log('  Parsing Nave\'s Topical Dictionary CSV…');
  // BOM-safe read
  let raw = fs.readFileSync(csvPath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip UTF-8 BOM

  const rows = parseFullCsv(raw);
  const header = rows[0].map(h => h.trim().toLowerCase());
  console.log(`    Header: ${header.join(' | ')} (${rows.length - 1} rows)`);

  // BradyStephenson Nave's: section, subject, entry
  // "section" = first letter (A/B/C...)
  // "subject" = topic name (AARON, BAPTISM, etc.)
  // "entry"   = multiline text with dash-prefixed ref groups like:
  //             -Lineage of EXO 6:16-20; JOS 21:4,10
  //             -Marriage of EXO 6:23
  // We extract: topic = subject, refs = all book.ch.v tokens from entry

  const subjectIdx = header.indexOf('subject');
  const entryIdx   = header.indexOf('entry');
  if (subjectIdx === -1 || entryIdx === -1) {
    console.warn(`    ⚠️  Unexpected header. Expected subject/entry columns.`);
    return 0;
  }

  // Regex: matches Bible book abbreviations followed by chapter:verse
  // e.g. EXO 6:16, JOS 21:4, 1CH 6:2, PS 23:1, John 3:16, Matt 5:3
  // Handles all-uppercase (EXO), mixed-case (Exod), and numbered (1Chr)
  const REF_RE = /\b([1-3]?\s?[A-Z][A-Za-z]{1,5})\s+(\d{1,3}):(\d{1,3})/g;

  const insertTopic = db.prepare(
    `INSERT INTO nave_topics (topic_name, description) VALUES (?, ?)`
  );
  const insertVerse = db.prepare(
    `INSERT OR IGNORE INTO nave_verses (topic_id, osis_id) VALUES (?, ?)`
  );

  const topicMap = {};
  let topicCount = 0;
  let verseCount = 0;

  db.transaction(() => {
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      if (!cols || cols.length <= Math.max(subjectIdx, entryIdx)) continue;

      const topicName = cols[subjectIdx].replace(/^"|"$/g, '').trim();
      if (!topicName) continue;

      const entryText = (cols[entryIdx] || '').trim();

      // Get or create topic
      if (!topicMap[topicName]) {
        const result = insertTopic.run(topicName, null);
        topicMap[topicName] = result.lastInsertRowid;
        topicCount++;
      }
      const topicId = topicMap[topicName];

      // Extract all scripture references from the entry text
      REF_RE.lastIndex = 0;
      let m;
      while ((m = REF_RE.exec(entryText)) !== null) {
        const bookRaw = m[1].replace(/\s/g,''); // e.g. "1CH", "EXO", "Ps"
        const ch = m[2];
        const v  = m[3];
        // Normalise: try as-is, then capitalised
        const book = BRADY_BOOK_MAP[bookRaw]
                  || BRADY_BOOK_MAP[bookRaw.charAt(0).toUpperCase() + bookRaw.slice(1).toLowerCase()]
                  || BRADY_BOOK_MAP[bookRaw.toUpperCase()];
        if (book) {
          insertVerse.run(topicId, `${book}.${ch}.${v}`);
          verseCount++;
        }
      }
    }
  })();

  db.exec(`INSERT INTO nave_search(nave_search) VALUES('rebuild')`);
  console.log(`  ✅  Nave's: ${topicCount.toLocaleString()} topics, ${verseCount.toLocaleString()} verse links`);
  return topicCount;
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; }
    else if (c === ',' && !inQuote) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

// ── Parse Hitchcock's CSV ─────────────────────────────────────────────────────
// Format: Name,Definition

function loadHitchcockCsv(db, csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return 0;

  console.log("  Parsing Hitchcock's Names Dictionary CSV…");
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
  const header = lines[0].toLowerCase().replace(/"/g,'').trim();
  console.log(`    Header: ${header}`);

  const insert = db.prepare(
    `INSERT INTO dictionaries (source, term, definition_html) VALUES ('hitchcock', ?, ?)`
  );

  let count = 0;
  db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i].trim());
      if (cols.length < 2) continue;
      const term = cols[0].replace(/^"|"$/g, '').trim();
      const def  = cols[1].replace(/^"|"$/g, '').trim();
      if (term && def) { insert.run(term, def); count++; }
    }
  })();

  db.exec(`INSERT INTO dict_search(dict_search) VALUES('rebuild')`);
  console.log(`  ✅  Hitchcock's: ${count.toLocaleString()} entries`);
  return count;
}

// ── Parse JSONL dictionaries (Easton's / Smith's) ─────────────────────────────
// HuggingFace format: each line is {"title":"...", "text":"..."}
// or {"term":"...", "definition":"..."}

function loadJsonlDict(db, jsonlPath, source) {
  if (!jsonlPath || !fs.existsSync(jsonlPath)) return 0;

  console.log(`  Parsing ${source} dictionary JSONL…`);
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n');

  // Peek at first line to understand schema
  let firstObj = null;
  for (const l of lines) {
    const t = l.trim();
    if (t) { try { firstObj = JSON.parse(t); } catch {} break; }
  }
  if (!firstObj) { console.warn(`    ⚠️  Could not parse ${source} JSONL`); return 0; }
  console.log(`    Keys: ${Object.keys(firstObj).join(', ')}`);

  const insert = db.prepare(
    `INSERT INTO dictionaries (source, term, definition_html) VALUES (?, ?, ?)`
  );

  let count = 0;
  db.transaction(() => {
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let obj;
      try { obj = JSON.parse(t); } catch { continue; }

      const term = (obj.title || obj.term || obj.word || obj.name || '').trim();

      // HuggingFace JWBickel format: "definitions" is an array of paragraphs
      let def = '';
      if (Array.isArray(obj.definitions)) {
        def = obj.definitions.join('\n\n').trim();
      } else {
        def = (obj.text || obj.definition || obj.content || obj.description || '').trim();
      }

      if (term && def) { insert.run(source, term, def); count++; }
    }
  })();

  db.exec(`INSERT INTO dict_search(dict_search) VALUES('rebuild')`);
  console.log(`  ✅  ${source}: ${count.toLocaleString()} entries`);
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔨 Building topical.sqlite3…\n');
  fs.mkdirSync(SRC, { recursive: true });

  const paths = {};
  for (const f of REMOTE_FILES) {
    paths[f.type] = await ensureFile(f.name, f.url);
  }

  const db = createDB();

  loadNavesCsv(db,      paths.naves_csv);
  loadHitchcockCsv(db,  paths.hitchcock_csv);
  loadJsonlDict(db,     paths.easton_jsonl, 'easton');
  loadJsonlDict(db,     paths.smith_jsonl,  'smith');

  db.pragma('optimize');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.close();

  const size = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅  topical.sqlite3 — ${size} MB\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
