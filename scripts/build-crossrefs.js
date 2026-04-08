#!/usr/bin/env node
/* ============================================================
   build-crossrefs.js
   Produces: public/db/cross_refs.sqlite3

   Auto-downloads OpenBible cross-references CSV (CC BY licence).
   Also includes a curated set of NT quotations of OT.

   Run: node scripts/build-crossrefs.js
   ============================================================ */

import fs   from 'fs';
import path from 'path';
import https from 'https';
import zlib  from 'zlib';
import { fileURLToPath } from 'url';
import { createRequire }  from 'module';

const require   = createRequire(import.meta.url);
const Database  = require('better-sqlite3');

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const SRC        = path.join(__dirname, 'source-data', 'crossrefs');
const OUTPUT_DIR = path.join(ROOT, 'public', 'db');
const DB_PATH    = path.join(OUTPUT_DIR, 'cross_refs.sqlite3');

const OPENBIBLE_URL      = 'https://a.openbible.info/bulk/cross-references.zip';
// Accept various filenames the user might have saved it as
const OPENBIBLE_CSV_PATH = [
  'cross_references.txt', 'cross-references.txt',
  'cross_references.csv', 'cross-references.csv',
].map(n => path.join(SRC, n)).find(p => fs.existsSync(p))
  ?? path.join(SRC, 'cross-references.csv');

// ── Download helper ───────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadOpenBible() {
  console.log(`  Downloading OpenBible cross-references…`);
  const zipBuf = await httpGet(OPENBIBLE_URL);

  // Find local file entry in ZIP (signature 0x04034b50)
  let offset = 0;
  while (offset < zipBuf.length - 4) {
    if (zipBuf.readUInt32LE(offset) === 0x04034b50) break;
    offset++;
  }
  if (offset >= zipBuf.length - 4) throw new Error('ZIP local file header not found');

  const compMethod = zipBuf.readUInt16LE(offset + 8);
  const compSize   = zipBuf.readUInt32LE(offset + 18);
  const fnLen      = zipBuf.readUInt16LE(offset + 26);
  const extraLen   = zipBuf.readUInt16LE(offset + 28);
  const dataStart  = offset + 30 + fnLen + extraLen;
  const compData   = zipBuf.slice(dataStart, dataStart + compSize);

  const csv = compMethod === 0 ? compData : zlib.inflateRawSync(compData);
  fs.writeFileSync(OPENBIBLE_CSV_PATH, csv);
  console.log(`  ✅  Downloaded (${(csv.length / 1024 / 1024).toFixed(1)} MB)`);
}

// ── Database setup ───────────────────────────────────────────────────────────

function createDB() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) { fs.unlinkSync(DB_PATH); console.log('  Removed old cross_refs.sqlite3'); }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -32000');

  db.exec(`
    CREATE TABLE cross_references (
      source_osis TEXT NOT NULL,
      target_osis TEXT NOT NULL,
      votes       INTEGER DEFAULT 0,
      dataset     TEXT CHECK(dataset IN ('openbible','tsk','ubs'))
    );
    CREATE INDEX idx_xref_source ON cross_references(source_osis);

    CREATE TABLE nt_ot_quotes (
      nt_osis      TEXT NOT NULL,
      ot_osis      TEXT NOT NULL,
      relationship TEXT CHECK(relationship IN ('quotation','allusion','echo'))
    );
    CREATE INDEX idx_ntot_nt ON nt_ot_quotes(nt_osis);
    CREATE INDEX idx_ntot_ot ON nt_ot_quotes(ot_osis);
  `);

  return db;
}

// ── OSIS normalisation ────────────────────────────────────────────────────────
// OpenBible uses short OSIS book names (Gen, Matt) — map to our 3-letter codes

const BOOK_MAP = {
  Gen:'GEN', Exod:'EXO', Lev:'LEV', Num:'NUM', Deut:'DEU',
  Josh:'JOS', Judg:'JDG', Ruth:'RUT', '1Sam':'1SA', '2Sam':'2SA',
  '1Kgs':'1KI', '2Kgs':'2KI', '1Chr':'1CH', '2Chr':'2CH',
  Ezra:'EZR', Neh:'NEH', Esth:'EST', Job:'JOB', Ps:'PSA',
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
};

function normaliseOsis(raw) {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 3) return null;
  const book = BOOK_MAP[parts[0]] || parts[0].toUpperCase();
  return `${book}.${parts[1]}.${parts[2]}`;
}

// ── Load OpenBible CSV ────────────────────────────────────────────────────────

function loadOpenBible(db) {
  if (!fs.existsSync(OPENBIBLE_CSV_PATH)) {
    console.warn('  ⚠️  OpenBible CSV not found — skipping cross-references');
    return 0;
  }

  console.log('  Parsing OpenBible cross-references…');
  const lines = fs.readFileSync(OPENBIBLE_CSV_PATH, 'utf8').split('\n');
  const insert = db.prepare(
    `INSERT INTO cross_references (source_osis, target_osis, votes, dataset)
     VALUES (?, ?, ?, 'openbible')`
  );

  let count = 0;
  const insertMany = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      const source = normaliseOsis(parts[0].trim());
      const target = normaliseOsis(parts[1].trim());
      const votes  = parseInt(parts[2] || '0', 10);
      if (!source || !target) continue;
      insert.run(source, target, votes);
      count++;
    }
  });
  insertMany();
  console.log(`  ✅  OpenBible: ${count.toLocaleString()} cross-references`);
  return count;
}

// ── NT quotations of OT ───────────────────────────────────────────────────────

const NT_OT_QUOTES = [
  ['MAT.1.23','ISA.7.14','quotation'], ['MAT.2.6','MIC.5.2','quotation'],
  ['MAT.2.15','HOS.11.1','quotation'], ['MAT.2.18','JER.31.15','quotation'],
  ['MAT.3.3','ISA.40.3','quotation'],  ['MAT.4.4','DEU.8.3','quotation'],
  ['MAT.4.6','PSA.91.11','quotation'], ['MAT.4.7','DEU.6.16','quotation'],
  ['MAT.4.10','DEU.6.13','quotation'], ['MAT.4.15','ISA.9.1','quotation'],
  ['MAT.5.21','EXO.20.13','quotation'],['MAT.5.27','EXO.20.14','quotation'],
  ['MAT.5.38','EXO.21.24','quotation'],['MAT.11.10','MAL.3.1','quotation'],
  ['MAT.12.18','ISA.42.1','quotation'],['MAT.21.5','ZEC.9.9','quotation'],
  ['MAT.21.9','PSA.118.26','quotation'],['MAT.21.42','PSA.118.22','quotation'],
  ['MAT.22.37','DEU.6.5','quotation'], ['MAT.22.44','PSA.110.1','quotation'],
  ['MAT.26.31','ZEC.13.7','quotation'],['MAT.27.46','PSA.22.1','quotation'],
  ['MRK.1.2','MAL.3.1','quotation'],  ['MRK.1.3','ISA.40.3','quotation'],
  ['MRK.12.36','PSA.110.1','quotation'],['LUK.4.18','ISA.61.1','quotation'],
  ['LUK.20.42','PSA.110.1','quotation'],['JHN.1.23','ISA.40.3','quotation'],
  ['JHN.12.14','ZEC.9.9','quotation'], ['JHN.12.38','ISA.53.1','quotation'],
  ['JHN.13.18','PSA.41.9','quotation'],['JHN.19.24','PSA.22.18','quotation'],
  ['JHN.19.36','EXO.12.46','quotation'],['ACT.2.17','JOL.2.28','quotation'],
  ['ACT.2.25','PSA.16.8','quotation'], ['ACT.2.34','PSA.110.1','quotation'],
  ['ACT.4.11','PSA.118.22','quotation'],['ROM.1.17','HAB.2.4','quotation'],
  ['ROM.3.10','PSA.14.1','quotation'], ['ROM.4.3','GEN.15.6','quotation'],
  ['ROM.9.7','GEN.21.12','quotation'], ['ROM.9.12','GEN.25.23','quotation'],
  ['ROM.9.13','MAL.1.2','quotation'],  ['ROM.9.25','HOS.2.23','quotation'],
  ['ROM.10.13','JOL.2.32','quotation'],['ROM.15.9','PSA.18.49','quotation'],
  ['GAL.3.11','HAB.2.4','quotation'],  ['GAL.4.27','ISA.54.1','quotation'],
  ['HEB.1.5','PSA.2.7','quotation'],   ['HEB.1.6','DEU.32.43','quotation'],
  ['HEB.1.7','PSA.104.4','quotation'], ['HEB.1.8','PSA.45.6','quotation'],
  ['HEB.1.13','PSA.110.1','quotation'],['HEB.2.6','PSA.8.4','quotation'],
  ['HEB.5.5','PSA.2.7','quotation'],   ['HEB.5.6','PSA.110.4','quotation'],
  ['HEB.8.8','JER.31.31','quotation'], ['HEB.10.5','PSA.40.6','quotation'],
  ['HEB.10.30','DEU.32.35','quotation'],['HEB.12.5','PRO.3.11','quotation'],
  ['HEB.13.5','DEU.31.6','quotation'], ['1PE.2.6','ISA.28.16','quotation'],
  ['1PE.2.22','ISA.53.9','quotation'], ['1PE.2.24','ISA.53.5','quotation'],
];

function loadNtOtQuotes(db) {
  const insert = db.prepare(
    `INSERT INTO nt_ot_quotes (nt_osis, ot_osis, relationship) VALUES (?, ?, ?)`
  );
  const run = db.transaction(() => {
    for (const [nt, ot, rel] of NT_OT_QUOTES) insert.run(nt, ot, rel);
  });
  run();
  console.log(`  ✅  NT-OT quotes: ${NT_OT_QUOTES.length} entries`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔨 Building cross_refs.sqlite3…\n');
  fs.mkdirSync(SRC, { recursive: true });

  if (!fs.existsSync(OPENBIBLE_CSV_PATH)) {
    try {
      await downloadOpenBible();
    } catch (err) {
      console.warn(`  ⚠️  Download failed: ${err.message}`);
    }
  } else {
    console.log('  OpenBible CSV already present — skipping download');
  }

  const db = createDB();
  const xrefCount = loadOpenBible(db);
  loadNtOtQuotes(db);
  db.pragma('optimize');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('journal_mode = DELETE');
  db.close();

  const size = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅  cross_refs.sqlite3 — ${xrefCount.toLocaleString()} cross-refs · ${size} MB\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
