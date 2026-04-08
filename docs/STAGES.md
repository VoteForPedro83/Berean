# Berean — Build Stage Reference

Current stage is always in BUILD_STATUS.md. This file is the detailed feature checklist.

---

## Stage 4 — Advanced Interaction ✅ Complete

- Parallel Bible columns (CSS Grid, IntersectionObserver scroll sync)
- API.Bible async fetching (skeleton loaders while loading)
- LXX parallel column (lxx.sqlite3)
- Gospel harmony (harmony.sqlite3, 4-column sync)
- Narrative thread tracking (person → all passages via narrative.sqlite3)
- Place history panel (place → all passages)
- People and places encyclopaedia dashboard
- SQLite FTS5 full-text search (phrase, Boolean, Strong's number scoping)
- AI translation/paraphrase (4 modes + Afrikaans plain)
- AI linked entity discovery (Cytoscape.js knowledge graph)
- DSS verse mapping notes

---

## Stage 5 — Maps, Notes, Sermon Platform ✅ Complete

### Built

| Feature | File(s) | Notes |
|---|---|---|
| Leaflet map (right-panel tab) | `src/components/maps/maps-panel.js` | CartoDB Dark Matter tiles. Passage-relevant markers gold-highlighted. Marker popups show verse refs + bold snippets. |
| TipTap sermon editor | `src/components/sermon/editor.js` | 6 custom nodes. IDB auto-save (3s debounce). Sermon list + create/delete. |
| Citation manager | `src/components/sermon/citations-panel.js` | Chicago-style formatter. Slide-in panel. Insert `[N]` footnote marker into TipTap. |
| Illustration library | `src/components/sermon/illustrations-panel.js` | User-saved stories/analogies/quotes. Keyword search. Insert as `IllustrationBlock`. |
| Preaching calendar | `src/components/sermon/preaching-calendar.js` | Monthly CSS Grid. Assign sermons to Sundays. Export `.ics` for Google/Apple Calendar. |
| Text highlights | `src/components/bible/highlights.js` | 4 colours. CSS Custom Highlight API (Chrome/Edge). data-attr fallback (Safari/Firefox). IDB per verse. |
| Bookmarks | `src/components/bible/bookmarks.js` | Gold dot on verse number. IDB Bookmarks store. |
| Reading plans (6) | `src/components/study/progress-panel.js` | See table below. Plan selector dropdown. Per-plan IDB tracking. Day navigation (prev/next/today). |
| 66-book progress heatmap | `src/components/study/progress-panel.js` | 2 decimal % progress. Gold opacity by completion. Click to navigate to book. |
| Memorisation mode | `src/components/bible/memo-mode.js` | M key. CSS blur on `.verse-text`. Click to reveal. `memo-bar` with reset. |
| Focus mode | `src/components/bible/focus-mode.js` | F key. `requestFullscreen()`. Hides sidebar + right panel. |
| Print CSS | `src/styles/print.css` | `break-inside:avoid` on verses + commentary. Light-mode overrides. No `filter:invert()`. |
| Service Worker | `src/service-worker.js` + `vite.config.js` | Workbox InjectManifest. 3-tier caching. Range requests for SQLite chunks. |
| PWA manifest + icons | `public/icon-192.png`, `public/icon-512.png` | Gold circle on dark bg. Placeholder — replace with proper artwork. |
| Keyboard shortcuts modal | `src/main.js → openShortcutsModal()` | `?` key + sidebar keyboard icon. All shortcuts in grouped table. |
| IDB upgraded to v2 | `src/idb/schema.js` | Added `Highlights` + `PreachingCalendar` stores. |

### Reading plans

| Plan ID | Name | Days | Structure |
|---|---|---|---|
| `sequential` | Bible in a Year | 365 | GEN→REV sequential |
| `mcheyne` | M'Cheyne (4 Streams) | 365 | OT Narrative + Wisdom/Prophets + Gospels (cycling) + Epistles (cycling) |
| `chronological` | Chronological | 365 | Events in historical order |
| `nt_year` | New Testament in a Year | 365 | NT cycling ~1.4× |
| `psalms_proverbs` | Psalms & Proverbs | 31 | 5 Psalms/day (N,N+30,N+60,N+90,N+120) + Prov N |
| `two_year` | Bible in 2 Years | 730 | GEN→REV slow pace |

### Service Worker architecture

**Tool:** vite-plugin-pwa in InjectManifest mode (NOT GenerateSW)

**Tiered caching:**
| Tier | What | When | How |
|---|---|---|---|
| 1 | App shell (HTML/CSS/JS/WASM) | Install | Workbox precache via InjectManifest |
| 2 | Small DBs (translations_cc, lexicon) | Install | Add to precache manifest |
| 3 | Large chunked DBs (bible_base, morphgnt, topical, commentaries) | First query | CacheFirst + RangeRequestsPlugin |

**Range request fix:** Cache API cannot store 206 responses. SW strips `Range` header → fetches full 200 OK → stores in Cache → slices with `createPartialResponse()` → returns 206 to sql.js-httpvfs.

**Safari iOS:** Silently evicts all SW caches after 7 days of no interaction. Fix: `navigator.storage.persist()` called on activate event.

---

## Stage 6 — Sermon Builder + Bible Study Sessions ⬜ Not started

### Priority order for implementation

1. **Clippings system** — `window.getSelection()` → floating toolbar → ClippingsTray IDB → insert into TipTap as `ClippingBlock`
2. **Passage Guide** — parallel Web Workers, progressive section render
3. **Exegetical Checklist** — 8 steps (Fee/Stuart/Robinson), AI per step, IDB ExegesisChecklists
4. **Sermon export** — DOCX (`@turbodocx/html-to-docx`), PDF (print), Markdown (`@tiptap/markdown`)
5. **Study session sharing** — `qr-code-styling` QR codes, participant view `/s/:id`, KV Worker
6. **WhatsApp share** — HTMLRewriter Open Graph in Cloudflare Worker
7. **Offline HTML export** — `<500KB`, no app required
8. **Topic Study Workspace** — `Promise.allSettled()`, SortableJS curation
9. **Presentation Mode** — teleprompter `rAF` + `BroadcastChannel` dual-screen
10. **Study Pack Creator** — TipTap AST parser → JSON schema
11. **Interactive timeline** — `vis-timeline` + narrative.sqlite3 (needs data build)
12. **Passage context banner** — Theographic periods
13. **Kings and prophets Gantt** — D3.js
14. **Entity graph** — `cytoscape` + narrative.sqlite3
15. **URL note sharing** — CompressionStream
16. **GitHub Gist cloud sync**
17. **Encrypted DB export/import** — AES-GCM
18. **Browser extension companion** — Manifest V3
19. **Study analytics** — KV atomic counters, POPIA compliant
20. **Participant view** — router guard `/s/:id`, mobile bottom-sheet

### Data dependencies for Stage 6

| Feature | Needs |
|---|---|
| Timeline, entity graph, passage context | `narrative.sqlite3` — `node scripts/build-narrative.js` |
| LXX parallel | `lxx.sqlite3` — `node scripts/build-lxx.js` |
| Gospel harmony | `harmony.sqlite3` — `node scripts/build-harmony.js` |
| Louw-Nida word study | MACULA Greek re-build — `node scripts/build-morphgnt.js` |
