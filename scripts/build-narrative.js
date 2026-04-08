#!/usr/bin/env node
/* ============================================================
   build-narrative.js
   Produces: public/db/narrative.sqlite3

   Parses Theographic Bible Metadata JSON files:
   - verses.json    → verse_refs table (Theographic ID → OSIS ref)
   - people.json    → people + person_verses tables
   - places.json    → places + place_verses tables
   - events.json    → events + event_verses tables

   The verse_refs table is the key: it maps Theographic internal
   IDs (rec...) to OSIS references (Gen.1.1) so the UI can
   query "give me all events/people/places for John 3".

   Run: node scripts/build-narrative.js
   ============================================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'db');
const SOURCE_DIR = path.join(__dirname, 'source-data', 'theographic', 'json');

async function main() {
  console.log('🔨 Building narrative.sqlite3…');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const dbPath = path.join(OUTPUT_DIR, 'narrative.sqlite3');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // ── Create tables ────────────────────────────────────────
  db.exec(`
    CREATE TABLE verse_refs (
      theographic_id TEXT PRIMARY KEY,
      osis_ref TEXT NOT NULL,        -- e.g. "Gen.1.1"
      osis_book TEXT NOT NULL,       -- e.g. "Gen"
      osis_chapter INTEGER NOT NULL, -- e.g. 1
      osis_verse INTEGER NOT NULL,   -- e.g. 1
      year_num INTEGER               -- narrative year (negative = BC)
    );

    CREATE INDEX idx_verse_refs_osis ON verse_refs(osis_book, osis_chapter);

    CREATE TABLE people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT,
      birth_year INTEGER,
      death_year INTEGER,
      birth_place TEXT,
      death_place TEXT
    );

    CREATE INDEX idx_people_name ON people(name);

    CREATE TABLE person_verses (
      person_id TEXT NOT NULL,
      verse_id TEXT NOT NULL,
      PRIMARY KEY (person_id, verse_id)
    );

    CREATE INDEX idx_person_verses_verse ON person_verses(verse_id);

    CREATE TABLE places (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      feature_type TEXT,
      verse_count INTEGER DEFAULT 0
    );

    CREATE INDEX idx_places_name ON places(name);
    CREATE INDEX idx_places_geo ON places(latitude, longitude);

    CREATE TABLE place_verses (
      place_id TEXT NOT NULL,
      verse_id TEXT NOT NULL,
      PRIMARY KEY (place_id, verse_id)
    );

    CREATE INDEX idx_place_verses_verse ON place_verses(verse_id);

    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      start_date TEXT,
      duration TEXT
    );

    CREATE INDEX idx_events_title ON events(title);

    CREATE TABLE event_verses (
      event_id TEXT NOT NULL,
      verse_id TEXT NOT NULL,
      PRIMARY KEY (event_id, verse_id)
    );

    CREATE INDEX idx_event_verses_verse ON event_verses(verse_id);
  `);

  // ── Step 1: Parse verses.json → verse_refs ───────────────
  // This is the mapping layer: Theographic IDs ↔ OSIS references.
  // Required for all passage-based queries.
  console.log('  📥 Loading verses.json (35 MB — takes ~10s)…');
  const verses = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'verses.json'), 'utf8'));

  const insertVerseRef = db.prepare(`
    INSERT OR IGNORE INTO verse_refs (theographic_id, osis_ref, osis_book, osis_chapter, osis_verse, year_num)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertVerseRefs = db.transaction(items => {
    for (const v of items) insertVerseRef.run(...v);
  });

  const verseRefRows = [];
  for (const verse of verses) {
    if (!verse.fields?.osisRef) continue;
    const osis = verse.fields.osisRef;
    const parts = osis.split('.');
    if (parts.length !== 3) continue;
    verseRefRows.push([
      verse.id,
      osis,
      parts[0],
      parseInt(parts[1]),
      parseInt(parts[2]),
      verse.fields.yearNum ?? null,
    ]);
  }

  insertVerseRefs(verseRefRows);
  console.log(`    ✅ ${verseRefRows.length} verse references indexed`);

  // ── Step 2: Parse people.json ────────────────────────────
  console.log('  📥 Loading people.json…');
  const people = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'people.json'), 'utf8'));

  const insertPerson = db.prepare(`
    INSERT INTO people (id, name, gender, birth_year, death_year, birth_place, death_place)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPersonVerse = db.prepare(`
    INSERT OR IGNORE INTO person_verses (person_id, verse_id) VALUES (?, ?)
  `);

  const insertPeople = db.transaction(rows => {
    for (const [person, verseRows] of rows) {
      insertPerson.run(...person);
      for (const v of verseRows) insertPersonVerse.run(...v);
    }
  });

  const peopleRows = [];
  for (const person of people) {
    if (!person.fields) continue;
    const f = person.fields;
    const verseLinks = (f.verses || []).map(vid => [person.id, vid]);
    peopleRows.push([
      [
        person.id,
        f.name || '',
        f.gender || null,
        f.birthYear ? parseInt(f.birthYear) : null,
        f.deathYear ? parseInt(f.deathYear) : null,
        (f.birthPlace?.[0]) || null,
        (f.deathPlace?.[0]) || null,
      ],
      verseLinks,
    ]);
  }

  insertPeople(peopleRows);
  const personCount = peopleRows.length;
  const personVerseCount = peopleRows.reduce((acc, [, v]) => acc + v.length, 0);
  console.log(`    ✅ ${personCount} people, ${personVerseCount} person-verse links`);

  // ── Step 3: Parse places.json ────────────────────────────
  console.log('  📥 Loading places.json…');
  const places = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'places.json'), 'utf8'));

  const insertPlace = db.prepare(`
    INSERT INTO places (id, name, latitude, longitude, feature_type, verse_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertPlaceVerse = db.prepare(`
    INSERT OR IGNORE INTO place_verses (place_id, verse_id) VALUES (?, ?)
  `);

  const insertPlaces = db.transaction(rows => {
    for (const [place, verseRows] of rows) {
      insertPlace.run(...place);
      for (const v of verseRows) insertPlaceVerse.run(...v);
    }
  });

  const placeRows = [];
  for (const place of places) {
    if (!place.fields) continue;
    const f = place.fields;
    const name = f.displayTitle || f.kjvName || f.esvName || '';
    const lat = f.latitude ? parseFloat(f.latitude) : null;
    const lon = f.longitude ? parseFloat(f.longitude) : null;
    const verseLinks = (f.verses || []).map(vid => [place.id, vid]);
    placeRows.push([
      [place.id, name, lat, lon, f.featureType || null, f.verseCount ? parseInt(f.verseCount) : 0],
      verseLinks,
    ]);
  }

  insertPlaces(placeRows);
  const placeCount = placeRows.length;
  const placeVerseCount = placeRows.reduce((acc, [, v]) => acc + v.length, 0);
  console.log(`    ✅ ${placeCount} places, ${placeVerseCount} place-verse links`);

  // ── Step 4: Parse events.json ────────────────────────────
  console.log('  📥 Loading events.json…');
  const events = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'events.json'), 'utf8'));

  const insertEvent = db.prepare(`
    INSERT INTO events (id, title, start_date, duration) VALUES (?, ?, ?, ?)
  `);
  const insertEventVerse = db.prepare(`
    INSERT OR IGNORE INTO event_verses (event_id, verse_id) VALUES (?, ?)
  `);

  const insertEvents = db.transaction(rows => {
    for (const [event, verseRows] of rows) {
      insertEvent.run(...event);
      for (const v of verseRows) insertEventVerse.run(...v);
    }
  });

  const eventRows = [];
  for (const event of events) {
    if (!event.fields) continue;
    const f = event.fields;
    const verseLinks = (f.verses || []).map(vid => [event.id, vid]);
    eventRows.push([
      [event.id, f.title || '', f.startDate || null, f.duration || null],
      verseLinks,
    ]);
  }

  insertEvents(eventRows);
  const eventCount = eventRows.length;
  const eventVerseCount = eventRows.reduce((acc, [, v]) => acc + v.length, 0);
  console.log(`    ✅ ${eventCount} events, ${eventVerseCount} event-verse links`);

  db.close();
  const stats = fs.statSync(dbPath);
  console.log(`\n✅ narrative.sqlite3 rebuilt (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`   Passage-based queries now enabled via verse_refs table.`);
}

main().catch(err => { console.error(err); process.exit(1); });
