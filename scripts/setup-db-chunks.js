#!/usr/bin/env node
/**
 * setup-db-chunks.js
 * Wraps each small SQLite database as a single-chunk sql.js-httpvfs config.
 * Run automatically as "prebuild" before `vite build`.
 *
 * Each database gets its content hash baked into the chunk directory, e.g.:
 *   public/db/chunks/<name>/config.json              (no-cache — always fresh)
 *   public/db/chunks/<name>/<hash>/000               (the actual chunk data)
 *
 * sql.js-httpvfs constructs chunk URLs as:  urlPrefix + zeroPad(index, suffixLength)
 * With urlPrefix = "/db/chunks/<name>/<hash>/" and suffixLength = 3,
 * the only chunk fetched is:  /db/chunks/<name>/<hash>/000
 *
 * Because the chunk URL includes a content hash, the CDN can cache it forever
 * with `immutable`. When the database changes, the hash changes, config.json
 * (served no-cache) points to the new hash directory, and the old URL is
 * simply never requested again. No cache purging ever needed.
 */

import fs     from 'fs';
import path   from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR    = path.join(__dirname, '../public/db');
const CHUNK_DIR = path.join(__dirname, '../public/db/chunks');

const DATABASES = [
  { file: 'cross_refs.sqlite3',      name: 'cross_refs'      },
  { file: 'lexicon.sqlite3',         name: 'lexicon'         },
  { file: 'morphgnt.sqlite3',        name: 'morphgnt'        },
  { file: 'narrative.sqlite3',       name: 'narrative'       },
  { file: 'topical.sqlite3',         name: 'topical'         },
  { file: 'translations_cc.sqlite3', name: 'translations_cc' },
];

console.log('\n📦 setup-db-chunks.js — wrapping databases for Cloudflare Pages\n');

let anyMissing = false;

for (const { file, name } of DATABASES) {
  const srcPath  = path.join(DB_DIR, file);
  const nameDir  = path.join(CHUNK_DIR, name);

  if (!fs.existsSync(srcPath)) {
    console.warn(`   ⚠️  ${file} not found — skipping`);
    anyMissing = true;
    continue;
  }

  const data       = fs.readFileSync(srcPath);
  const totalBytes = data.length;

  // Short content hash (first 12 hex chars of SHA-256)
  const hash       = crypto.createHash('sha256').update(data).digest('hex').slice(0, 12);
  const configPath = path.join(nameDir, 'config.json');

  // Skip if config already points to this exact hash
  if (fs.existsSync(configPath)) {
    const existing    = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const currentHash = existing.urlPrefix?.split('/').filter(Boolean).at(-1);
    if (currentHash === hash && fs.existsSync(path.join(nameDir, hash, '000'))) {
      console.log(`   ✅ ${name} — unchanged (${(totalBytes / 1024 / 1024).toFixed(2)} MB, hash: ${hash})`);
      continue;
    }
  }

  // Remove old hash subdirectories (orphaned — CDN cached but never requested again)
  if (fs.existsSync(nameDir)) {
    for (const entry of fs.readdirSync(nameDir)) {
      if (entry !== 'config.json') {
        fs.rmSync(path.join(nameDir, entry), { recursive: true });
      }
    }
  }

  // Create hash-versioned subdirectory and write chunk "000"
  const hashDir = path.join(nameDir, hash);
  fs.mkdirSync(hashDir, { recursive: true });
  fs.writeFileSync(path.join(hashDir, '000'), data);

  // Write config.json pointing at the hash-versioned urlPrefix
  const config = {
    serverMode:          'chunked',
    urlPrefix:           `/db/chunks/${name}/${hash}/`,
    serverChunkSize:     totalBytes,   // one chunk = entire file
    requestChunkSize:    4096,
    databaseLengthBytes: totalBytes,
    suffixLength:        3,            // appends "000" → full URL = urlPrefix + "000"
  };
  fs.mkdirSync(nameDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`   ✅ ${name} — ${(totalBytes / 1024 / 1024).toFixed(2)} MB → chunks/${name}/${hash}/000`);
}

if (anyMissing) {
  console.log('\n   Some databases were missing. Run the build scripts to generate them.');
}

console.log('\n✅ Done — commit public/db/chunks/ to git.\n');
