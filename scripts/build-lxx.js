#!/usr/bin/env node
/* ============================================================
   build-lxx.js
   Produces: public/db/lxx.sqlite3

   Source files required:
   ─────────────────────────────────────────────────────────────
   1. Rahlfs LXX (Septuagint — Greek Old Testament)
      URL: https://github.com/eliranwong/LXX-Rahlfs-1935
      Or:  https://github.com/ccat3z/rahlfs-lxx-sqlite
      Place at: scripts/source-data/lxx/
      Key file: rahlfs.sqlite or lxx.json

      IMPORTANT: Rahlfs LXX is in the public domain (Rahlfs died 1935).
      The text is freely available. Use the GitHub mirrors above.

   Run: node scripts/build-lxx.js
   ============================================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'db');

async function main() {
  console.log('🔨 Building lxx.sqlite3…');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // TODO: Implement after source data is downloaded
  // Steps:
  // 1. Parse Rahlfs LXX source → lxx_verses table (osis_id, lxx_text)
  // 2. Map Rahlfs verse numbering to OSIS IDs (note: LXX verse numbers differ from MT)
  // 3. Add transliteration for each verse (optional, can compute at runtime)
  // 4. Write to public/db/lxx.sqlite3

  console.log('⚠️  Script stub — implement after downloading source data.');
}

main().catch(err => { console.error(err); process.exit(1); });
