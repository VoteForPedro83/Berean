#!/usr/bin/env node
/* ============================================================
   build-lexicon.js
   Produces: public/db/lexicon.sqlite3

   Source files used (in order of enrichment priority):
   ─────────────────────────────────────────────────────────────
   REQUIRED:
   scripts/source-data/strongs/greek/strongs-greek-dictionary.js
   scripts/source-data/strongs/hebrew/strongs-hebrew-dictionary.js

   OPTIONAL (enrich Greek — two accepted sources, script auto-detects):

   SOURCE A — STEPBible TBESG TSV (preferred, CC BY 4.0):
   scripts/source-data/tyndale/TBESG*.txt
     Download: git clone https://github.com/tyndale/STEPBible-Data scripts/source-data/tyndale
     File: "TBESG - Tyndale Brief lexicon of Extended Strongs for Greek.txt"
     Licence: CC BY 4.0

   SOURCE B — Thayer's Greek Lexicon structured JSON (public domain, if you find a copy):
   scripts/source-data/thayers/thayers.json
     Format: { "G25": { "short_def": "...", "long_def": "...", "cognates": "..." }, ... }

   OPTIONAL (enrich Hebrew — two accepted sources, script auto-detects):

   SOURCE A — OpenScriptures Hebrew Lexicon XML (preferred, public domain):
   scripts/source-data/bdb/BrownDriverBriggs.xml
     Download: git clone https://github.com/openscriptures/HebrewLexicon scripts/source-data/bdb
     Licence: Public domain

   SOURCE B — JSON (if you find a structured BDB JSON elsewhere):
   scripts/source-data/bdb/bdb.json

   OPTIONAL (Louw-Nida semantic domains — CC BY-SA 4.0 SEGREGATED):
   scripts/source-data/louw-nida/louw-nida.json
     Download: search GitHub for "louw nida semantic domains json"
     (Original repo github.com/billmccluer/louw-nida is no longer available)

   When optional sources are missing the script continues gracefully
   — the tables are created empty and will show Strong's fallback data.

   Run: node scripts/build-lexicon.js
   ============================================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require   = createRequire(import.meta.url);
const Database  = require('better-sqlite3');

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const SRC        = path.join(__dirname, 'source-data');
const STRONGS_SRC = path.join(SRC, 'strongs');
const OUTPUT_DIR = path.join(ROOT, 'public', 'db');
const DB_PATH    = path.join(OUTPUT_DIR, 'lexicon.sqlite3');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the JSON object from a JS file that looks like:
 *   var strongsGreekDictionary = { ... };
 * Returns a plain JS object.
 */
function extractDictFromJs(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');

  // Find the first { and the last }
  const start = raw.indexOf('{');
  const end   = raw.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`Cannot find JSON object in ${filePath}`);
  }

  const jsonStr = raw.slice(start, end + 1);
  return JSON.parse(jsonStr);
}

/**
 * Normalise a Greek Strong's ID to the zero-padded 4-digit format used in
 * bible_base.sqlite3 words table.  G1 → G0001, G976 → G0976, G1615 → G1615.
 */
function normaliseGreek(id) {
  const num = parseInt(id.slice(1), 10);
  if (isNaN(num)) return id;
  return `G${String(num).padStart(4, '0')}`;
}

/**
 * Hebrew IDs are stored as H1, H430 etc. (no padding) — return as-is.
 */
function normaliseHebrew(id) {
  return id; // already H + plain number
}

// ── Database setup ───────────────────────────────────────────────────────────

function createDB() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('  Removed old lexicon.sqlite3');
  }

  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -32000'); // 32 MB cache

  db.exec(`
    CREATE TABLE strongs (
      strongs_id       TEXT PRIMARY KEY,
      lemma            TEXT,
      transliteration  TEXT,
      pronunciation    TEXT,
      part_of_speech   TEXT,
      definition       TEXT,
      kjv_usage        TEXT,
      derivation       TEXT,
      language         TEXT CHECK(language IN ('greek','hebrew'))
    );

    -- Thayer's Greek Lexicon (public domain) — enriches Greek definitions
    CREATE TABLE thayers (
      strongs_id  TEXT PRIMARY KEY,
      lemma       TEXT,
      short_def   TEXT,
      long_def    TEXT,
      cognates    TEXT
    );

    -- Enhanced Brown-Driver-Briggs Hebrew (CC BY 4.0 — Eliran Wong)
    CREATE TABLE bdb (
      strongs_id      TEXT PRIMARY KEY,
      lemma           TEXT,
      transliteration TEXT,
      short_def       TEXT,
      long_def        TEXT,
      twot_number     TEXT
    );

    -- Louw-Nida semantic domains (CC BY-SA 4.0 — SEGREGATED — isolated table)
    CREATE TABLE louw_nida (
      strongs_id    TEXT,
      domain_number TEXT,
      domain_name   TEXT,
      subdomain     TEXT,
      gloss         TEXT
    );
    CREATE INDEX idx_ln_strongs ON louw_nida(strongs_id);

    CREATE VIRTUAL TABLE strongs_search USING fts5(
      strongs_id,
      lemma,
      definition,
      kjv_usage
    );
  `);

  return db;
}

// ── Greek ─────────────────────────────────────────────────────────────────────

function buildGreek(db) {
  const filePath = path.join(STRONGS_SRC, 'greek', 'strongs-greek-dictionary.js');
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  Greek dictionary not found at ${filePath} — skipping`);
    return 0;
  }

  console.log('  Parsing Greek Strong\'s dictionary…');
  const dict = extractDictFromJs(filePath);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO strongs
      (strongs_id, lemma, transliteration, pronunciation, definition, kjv_usage, derivation, language)
    VALUES
      (@strongs_id, @lemma, @transliteration, @pronunciation, @definition, @kjv_usage, @derivation, 'greek')
  `);

  const insertFts = db.prepare(`
    INSERT INTO strongs_search(strongs_id, lemma, definition, kjv_usage)
    VALUES (@strongs_id, @lemma, @definition, @kjv_usage)
  `);

  const insertMany = db.transaction((entries) => {
    for (const entry of entries) {
      insert.run(entry);
      insertFts.run(entry);
    }
  });

  const entries = Object.entries(dict).map(([rawId, data]) => ({
    strongs_id:      normaliseGreek(rawId),
    lemma:           data.lemma        || null,
    transliteration: data.translit     || null,
    pronunciation:   data.pronounce    || null,
    definition:      data.strongs_def  || null,
    kjv_usage:       data.kjv_def      || null,
    derivation:      data.derivation   || null,
  }));

  insertMany(entries);
  console.log(`  ✅  Greek: ${entries.length.toLocaleString()} entries inserted`);
  return entries.length;
}

// ── Hebrew ────────────────────────────────────────────────────────────────────

function buildHebrew(db) {
  const filePath = path.join(STRONGS_SRC, 'hebrew', 'strongs-hebrew-dictionary.js');
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  Hebrew dictionary not found at ${filePath} — skipping`);
    return 0;
  }

  console.log('  Parsing Hebrew Strong\'s dictionary…');
  const dict = extractDictFromJs(filePath);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO strongs
      (strongs_id, lemma, transliteration, pronunciation, definition, kjv_usage, derivation, language)
    VALUES
      (@strongs_id, @lemma, @transliteration, @pronunciation, @definition, @kjv_usage, @derivation, 'hebrew')
  `);

  const insertFts = db.prepare(`
    INSERT INTO strongs_search(strongs_id, lemma, definition, kjv_usage)
    VALUES (@strongs_id, @lemma, @definition, @kjv_usage)
  `);

  const insertMany = db.transaction((entries) => {
    for (const entry of entries) {
      insert.run(entry);
      insertFts.run(entry);
    }
  });

  const entries = Object.entries(dict).map(([rawId, data]) => ({
    strongs_id:      normaliseHebrew(rawId),
    lemma:           data.lemma        || null,
    transliteration: data.xlit         || null,
    pronunciation:   data.pron         || null,
    definition:      data.strongs_def  || null,
    kjv_usage:       data.kjv_def      || null,
    derivation:      data.derivation   || null,
  }));

  insertMany(entries);
  console.log(`  ✅  Hebrew: ${entries.length.toLocaleString()} entries inserted`);
  return entries.length;
}

// ── Greek lexicon enrichment (STEPBible TBESG TSV or Thayer's JSON) ───────────

function buildThayers(db) {
  // Prefer STEPBible TBESG TSV (CC BY 4.0, easily downloadable)
  // Fall back to Thayer's JSON if someone has a copy
  const tyndale = findTEBSGFile();
  if (tyndale) return buildThayersFromTEBSG(db, tyndale);

  const jsonCandidates = [
    path.join(SRC, 'thayers', 'thayers.json'),
    path.join(SRC, 'thayers', 'thayer.json'),
    path.join(SRC, 'thayers', 'thayers-greek-lexicon.json'),
  ];
  const jsonPath = jsonCandidates.find(p => fs.existsSync(p));
  if (jsonPath) return buildThayersFromJSON(db, jsonPath);

  console.warn('  ⚠️  Greek enrichment source not found — skipping (optional)');
  console.warn('     To enable: git clone https://github.com/tyndale/STEPBible-Data scripts/source-data/tyndale');
  return 0;
}

function findTEBSGFile() {
  const tynDir = path.join(SRC, 'tyndale');
  if (!fs.existsSync(tynDir)) return null;
  const files = fs.readdirSync(tynDir);
  // File is named "TBESG - Tyndale Brief lexicon of Extended Strongs for Greek.txt"
  const match = files.find(f => f.includes('TBESG') && f.endsWith('.txt'));
  return match ? path.join(tynDir, match) : null;
}

/**
 * Parse STEPBible TBESG TSV file.
 * Tab-separated. Lines starting with # are headers or comments.
 * Key columns (auto-detected from header): Strongs, EnglishVocab, MounceShortDef, ...
 *
 * STEPBible TBESG column layout (approximate — header detection handles exact position):
 *   Col 0: Strongs number (G0001 or G1 format)
 *   Col 1: GK number
 *   Col 2: EnglishVocab / lemma
 *   Col 3: MounceShortDef (short definition)
 *   Col 4+: extended/long definitions
 */
function buildThayersFromTEBSG(db, filePath) {
  console.log(`  Parsing STEPBible TBESG Greek lexicon from ${path.basename(filePath)}…`);

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');

  // Find the header line (starts with # and contains 'Strongs' or 'strongs')
  let headers = null;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (lines[i].startsWith('#') && lines[i].toLowerCase().includes('strongs')) {
      headers = lines[i].replace(/^#\s*/, '').split('\t').map(h => h.trim().toLowerCase());
      headerIdx = i;
      break;
    }
  }

  // Column index detection — handle variations in header names
  const colStrongs  = headers ? headers.findIndex(h => h.includes('strongs'))     : 0;
  const colLemma    = headers ? headers.findIndex(h => h.includes('vocab') || h.includes('lemma') || h.includes('greek')) : 2;
  const colShort    = headers ? headers.findIndex(h => h.includes('short') || h.includes('gloss') || h.includes('step')) : 3;
  const colLong     = headers ? headers.findIndex(h => h.includes('long')  || h.includes('mounce') && headers.findIndex(h2 => h2.includes('long')) > -1) : 4;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO thayers (strongs_id, lemma, short_def, long_def, cognates)
    VALUES (@strongs_id, @lemma, @short_def, @long_def, @cognates)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  const entries = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const cols = line.split('\t');
    const rawId = cols[colStrongs >= 0 ? colStrongs : 0]?.trim();
    if (!rawId) continue;

    const num = parseInt(rawId.replace(/^[Gg]/, ''), 10);
    if (isNaN(num)) continue;

    entries.push({
      strongs_id: `G${String(num).padStart(4, '0')}`,
      lemma:      cols[colLemma >= 0 ? colLemma : 2]?.trim()  || null,
      short_def:  cols[colShort >= 0 ? colShort : 3]?.trim()  || null,
      long_def:   cols[colLong  >= 0 ? colLong  : 4]?.trim()  || null,
      cognates:   null,
    });
  }

  if (entries.length === 0) {
    console.warn('  ⚠️  TBESG parsed but no entries found — check file format');
    return 0;
  }

  insertMany(entries);
  console.log(`  ✅  STEPBible TBESG Greek: ${entries.length.toLocaleString()} entries`);
  return entries.length;
}

function buildThayersFromJSON(db, filePath) {
  console.log('  Parsing Thayer\'s Greek Lexicon JSON…');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.warn(`  ⚠️  Could not parse Thayer's JSON: ${e.message}`);
    return 0;
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO thayers (strongs_id, lemma, short_def, long_def, cognates)
    VALUES (@strongs_id, @lemma, @short_def, @long_def, @cognates)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  const entries = [];
  for (const [rawId, entry] of Object.entries(data)) {
    const num = parseInt(String(rawId).replace(/^[Gg]/, ''), 10);
    if (isNaN(num)) continue;
    entries.push({
      strongs_id: `G${String(num).padStart(4, '0')}`,
      lemma:      entry.lemma     || entry.word     || null,
      short_def:  entry.short_def || entry.shortDef || entry.brief || null,
      long_def:   entry.long_def  || entry.longDef  || entry.def   || entry.definition || null,
      cognates:   Array.isArray(entry.cognates) ? entry.cognates.join(', ') : entry.cognates || null,
    });
  }

  if (entries.length === 0) {
    console.warn('  ⚠️  Thayer\'s JSON parsed but no entries found');
    return 0;
  }

  insertMany(entries);
  console.log(`  ✅  Thayer's Greek: ${entries.length.toLocaleString()} entries`);
  return entries.length;
}

// ── Brown-Driver-Briggs Hebrew Lexicon ────────────────────────────────────────

function buildBDB(db) {
  // OpenScriptures Hebrew Lexicon repo contains two XML files:
  //   HebrewStrong.xml  — entries keyed by Strong's id="H1", id="H2" etc. ← USE THIS
  //   BrownDriverBriggs.xml — uses internal BDB IDs, no Strong's attribute ← skip
  const xmlPath = path.join(SRC, 'bdb', 'HebrewStrong.xml');
  if (fs.existsSync(xmlPath)) return buildBDBFromXML(db, xmlPath);
  // Fallback: try BrownDriverBriggs.xml (less useful without Strong's mapping)
  const bdbPath = path.join(SRC, 'bdb', 'BrownDriverBriggs.xml');
  if (fs.existsSync(bdbPath)) return buildBDBFromXML(db, bdbPath);

  // Fall back to any JSON version
  const jsonCandidates = [
    path.join(SRC, 'bdb', 'bdb.json'),
    path.join(SRC, 'bdb', 'enhanced-bdb.json'),
    path.join(SRC, 'bdb', 'BDB_strongs.json'),
  ];
  const jsonPath = jsonCandidates.find(p => fs.existsSync(p));
  if (jsonPath) return buildBDBFromJSON(db, jsonPath);

  console.warn('  ⚠️  BDB Hebrew source not found — skipping (optional)');
  console.warn('     To enable: git clone https://github.com/openscriptures/HebrewLexicon scripts/source-data/bdb');
  return 0;
}

/**
 * Parse OpenScriptures HebrewStrong.xml (public domain).
 *
 * Entry structure:
 *   <entry id="H1">
 *     <w pos="n-m" pron="awb" xlit="ʼâb" xml:lang="heb">אָב</w>
 *     <source>a primitive word;</source>
 *     <meaning><def>father</def>, in a literal and immediate...</meaning>
 *     <usage>chief, (fore-) father(-less), × patrimony...</usage>
 *   </entry>
 *
 * Strong's ID is the `id` attribute on <entry>.
 * Transliteration is the `xlit` attribute on <w>.
 * Definition comes from <meaning> (strip inner tags).
 * Short def = first <def> content inside <meaning>.
 */
function buildBDBFromXML(db, filePath) {
  console.log(`  Parsing OpenScriptures ${path.basename(filePath)}…`);
  const xml = fs.readFileSync(filePath, 'utf8');

  // Match every <entry id="H..."> block
  const entryRe = /<entry\s+id="(H\d+)"[^>]*>([\s\S]*?)<\/entry>/g;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO bdb
      (strongs_id, lemma, transliteration, short_def, long_def, twot_number)
    VALUES
      (@strongs_id, @lemma, @transliteration, @short_def, @long_def, @twot_number)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  const stripTags = s => s ? s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;

  const entries = [];
  let match;

  while ((match = entryRe.exec(xml)) !== null) {
    const strongsId = match[1];          // e.g. "H1"
    const body      = match[2];

    // Lemma: text content of <w>; transliteration: xlit attribute on <w>
    const wMatch       = body.match(/<w\b([^>]*)>([^<]*)<\/w>/);
    const lemma        = wMatch ? wMatch[2].trim() : null;
    const xlitMatch    = wMatch ? wMatch[1].match(/xlit="([^"]+)"/) : null;
    const translit     = xlitMatch ? xlitMatch[1] : null;

    // Full definition from <meaning> block
    const meaningMatch = body.match(/<meaning>([\s\S]*?)<\/meaning>/);
    const fullDef      = meaningMatch ? stripTags(meaningMatch[1]) : null;

    // Short def: first <def> text inside <meaning>
    const firstDef     = meaningMatch
      ? (meaningMatch[1].match(/<def>([^<]+)<\/def>/)?.[1] || null)
      : null;

    // Usage (KJV glosses) from <usage> block
    const usageMatch   = body.match(/<usage>([\s\S]*?)<\/usage>/);
    const usage        = usageMatch ? stripTags(usageMatch[1]) : null;

    entries.push({
      strongs_id:      strongsId,
      lemma:           lemma    || null,
      transliteration: translit || null,
      short_def:       firstDef || (fullDef ? fullDef.split(/[.;]/)[0].trim() : null),
      long_def:        fullDef  || usage    || null,
      twot_number:     null,
    });
  }

  if (entries.length === 0) {
    console.warn(`  ⚠️  ${path.basename(filePath)} parsed but no entries found — check file structure`);
    return 0;
  }

  insertMany(entries);
  console.log(`  ✅  Hebrew Strong's lexicon: ${entries.length.toLocaleString()} entries`);
  return entries.length;
}

function buildBDBFromJSON(db, filePath) {
  console.log('  Parsing BDB Hebrew JSON…');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.warn(`  ⚠️  Could not parse BDB JSON: ${e.message}`);
    return 0;
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO bdb
      (strongs_id, lemma, transliteration, short_def, long_def, twot_number)
    VALUES
      (@strongs_id, @lemma, @transliteration, @short_def, @long_def, @twot_number)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  const entries = [];
  const dataArr = Array.isArray(data) ? data : Object.entries(data).map(([k, v]) => ({ strongs_id: k, ...v }));

  for (const entry of dataArr) {
    let rawId = entry.strongs_id || entry.strongsId || entry.id || '';
    rawId = String(rawId).replace(/^[Hh]/, '').replace(/^0+/, '') || '0';

    entries.push({
      strongs_id:      `H${rawId}`,
      lemma:           entry.lemma       || entry.word       || null,
      transliteration: entry.translit    || entry.xlit       || entry.transliteration || null,
      short_def:       entry.short_def   || entry.shortDef   || entry.brief || null,
      long_def:        entry.long_def    || entry.longDef    || entry.definition || entry.def || null,
      twot_number:     entry.twot_number || entry.twot       || entry.TWOT || null,
    });
  }

  if (entries.length === 0) {
    console.warn('  ⚠️  BDB JSON parsed but no entries found');
    return 0;
  }

  insertMany(entries);
  console.log(`  ✅  BDB Hebrew JSON: ${entries.length.toLocaleString()} entries`);
  return entries.length;
}

// ── Louw-Nida semantic domains ────────────────────────────────────────────────

/**
 * Build the louw_nida table from available sources, in priority order:
 *
 *  1. UBS Open License (ubsicap) — authoritative definitions + domain names
 *     git clone https://github.com/ubsicap/ubs-open-license scripts/source-data/ubsicap
 *     JSON files are in /dictionaries/greek/  (CC BY-SA 4.0)
 *
 *  2. MACULA Greek TSV — word-level LN codes, derive unique strongs→domain pairs
 *     git clone https://github.com/Clear-Bible/macula-greek scripts/source-data/macula-greek
 *     TSV files are in /SBLGNT/tsv/  (CC BY-SA 4.0)
 *     Less rich than ubsicap (no prose definitions) but the most complete code mapping.
 *
 *  3. Legacy JSON (louw-nida.json) — if you have a copy from elsewhere
 *
 * The louw_nida table stores one row per (strongs_id, domain_number) pair,
 * so a word with multiple domains (e.g. sperma → 3.35, 10.29, 58.13) gets
 * multiple rows. The word study popup shows all of them.
 */
function buildLouwNida(db) {
  // Priority 1: MACULA TSV (derive unique strongs→domain pairs from token-level data)
  // git clone https://github.com/Clear-Bible/macula-greek scripts/source-data/macula-greek
  // cp scripts/source-data/macula-greek/SBLGNT/tsv/*.tsv scripts/source-data/macula/
  const maculaDir = path.join(SRC, 'macula');
  if (fs.existsSync(maculaDir) && fs.readdirSync(maculaDir).some(f => f.endsWith('.tsv'))) {
    return buildLouwNidaFromMACULA(db, maculaDir);
  }

  // Priority 2: Legacy JSON (if you find a copy elsewhere)
  const jsonCandidates = [
    path.join(SRC, 'louw-nida', 'louw-nida.json'),
    path.join(SRC, 'louw-nida', 'louw_nida.json'),
    path.join(SRC, 'louw-nida', 'domains.json'),
  ];
  const jsonPath = jsonCandidates.find(p => fs.existsSync(p));
  if (jsonPath) return buildLouwNidaFromLegacyJSON(db, jsonPath);

  // Note: ubsicap/ubs-open-license repo does NOT contain Louw-Nida data —
  // it contains Bible routes, parallel passages, and HOTTP textual notes.
  console.warn('  ⚠️  Louw-Nida source not found — skipping (optional)');
  console.warn('     To enable: git clone https://github.com/Clear-Bible/macula-greek scripts/source-data/macula-greek');
  console.warn('     Then:      cp scripts/source-data/macula-greek/SBLGNT/tsv/*.tsv scripts/source-data/macula/');
  return 0;
}

/**
 * Parse UBS Open License JSON from /dictionaries/greek/.
 * The ubsicap structure organises entries as a dictionary (SDGNT format):
 * Each entry has a Strong's number, lemma, one or more LN domain codes,
 * domain names, and optional glosses. Exact JSON structure varies by release —
 * this parser handles the two most common shapes.
 */
function buildLouwNidaFromUBSicap(db, dirPath) {
  console.log('  Parsing UBS Open License Louw-Nida data…');

  const jsonFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  if (jsonFiles.length === 0) {
    console.warn(`  ⚠️  No JSON files found in ${dirPath}`);
    return 0;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO louw_nida (strongs_id, domain_number, domain_name, subdomain, gloss)
    VALUES (@strongs_id, @domain_number, @domain_name, @subdomain, @gloss)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  const entries = [];

  for (const file of jsonFiles) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dirPath, file), 'utf8'));
    } catch (e) {
      console.warn(`  ⚠️  Could not parse ${file}: ${e.message}`);
      continue;
    }

    // Shape A: domain-centric — { "domains": [{ "number": "1", "name": "...", "entries": [...] }] }
    if (data.domains && Array.isArray(data.domains)) {
      for (const domain of data.domains) {
        const domainNum  = String(domain.number || domain.domainNumber || '');
        const domainName = domain.name || domain.domainName || '';
        const subdomains = domain.subdomains || [];

        for (const sub of subdomains) {
          const subNum  = String(sub.number || '');
          const subName = sub.name || '';
          for (const entry of (sub.entries || [])) {
            const rawStrongs = entry.strong || entry.strongs || entry.strongsNumber || '';
            const num = parseInt(String(rawStrongs).replace(/^[Gg]/, ''), 10);
            if (isNaN(num)) continue;
            entries.push({
              strongs_id:    `G${String(num).padStart(4, '0')}`,
              domain_number: subNum || domainNum,
              domain_name:   domainName,
              subdomain:     subName || null,
              gloss:         entry.gloss || entry.meaning || entry.definition || null,
            });
          }
        }
      }
      continue;
    }

    // Shape B: entry-centric — { "G3056": { "lemma": "...", "domains": ["33.98"], "gloss": "..." } }
    //          or array of entries: [{ "strongs": "G3056", "domain": "33.98", "gloss": "..." }]
    const items = Array.isArray(data) ? data : Object.entries(data).map(([k, v]) => ({ strongs: k, ...v }));
    for (const item of items) {
      const rawStrongs = item.strongs || item.strongs_id || item.strong || item.strongsNumber || '';
      const num = parseInt(String(rawStrongs).replace(/^[Gg]/, ''), 10);
      if (isNaN(num)) continue;
      const strongsId = `G${String(num).padStart(4, '0')}`;

      // A single entry may have multiple domain codes
      const domains = Array.isArray(item.domains) ? item.domains : [item.domain || item.domain_number].filter(Boolean);
      for (const domainCode of domains) {
        entries.push({
          strongs_id:    strongsId,
          domain_number: String(domainCode),
          domain_name:   item.domain_name || item.domainName || null,
          subdomain:     item.subdomain   || null,
          gloss:         item.gloss       || item.meaning    || null,
        });
      }
    }
  }

  if (entries.length === 0) {
    console.warn('  ⚠️  ubsicap JSON parsed but no entries found — check directory structure');
    return 0;
  }

  insertMany(entries);
  console.log(`  ✅  UBS Open License LN: ${entries.length.toLocaleString()} domain mappings`);
  return entries.length;
}

/**
 * Build louw_nida from MACULA Greek TSV files.
 * MACULA has a 'louw-nida' (or 'ln') column per word. We extract unique
 * (strongs, domain_code) pairs — no prose definitions, but complete coverage.
 * Domain names are left NULL (ubsicap source has those).
 */
function buildLouwNidaFromMACULA(db, maculaDir) {
  console.log('  Building Louw-Nida mappings from MACULA TSV…');

  const files = fs.readdirSync(maculaDir).filter(f => f.endsWith('.tsv')).sort();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO louw_nida (strongs_id, domain_number, domain_name, subdomain, gloss)
    VALUES (@strongs_id, @domain_number, NULL, NULL, @gloss)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  // Track unique pairs to avoid duplicate inserts
  const seen   = new Set();
  const batch  = [];
  const BATCH  = 2000;
  let   total  = 0;

  for (const file of files) {
    const lines = fs.readFileSync(path.join(maculaDir, file), 'utf8').split('\n');
    const headerLine = lines.find(l => l.includes('\t') && (l.toLowerCase().includes('louw') || l.toLowerCase().includes('strong')));
    if (!headerLine) continue;

    const headers  = headerLine.toLowerCase().split('\t').map(h => h.trim());
    const lnCol     = headers.findIndex(h => h.includes('louw') || h === 'ln');
    const strongCol = headers.findIndex(h => h.includes('strong'));
    const glossCol  = headers.findIndex(h => h === 'gloss' || h.includes('english'));
    if (lnCol === -1 || strongCol === -1) continue;

    const dataStart = lines.indexOf(headerLine) + 1;
    for (let i = dataStart; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const lnCode     = cols[lnCol]?.trim();
      const rawStrongs = cols[strongCol]?.trim();
      if (!lnCode || !rawStrongs || lnCode === 'None') continue;

      const num = parseInt(rawStrongs.replace(/^[Gg]/, ''), 10);
      if (isNaN(num)) continue;
      const strongsId = `G${String(num).padStart(4, '0')}`;

      const key = `${strongsId}|${lnCode}`;
      if (seen.has(key)) continue;
      seen.add(key);

      batch.push({
        strongs_id:    strongsId,
        domain_number: lnCode,
        gloss:         cols[glossCol]?.trim() || null,
      });
      total++;
      if (batch.length >= BATCH) { insertMany(batch); batch.length = 0; }
    }
  }

  if (batch.length > 0) insertMany(batch);
  console.log(`  ✅  MACULA LN: ${total.toLocaleString()} unique Strong's → domain mappings`);
  return total;
}

/** Legacy fallback for any JSON shaped like { strongs_id, domain_number, domain_name, gloss } */
function buildLouwNidaFromLegacyJSON(db, filePath) {
  console.log('  Parsing legacy Louw-Nida JSON…');
  let data;
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { console.warn(`  ⚠️  Cannot parse: ${e.message}`); return 0; }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO louw_nida (strongs_id, domain_number, domain_name, subdomain, gloss)
    VALUES (@strongs_id, @domain_number, @domain_name, @subdomain, @gloss)
  `);
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });

  const items = Array.isArray(data) ? data : Object.values(data).flat();
  const entries = [];
  for (const item of items) {
    const rawStrongs = item.strongs || item.strongs_id || item.strongsId || '';
    const num = parseInt(String(rawStrongs).replace(/^[Gg]/, ''), 10);
    if (isNaN(num)) continue;
    entries.push({
      strongs_id:    `G${String(num).padStart(4, '0')}`,
      domain_number: item.domain_number || item.domainNumber || item.domain || null,
      domain_name:   item.domain_name   || item.domainName   || null,
      subdomain:     item.subdomain     || null,
      gloss:         item.gloss         || item.meaning      || null,
    });
  }

  if (!entries.length) { console.warn('  ⚠️  No entries found'); return 0; }
  insertMany(entries);
  console.log(`  ✅  Legacy LN: ${entries.length.toLocaleString()} entries`);
  return entries.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔨 Building lexicon.sqlite3…\n');

  const db = createDB();

  // Required: Strong's base (Greek + Hebrew)
  const greekCount  = buildGreek(db);
  const hebrewCount = buildHebrew(db);

  // Optional enrichment: Thayer's Greek + Enhanced BDB Hebrew + Louw-Nida
  console.log('\n📚 Optional enrichment sources:');
  const thayersCount  = buildThayers(db);
  const bdbCount      = buildBDB(db);
  const lnCount       = buildLouwNida(db);

  const total = greekCount + hebrewCount;

  // WAL mode must be off before closing — sql.js-httpvfs requires a single file
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.pragma('optimize');
  db.close();

  const size = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1);

  console.log(`
════════════════════════════════════════════
  ✅ lexicon.sqlite3 complete
════════════════════════════════════════════
  Strong's Greek:    ${greekCount.toLocaleString()} entries
  Strong's Hebrew:   ${hebrewCount.toLocaleString()} entries
  Thayer's Greek:    ${thayersCount ? thayersCount.toLocaleString() + ' entries' : 'not loaded (optional)'}
  Enhanced BDB:      ${bdbCount ? bdbCount.toLocaleString() + ' entries' : 'not loaded (optional)'}
  Louw-Nida domains: ${lnCount ? lnCount.toLocaleString() + ' entries' : 'not loaded (optional)'}
  File size:         ${size} MB
  Output:            ${DB_PATH}
════════════════════════════════════════════

  Next step: node scripts/build-morphgnt.js
`);

  if (total === 0) {
    console.warn('⚠️  No Strong\'s entries inserted. Check source files in scripts/source-data/strongs/');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
