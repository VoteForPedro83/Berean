# Berean — IndexedDB Schema (src/idb/schema.js)

**Current version: DB_VERSION = 2**

Upgrade history:
- v1 — initial schema (all core stores)
- v2 — added `Highlights` and `PreachingCalendar` stores

```javascript
import { openDB } from 'idb';

export const DB_NAME    = 'berean';
export const DB_VERSION = 2;

export function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── v1 stores ─────────────────────────────────────
      if (oldVersion < 1) {
        const sermons = db.createObjectStore('Sermons', { keyPath: 'id' });
        sermons.createIndex('seriesId',   'seriesId');
        sermons.createIndex('updatedAt',  'updatedAt');
        sermons.createIndex('osisAnchor', 'osisAnchor');

        const revisions = db.createObjectStore('SermonRevisions', { keyPath: 'revisionId' });
        revisions.createIndex('sermonId',  'sermonId');
        revisions.createIndex('createdAt', 'createdAt');

        db.createObjectStore('SermonSeries',       { keyPath: 'id' });
        db.createObjectStore('ExegesisChecklists', { keyPath: 'osisId' });
        db.createObjectStore('WordStudies',        { keyPath: 'lemmaId' });
        db.createObjectStore('TopicStudies',       { keyPath: 'topicId' });

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

      // ── v2 stores ─────────────────────────────────────
      if (oldVersion < 2) {
        db.createObjectStore('Highlights',        { keyPath: 'osisId' });
        db.createObjectStore('PreachingCalendar', { keyPath: 'date' });
      }
    }
  });
}
```

---

## Store Summary

| Store | Key | Version | Purpose |
|---|---|---|---|
| Sermons | id (UUID) | v1 | Sermon documents — TipTap JSON content |
| SermonRevisions | revisionId | v1 | Append-only revision history (debounced 3s) |
| SermonSeries | id | v1 | Sermon series grouping |
| ExegesisChecklists | osisId | v1 | 8-step exegetical checklists per passage (Stage 6) |
| WordStudies | lemmaId | v1 | Saved word studies (keyed by Strong's number) |
| TopicStudies | topicId | v1 | Saved topic studies |
| ClippingsTray | clipId | v1 | Clippings waiting to be inserted into sermon (Stage 6) |
| CitationRegistry | citationId | v1 | Citation metadata — Chicago-formatted references |
| StudyPacks | id | v1 | Published Bible study sessions (Stage 6) |
| IllustrationLibrary | id | v1 | User-saved illustrations (stories, analogies, quotes) |
| Bookmarks | osisId | v1 | Bookmarked verses — key = `BOOK.chapter.verse` |
| ReadingPlanProgress | planId | v1 | Per-plan progress. planId is one of the 6 plan IDs below |
| ByokKeys | provider | v1 | Encrypted API keys (AES-GCM via Web Crypto) |
| Highlights | osisId | v2 | Verse-level text highlights — key = `BOOK.chapter.verse` |
| PreachingCalendar | date | v2 | Sermon scheduled per date — key = `YYYY-MM-DD` |

---

## ReadingPlanProgress — planId values

Each plan gets its own record. Active plan stored in `localStorage('berean_plan')`.

| planId | Plan name | Days |
|---|---|---|
| `sequential` | Bible in a Year | 365 |
| `mcheyne` | M'Cheyne (4 Streams) | 365 |
| `chronological` | Chronological | 365 |
| `nt_year` | New Testament in a Year | 365 |
| `psalms_proverbs` | Psalms & Proverbs | 31 |
| `two_year` | Bible in 2 Years | 730 |

Record shape:
```js
{
  planId:          string,   // one of the IDs above
  startDate:       number,   // Date.now() when plan was started / reset
  completedDays:   number[], // day indices marked fully complete
  visitedChapters: string[], // ['GEN.1', 'GEN.2', ...] chapters navigated to
}
```

---

## Highlights — record shape

```js
{
  osisId:    string,  // e.g. 'JHN.3.16' — verse-level key
  color:     string,  // 'yellow' | 'green' | 'blue' | 'pink'
  createdAt: number,  // Date.now()
}
```

Queried by key range: `IDBKeyRange.bound('BOOK.chapter.', 'BOOK.chapter.\uffff')` per chapter load.
Applied via CSS Custom Highlight API (Chrome/Edge) or `data-hl-color` attribute fallback (Safari/Firefox).

---

## PreachingCalendar — record shape

```js
{
  date:         string,  // 'YYYY-MM-DD'
  sermonId:     string,  // UUID from Sermons store
  sermonTitle:  string,  // cached display title
  notes:        string,  // optional notes
}
```

---

## CitationRegistry — record shape

```js
{
  citationId: string,   // UUID
  sermonId:   string,   // optional — links to Sermons store
  type:       string,   // 'book' | 'commentary' | 'article' | 'website'
  author:     string,   // e.g. 'Grudem, Wayne'
  title:      string,
  year:       string,
  publisher:  string,
  journal:    string,   // for articles
  url:        string,   // for websites
  notes:      string,   // page numbers, chapter refs
  createdAt:  number,
}
```

Formatted in Chicago style by `src/components/sermon/citations-panel.js`.
Inserted into TipTap as `CitationNote` inline node with `[N]` label.

---

## IllustrationLibrary — record shape

```js
{
  id:        string,   // UUID
  title:     string,
  type:      string,   // 'story' | 'analogy' | 'statistic' | 'quote' | 'historical'
  topic:     string,   // free-text tag e.g. 'grace, suffering'
  body:      string,   // full illustration text
  source:    string,   // attribution
  osisId:    string,   // optional passage link
  createdAt: number,
}
```

Inserted into TipTap as `IllustrationBlock` node.
