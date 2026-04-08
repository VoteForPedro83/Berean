#!/usr/bin/env node
/* ============================================================
   build-harmony.js
   Produces: public/db/harmony.sqlite3

   Source files required:
   ─────────────────────────────────────────────────────────────
   1. Gospel Harmony / Pericopes
      URL: https://opentext.org — check for downloadable pericope data
      Alternative: https://github.com/scrollmapper/bible_databases
      Alternative: Generate from standard harmony tables (e.g. Robertson's)
      Place at: scripts/source-data/harmony/pericopes.json

      Note: If OpenText.org data is not available, use this public domain source:
      "A Harmony of the Gospels" by A.T. Robertson (1922) — many GitHub mirrors exist.
      Search GitHub for "gospel harmony json robertson"

   Run: node scripts/build-harmony.js
   ============================================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'db');

async function main() {
  console.log('🔨 Building harmony.sqlite3…');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // TODO: Implement after source data is downloaded
  // Steps:
  // 1. Parse harmony source (Robertson/OpenText) → gospel_pericopes table
  //    (pericope_id, title, matthew_osis, mark_osis, luke_osis, john_osis)
  // 2. Convert verse ranges to OSIS format (e.g. "Matt 3:13-17" → "MAT.3.13-MAT.3.17")
  // 3. Write to public/db/harmony.sqlite3

  console.log('⚠️  Script stub — implement after downloading source data.');
}

main().catch(err => { console.error(err); process.exit(1); });
