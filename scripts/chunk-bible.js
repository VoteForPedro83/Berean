#!/usr/bin/env node
/**
 * chunk-bible.js
 * Splits bible_base.sqlite3 into 20 MB chunks for sql.js-httpvfs chunked mode.
 * Cloudflare Pages has a 25 MB per-file limit, so the 63 MB database must be split.
 *
 * Output:
 *   public/db/chunks/bible_base/000   (~20 MB)
 *   public/db/chunks/bible_base/001   (~20 MB)
 *   public/db/chunks/bible_base/002   (~23 MB)
 *   public/db/chunks/bible_base/config.json
 *
 * Usage:
 *   node scripts/chunk-bible.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH    = path.join(__dirname, '../public/db/bible_base.sqlite3');
const OUT_DIR    = path.join(__dirname, '../public/db/chunks/bible_base');
const CHUNK_SIZE = 20 * 1024 * 1024;  // 20 MB
const SUFFIX_LEN = 3;                  // "000", "001", "002"
const PAGE_SIZE  = 4096;               // SQLite page size (must match pragma page_size)

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ Not found: ${DB_PATH}`);
  console.error('   Run the Bible build script first.');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const data       = fs.readFileSync(DB_PATH);
const totalBytes = data.length;
const numChunks  = Math.ceil(totalBytes / CHUNK_SIZE);

console.log(`\n📦 Chunking bible_base.sqlite3`);
console.log(`   Total size : ${(totalBytes / 1024 / 1024).toFixed(2)} MB (${totalBytes} bytes)`);
console.log(`   Chunk size : 20 MB`);
console.log(`   Chunks     : ${numChunks}`);
console.log();

for (let i = 0; i < numChunks; i++) {
  const start  = i * CHUNK_SIZE;
  const end    = Math.min(start + CHUNK_SIZE, totalBytes);
  const chunk  = data.slice(start, end);
  const name   = String(i).padStart(SUFFIX_LEN, '0');
  const outPath = path.join(OUT_DIR, name);
  fs.writeFileSync(outPath, chunk);
  console.log(`   ✅ ${name}  (${(chunk.length / 1024 / 1024).toFixed(2)} MB)`);
}

// config.json — read by sql.js-httpvfs jsonconfig mode at runtime
const config = {
  serverMode:          'chunked',
  urlPrefix:           '/db/chunks/bible_base/',
  serverChunkSize:     CHUNK_SIZE,
  requestChunkSize:    PAGE_SIZE,
  databaseLengthBytes: totalBytes,
  suffixLength:        SUFFIX_LEN,
};
fs.writeFileSync(path.join(OUT_DIR, 'config.json'), JSON.stringify(config, null, 2));
console.log(`   ✅ config.json`);

console.log(`\n✅ Done — commit public/db/chunks/bible_base/ to git.`);
