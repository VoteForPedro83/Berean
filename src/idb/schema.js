/* ============================================================
   schema.js — IndexedDB initialisation (idb library)
   v1 → v2: added Highlights + PreachingCalendar stores
   v2 → v3: added CloudSyncTokens + TopicWorkspace stores
   v3 → v4/5: added ReadingJournal store (idempotent — handles half-upgraded DBs)
   ============================================================ */
import { openDB } from 'idb';

export const DB_NAME    = 'berean';
export const DB_VERSION = 6;
let _db = null;

export async function initDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v1 stores ───────────────────────────────────────
      if (oldVersion < 1) {
        const sermons = db.createObjectStore('Sermons', { keyPath: 'id' });
        sermons.createIndex('seriesId',  'seriesId');
        sermons.createIndex('updatedAt', 'updatedAt');
        sermons.createIndex('osisAnchor','osisAnchor');

        const revisions = db.createObjectStore('SermonRevisions', { keyPath: 'revisionId' });
        revisions.createIndex('sermonId',  'sermonId');
        revisions.createIndex('createdAt', 'createdAt');

        db.createObjectStore('SermonSeries',        { keyPath: 'id' });
        db.createObjectStore('ExegesisChecklists',  { keyPath: 'osisId' });
        db.createObjectStore('WordStudies',         { keyPath: 'lemmaId' });
        db.createObjectStore('TopicStudies',        { keyPath: 'topicId' });

        const clips = db.createObjectStore('ClippingsTray', { keyPath: 'clipId' });
        clips.createIndex('sermonId',  'sermonId');
        clips.createIndex('timestamp', 'timestamp');

        const cites = db.createObjectStore('CitationRegistry', { keyPath: 'citationId' });
        cites.createIndex('sermonId', 'sermonId');

        const packs = db.createObjectStore('StudyPacks', { keyPath: 'id' });
        packs.createIndex('sermonId',  'sermonId');
        packs.createIndex('createdAt', 'createdAt');
        packs.createIndex('status',    'status');

        const illus = db.createObjectStore('IllustrationLibrary', { keyPath: 'id' });
        illus.createIndex('topic',  'topic');
        illus.createIndex('osisId', 'osisId');

        db.createObjectStore('Bookmarks',           { keyPath: 'osisId' });
        db.createObjectStore('ReadingPlanProgress', { keyPath: 'planId' });
        db.createObjectStore('ByokKeys',            { keyPath: 'provider' });
      }

      // ── v2 stores ───────────────────────────────────────
      if (oldVersion < 2) {
        db.createObjectStore('Highlights',       { keyPath: 'osisId' });
        db.createObjectStore('PreachingCalendar', { keyPath: 'date' });
      }

      // ── v3 stores ───────────────────────────────────────
      if (oldVersion < 3) {
        // Cloud sync tokens (GitHub Gist, Google Drive)
        // keyPath: 'service' — e.g. 'github' | 'google'
        db.createObjectStore('CloudSyncTokens', { keyPath: 'service' });

        // Topic Study Workspace — user-curated verse collections per topic
        const topics = db.createObjectStore('TopicWorkspace', { keyPath: 'id' });
        topics.createIndex('updatedAt', 'updatedAt');
      }

      // ── v4/5 stores ─────────────────────────────────────
      // (Idempotent: checks if store exists, since a HMR half-upgrade
      //  can leave the DB at v4 without ReadingJournal. The guard lets
      //  clean installs from v1→v5 work identically to half-upgraded v4s.)
      // ── v6 stores ─────────────────────────────────────────
      if (oldVersion < 6) {
        // PassageGuides — one saved AI guide per passage reference.
        // { osisRef, book, passageLabel, sections:{historical,literary,crossrefs,theological,language}, generatedAt }
        const guides = db.createObjectStore('PassageGuides', { keyPath: 'osisRef' });
        guides.createIndex('book',        'book');
        guides.createIndex('generatedAt', 'generatedAt');

        // AiNotes — one record per passage+mode combination.
        // { noteId (osisRef_mode), osisRef, book, mode, modeName, passageLabel, content, generatedAt }
        const notes = db.createObjectStore('AiNotes', { keyPath: 'noteId' });
        notes.createIndex('osisRef',     'osisRef');
        notes.createIndex('book',        'book');
        notes.createIndex('generatedAt', 'generatedAt');
      }

      if (oldVersion < 5 && !db.objectStoreNames.contains('ReadingJournal')) {
        // ReadingJournal — one record per "chapter marked as read" event.
        // The same chapter can have many records (honest history of re-reads).
        //
        // Record shape:
        //   { id, osisRef, book, chapter, readAt, year, yearMonth, note, sessionId }
        //     id        — UUID (auto)
        //     osisRef   — "JHN.3"       (for per-chapter queries)
        //     book      — "JHN"         (for per-book aggregation)
        //     chapter   — 3             (number; sort within book)
        //     readAt    — epoch ms      (chronological log)
        //     year      — 2026          (year-view filter, denormalized from readAt)
        //     yearMonth — "2026-04"     (monthly heatmap, denormalized from readAt)
        //     note      — string        (optional user note, can be "")
        //     sessionId — string|null   (optional link to StudyPacks.id)
        const journal = db.createObjectStore('ReadingJournal', { keyPath: 'id' });
        journal.createIndex('osisRef',   'osisRef');
        journal.createIndex('book',      'book');
        journal.createIndex('readAt',    'readAt');
        journal.createIndex('year',      'year');
        journal.createIndex('yearMonth', 'yearMonth');
        journal.createIndex('sessionId', 'sessionId');
      }
    },
  });
  return _db;
}

export async function getDB() {
  return _db ?? initDB();
}
