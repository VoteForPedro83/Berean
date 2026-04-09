#!/usr/bin/env node
/**
 * setup-db-chunks.js
 * Wraps each small SQLite database as a single-chunk sql.js-httpvfs config.
 * Run automatically as "prebuild" before `vite build`.
 *
 * For databases ≤ 25 MB, we write the entire file as chunk "000".
 * sql.js-httpvfs chunked mode reads the file size from config.json,
 * so Cloudflare Pages never needs to return Content-Length in HEAD responses.
 *
 * Output per database:
 *   public/db/chunks/<name>/000         (copy of the .sqlite3 file)
 *   public/db/chunks/<name>/config.json
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR    = path.join(__dirname, '../public/db');
const CHUNK_DIR = path.join(__dirname, '../public/db/chunks');

const DATABASES = [
  { file: 'cross_refs.sqlite3',    name: 'cross_refs'    },
  { file: 'lexicon.sqlite3',       name: 'lexicon'       },
  { file: 'morphgnt.sqlite3',      name: 'morphgnt'      },
  { file: 'narrative.sqlite3',     name: 'narrative'     },
  { file: 'topical.sqlite3',       name: 'topical'       },
  { file: 'translations_cc.sqlite3', name: 'translations_cc' },
];

console.log('\n📦 setup-db-chunks.js — wrapping databases for Cloudflare Pages\n');

let anyMissing = false;

for (const { file, name } of DATABASES) {
  const srcPath = path.join(DB_DIR, file);
  const outDir  = path.join(CHUNK_DIR, name);

  if (!fs.existsSync(srcPath)) {
    console.warn(`   ⚠️  ${file} not found — skipping`);
    anyMissing = true;
    continue;
  }

  const data       = fs.readFileSync(srcPath);
  const totalBytes = data.length;
  const configPath = path.join(outDir, 'config.json');

  // Skip if config already exists and chunk file matches current size
  if (fs.existsSync(configPath)) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (existing.databaseLengthBytes === totalBytes) {
      console.log(`   ✅ ${name} — already up to date (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
      continue;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  // Write the entire database as chunk "000"
  fs.writeFileSync(path.join(outDir, '000'), data);

  // Write config.json — databaseLengthBytes tells sql.js-httpvfs the exact size
  const config = {
    serverMode:          'chunked',
    urlPrefix:           `/db/chunks/${name}/`,
    serverChunkSize:     totalBytes,   // one chunk = entire file
    requestChunkSize:    4096,
    databaseLengthBytes: totalBytes,
    suffixLength:        3,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`   ✅ ${name} — ${(totalBytes / 1024 / 1024).toFixed(2)} MB → chunks/${name}/000 + config.json`);
}

if (anyMissing) {
  console.log('\n   Some databases were missing. Run the build scripts to generate them.');
}

console.log('\n✅ Done — commit public/db/chunks/ to git.\n');
