# Berean — Database Schemas Reference

## CRITICAL: WAL Mode Rule
Every build script MUST end with these three lines before `db.close()`:
```javascript
db.pragma('wal_checkpoint(TRUNCATE)');
db.pragma('journal_mode = DELETE');
db.close();
```
If a database looks empty in the browser but has data in DB Browser — WAL mode is the cause.
Fix: delete `-wal` and `-shm` files from `public/db/`, rebuild.

---

## Build Order (run all before writing UI code)
```bash
node scripts/build-bible-base.js      # → public/db/bible_base.sqlite3
node scripts/build-morphgnt.js        # → public/db/morphgnt.sqlite3     (CC BY-SA SEGREGATED)
node scripts/build-translations-cc.js # → public/db/translations_cc.sqlite3 (CC BY-SA SEGREGATED)
node scripts/build-lexicon.js         # → public/db/lexicon.sqlite3
node scripts/build-commentaries.js    # → public/db/commentaries.sqlite3
node scripts/build-crossrefs.js       # → public/db/cross_refs.sqlite3
node scripts/build-topical.js         # → public/db/topical.sqlite3
node scripts/build-narrative.js       # → public/db/narrative.sqlite3
node scripts/build-lxx.js             # → public/db/lxx.sqlite3
node scripts/build-harmony.js         # → public/db/harmony.sqlite3
bash scripts/chunk-all-dbs.sh         # Chunks all DBs for HTTP range requests
```

---

## Chunking Strategy

Before chunking, align large DBs to 4096-byte pages:
```bash
sqlite3 bible_base.sqlite3    "PRAGMA page_size = 4096; VACUUM;"
sqlite3 morphgnt.sqlite3      "PRAGMA page_size = 4096; VACUUM;"
sqlite3 topical.sqlite3       "PRAGMA page_size = 4096; VACUUM;"
sqlite3 commentaries.sqlite3  "PRAGMA page_size = 4096; VACUUM;"
```

| Database | Size | Strategy | Chunk Size |
|---|---|---|---|
| translations_cc.sqlite3 | ~3 MB | Monolithic | — |
| lexicon.sqlite3 | ~7 MB | Monolithic | — |
| topical.sqlite3 | ~13 MB | Chunked | 8 MiB |
| morphgnt.sqlite3 | ~18 MB | Chunked | 8 MiB |
| bible_base.sqlite3 | ~57 MB | Chunked | 8 MiB |
| commentaries.sqlite3 | large | Chunked | 8 MiB |
| cross_refs.sqlite3 | medium | Monolithic (chunk if > 10 MB) | — |
| lxx.sqlite3 | medium | Monolithic (chunk if > 10 MB) | — |
| narrative.sqlite3 | small | Monolithic | — |
| harmony.sqlite3 | small | Monolithic | — |

```bash
npx sql.js-httpvfs-tools split bible_base.sqlite3    --chunk-size 8388608
npx sql.js-httpvfs-tools split morphgnt.sqlite3      --chunk-size 8388608
npx sql.js-httpvfs-tools split topical.sqlite3       --chunk-size 8388608
npx sql.js-httpvfs-tools split commentaries.sqlite3  --chunk-size 8388608
```

Cloudflare Pages `public/_headers` REQUIRED (prevents Content-Length stripping):
```
/*.sqlite3
  Cache-Control: public, max-age=31536000, immutable
  Accept-Ranges: bytes
  Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length

/*.chunk
  Cache-Control: public, max-age=31536000, immutable
  Accept-Ranges: bytes
  Access-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length
```

---

## bible_base.sqlite3
```sql
CREATE TABLE verses (
  osis_id TEXT PRIMARY KEY,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text_web TEXT,
  text_kjv TEXT
);

CREATE TABLE words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_osis TEXT NOT NULL,
  word_sort INTEGER NOT NULL,
  surface_text TEXT,
  transliteration TEXT,
  lemma TEXT,
  strongs TEXT,
  morphology TEXT,
  english_gloss TEXT,
  is_hapax INTEGER DEFAULT 0,
  language TEXT CHECK(language IN ('greek','hebrew'))
);
CREATE INDEX idx_words_verse ON words(verse_osis);
CREATE INDEX idx_words_strongs ON words(strongs);
CREATE INDEX idx_words_lemma ON words(lemma);

CREATE VIRTUAL TABLE bible_search USING fts5(osis_id, book, text_web, text_kjv);
```

## lexicon.sqlite3
```sql
CREATE TABLE strongs (
  strongs_id TEXT PRIMARY KEY,
  lemma TEXT,
  transliteration TEXT,
  pronunciation TEXT,
  part_of_speech TEXT,
  definition TEXT,
  kjv_usage TEXT,
  derivation TEXT,
  language TEXT CHECK(language IN ('greek','hebrew'))
);

-- Named "thayers" but populated from STEPBible TBESG TSV (CC BY 4.0)
CREATE TABLE thayers (
  strongs_id TEXT PRIMARY KEY,
  lemma TEXT,
  short_def TEXT,
  long_def TEXT,
  cognates TEXT
);

-- From OpenScriptures HebrewLexicon — use HebrewStrong.xml NOT BrownDriverBriggs.xml
CREATE TABLE bdb (
  strongs_id TEXT PRIMARY KEY,
  lemma TEXT,
  transliteration TEXT,
  short_def TEXT,
  long_def TEXT,
  twot_number TEXT
);

-- CC BY-SA 4.0 — isolated table, never merge with strongs
CREATE TABLE louw_nida (
  strongs_id TEXT,
  domain_number TEXT,
  domain_name TEXT,
  subdomain TEXT,
  gloss TEXT
);
CREATE INDEX idx_ln_strongs ON louw_nida(strongs_id);
```

## morphgnt.sqlite3
**LICENCE: CC BY-SA 4.0 — SEGREGATED — never merge with other tables**
```sql
CREATE TABLE morphgnt_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_osis TEXT NOT NULL,
  word_sort INTEGER NOT NULL,
  surface_text TEXT,
  lemma TEXT,
  strongs TEXT,
  part_of_speech TEXT,
  morphology TEXT,
  person TEXT, tense TEXT, voice TEXT, mood TEXT,
  case_tag TEXT, number TEXT, gender TEXT,
  louw_nida_code TEXT
);
CREATE INDEX idx_morphgnt_verse ON morphgnt_words(verse_osis);
CREATE INDEX idx_morphgnt_lemma ON morphgnt_words(lemma);
CREATE INDEX idx_morphgnt_strongs ON morphgnt_words(strongs);

CREATE TABLE bhp_apparatus (
  verse_osis TEXT NOT NULL,
  word_sort INTEGER NOT NULL,
  variant_text TEXT,
  manuscript_support TEXT,
  variant_type TEXT CHECK(variant_type IN ('omission','addition','substitution','transposition'))
);
```

## translations_cc.sqlite3
**LICENCE: CC BY-SA 4.0 — SEGREGATED — never merge with other tables**
```sql
CREATE TABLE cc_translations (
  osis_id TEXT NOT NULL,
  translation_id TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (osis_id, translation_id)
);
CREATE INDEX idx_cct_osis ON cc_translations(osis_id);
CREATE INDEX idx_cct_trans ON cc_translations(translation_id);
```

## commentaries.sqlite3
```sql
CREATE TABLE commentaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  source_abbr TEXT NOT NULL,
  author TEXT,
  journal TEXT,
  article_title TEXT,
  publication_year INTEGER,
  language TEXT DEFAULT 'en',
  html_content TEXT NOT NULL
);
CREATE INDEX idx_comm_lookup ON commentaries(book_id, chapter, verse_start, verse_end);
CREATE INDEX idx_comm_language ON commentaries(language);
CREATE INDEX idx_comm_source ON commentaries(source_abbr);
```

## cross_refs.sqlite3
```sql
CREATE TABLE cross_references (
  source_osis TEXT NOT NULL,
  target_osis TEXT NOT NULL,
  votes INTEGER DEFAULT 0,
  dataset TEXT CHECK(dataset IN ('openbible','tsk','ubs'))
);
CREATE INDEX idx_source_osis ON cross_references(source_osis);

CREATE TABLE nt_ot_quotes (
  nt_osis TEXT NOT NULL,
  ot_osis TEXT NOT NULL,
  relationship TEXT CHECK(relationship IN ('quotation','allusion','echo'))
);
CREATE INDEX idx_nt_ot_nt ON nt_ot_quotes(nt_osis);
CREATE INDEX idx_nt_ot_ot ON nt_ot_quotes(ot_osis);
```

## topical.sqlite3
```sql
CREATE TABLE nave_topics (
  topic_id INTEGER PRIMARY KEY,
  topic_name TEXT NOT NULL,
  description TEXT
);
CREATE TABLE nave_verses (
  topic_id INTEGER NOT NULL,
  osis_id TEXT NOT NULL
);
CREATE INDEX idx_nave_topic ON nave_verses(topic_id);
CREATE INDEX idx_nave_verse ON nave_verses(osis_id);
CREATE VIRTUAL TABLE nave_search USING fts5(topic_name, description);

CREATE TABLE dictionaries (
  entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT CHECK(source IN ('easton','smith','hitchcock')),
  term TEXT NOT NULL,
  definition_html TEXT NOT NULL
);
CREATE VIRTUAL TABLE dict_search USING fts5(term, definition_html);
```

## narrative.sqlite3
```sql
CREATE TABLE people (
  person_id TEXT PRIMARY KEY, name TEXT NOT NULL, also_known_as TEXT,
  gender TEXT, birth_year INTEGER, death_year INTEGER, description TEXT
);
CREATE TABLE person_verses (
  person_id TEXT NOT NULL, osis_id TEXT NOT NULL, event_summary TEXT
);
CREATE INDEX idx_pv_person ON person_verses(person_id);
CREATE INDEX idx_pv_verse ON person_verses(osis_id);

CREATE TABLE places (
  place_id TEXT PRIMARY KEY, name TEXT NOT NULL,
  latitude REAL, longitude REAL, description TEXT
);
CREATE TABLE place_verses (place_id TEXT NOT NULL, osis_id TEXT NOT NULL);
CREATE INDEX idx_plv_place ON place_verses(place_id);
CREATE INDEX idx_plv_verse ON place_verses(osis_id);

CREATE TABLE periods (
  period_id TEXT PRIMARY KEY, name TEXT NOT NULL,
  start_year INTEGER, end_year INTEGER, empire TEXT, description TEXT
);
CREATE TABLE period_verses (period_id TEXT NOT NULL, osis_id TEXT NOT NULL);
CREATE INDEX idx_perv_period ON period_verses(period_id);
CREATE INDEX idx_perv_verse ON period_verses(osis_id);
```

## lxx.sqlite3
```sql
CREATE TABLE lxx_verses (
  osis_id TEXT PRIMARY KEY,
  lxx_text TEXT,
  lxx_transliteration TEXT
);
```

## harmony.sqlite3
```sql
CREATE TABLE gospel_pericopes (
  pericope_id INTEGER PRIMARY KEY,
  title TEXT,
  matthew_osis TEXT, mark_osis TEXT, luke_osis TEXT, john_osis TEXT
);
```
