# BUILD_STATUS.md — Berean Session Tracker

> Claude Code reads and updates this file at the start and end of every session.
> This is the single source of truth for build progress.

---

## CURRENT STATUS

**Current Stage:** STAGE 6 — Complete ✅ · Polish / Bug fixes ongoing
**Overall Progress:** Stage 1 ✅ · Stage 2 ✅ · Stage 3 ✅ · Stage 4 ✅ · Stage 5 ✅ · Stage 6 ✅
**Last Session:** 2026-04-05 (session 2)

**Last Completed Task:**
Bug fixes and UX polish session — no new features:
- **Graph: Clear button** — `src/components/study/entity-graph.js` — added `✕ Clear` button that appears in the graph header when a node is tapped; hides on click and resets all dim/highlight. Added `_clearSelection()` helper. CSS added in `src/main.js` (`.eg__clear`).
- **Settings modal: silent failure fixed** — `src/components/settings/byok-modal.js` — `openSettings()` had no error handling; if `getGithubToken()` or `getGoogleClientId()` threw (e.g. IDB at older schema version), the entire function failed silently and the modal never opened. Fixed: each of the three data-fetches now has its own `try/catch` with safe fallback (null/[]). Also added null-guard re-fetch of `dialog` element. Also fixed `showModal()` double-open error with `if (!dialog.open)` guard.
- **BYOK: API key links + instructions** — `src/components/settings/byok-modal.js` — expanded PROVIDERS array with `keyUrl`, `keySteps`, `hasFree`. Each provider row now shows: FREE TIER badge (Gemini/Groq/Mistral), "Get API key ↗" link. Clicking "Add key" injects step-by-step instructions + direct link above the key input. CSS added in `src/main.js` (`.settings-provider__free-badge`, `.settings-key-instructions`).
- **AI cascade: multi-provider fallback** — `src/ai/stream.js` — when a provider hits 429/401/402, now cascades through `['gemini','groq','mistral']` in order, skipping providers the user has no key for. Tracks tried providers via a `Set`. `_nextFallback()` helper checks `hasApiKey()` for each candidate.
- **AI keyless bug fixed** — `src/ai/stream.js` — Gemini is NOT keyless; removed special-case that let it proceed with `null` key (sending `x-goog-api-key: null` → 400). All providers now require a stored key. Clear error thrown: "No API key for X. Add a free key in Settings → AI API Keys."
- **AI error UX** — `src/components/study/ai-panel.js` — no-key errors now show helpful hint + "⚙ Open Settings" gold button (opens settings modal directly). Link to aistudio.google.com in placeholder note. Same treatment in `passage-guide.js`.

**Previous session task:**
Stage 6, Item 8.12 — Reading Journal (chapter logging, four-tab UI, IDB v5):
- `src/idb/schema.js` (UPDATED) — Bumped DB_VERSION to 5. Added ReadingJournal store with indexes: osisRef, book, readAt, year, yearMonth, sessionId. Denormalized date fields (year, yearMonth) for O(1) index-based queries.
- `src/idb/reading-journal.js` (NEW) — logRead(osisRef, book, chapter, {note, sessionId}), updateNote(id, note), deleteRead(id), getReadOsisRefsForYear(year), getAllReadOsisRefs(), getChapterReadCount(osisRef), getMonthlyReadCounts().
- `src/components/study/reading-journal.js` (NEW) — Four-tab sidebar view: Year (grid + stats, year nav), All-Time (grid + cumulative % progress bar), Calendar (monthly heatmap, 5-level intensity), Log (chronological entries with editable notes per read). Auto-refresh on journal re-activation.
- `src/components/bible/reading-pane.js` (UPDATED) — Added "Mark as read" button in header (checkmark SVG). Click handler calls logRead(), updates button state (_updateMarkReadBtn) with read count check. Called on chapter load to sync visual state.
- `src/components/layout/sidebar.js` (UPDATED) — Added "Reading Journal" nav item (calendar icon).
- `src/main.js` (UPDATED) — Added journal-view container + view:change handler for 'journal' dest. Lazy-init on first nav, refresh on re-activation. Full CSS for .rj__* classes: year nav (bold 1.5rem label, disabled forward button), stats (gold, subtle separators), book grid (7x7px chapter squares, hover scale, gold glow when read), monthly calendar (uppercase labels, dark text on bright cells, 5-level intensity heatmap), log view (editable note textarea, large delete button, hover elevation), progress bar (gold→sage gradient).
- `src/components/settings/cloud-sync.js` (UPDATED) — Added 'ReadingJournal' to SYNC_STORES for backup/restore. Bumped snapshot.version to 4.
- **Architecture:** Deliberate logging via "Mark as read" button click (not automatic on chapter view). Year view toggles between calendar years. Monthly heatmap shows reading frequency per month (not daily). All data freshness handled by refreshReadingJournal() on non-first activation.

Previously completed:
Stage 6, Items 8.7–8.11 — Cloud sync, encrypted backup, topic workspace (full wiring):
- `src/components/settings/cloud-sync.js` (NEW) — GitHub Gist + Google Drive sync (full export/import)
- `src/components/settings/encrypted-backup.js` (NEW) — AES-256-GCM encrypted .berean file export/import
- `src/components/study/topic-workspace.js` (NEW) — Topic study workspace with verse collections, notes, SortableJS reorder, export
- `src/idb/schema.js` — IDB upgraded to v3 (CloudSyncTokens + TopicWorkspace stores)
- `src/components/settings/byok-modal.js` — Added Cloud Sync section (GitHub PAT, Google Drive OAuth, encrypted backup)
- `src/components/layout/sidebar.js` — Added Topics nav item
- `src/main.js` — Wired topics view, added topic workspace CSS + cloud sync CSS
- `index.html` — Added Google Identity Services script tag

Previously completed:
Stage 6, Item 5 — Study session sharing:
- `src/idb/study-packs.js` (NEW) — CRUD for StudyPacks store. Short 8-char alphanumeric IDs.
- `src/components/study-session/creator.js` (NEW) — Full study pack creator: sermon picker, auto-populate title/passage/scripture/outline from sermon, discussion questions (add/remove), leader notes, section add buttons (+Application, +Prayer Points). Save to IDB. Publish flow with QR code.
- `src/components/study-session/publisher.js` (NEW) — Two sharing modes: URL-encoded (CompressionStream gzip → base64url in URL fragment, works offline) and KV Worker (POST to /api/study/:id with Bearer token). Scripture text stripped from URL-encoded packs to keep within QR code limits.
- `src/components/study-session/qr-display.js` (NEW) — `qr-code-styling` QR code in Berean gold on dark bg. Copy URL button. Graceful fallback if URL too long for QR.
- `src/components/study-session/participant.js` (NEW) — Self-contained participant view with its own CSS. Detects `#study=...` hash or `/s/:id` pathname. Renders title, passage, scripture (or "Read X in your Bible"), outline, discussion questions, notes. Light/dark/print modes. Mobile-responsive. "Open in Berean" CTA.
- `src/components/layout/sidebar.js` — Added "Study Sessions" nav item (share icon).
- `src/main.js` — Added `#study=` / `/s/` detection at bootstrap (renders participant view, skips app boot). Added study-session view container + view:change handler. Full CSS for creator, QR display.
- `vite.config.js` — Added `qr-code-styling` to optimizeDeps.include.
- **Architecture decision:** URL-encoded sharing (gzip + base64url in hash fragment) chosen as primary mode. Works fully offline, no server required. KV Worker wired in but gracefully degrades when not deployed.

Previously completed:
Stage 6, Item 4 — Sermon export (TXT, PDF, Markdown)
Stage 6, Item 3 — Exegetical Checklist:
- `src/components/study/exegesis-checklist.js` — 8 steps (Fee/Stuart + Robinson Big Idea). Per-step: italic description, notes textarea, Ask AI button (streams Gemini), AI output with Clear button, completion checkbox. Progress bar (0/8 → 8/8). IDB auto-save (1s debounce) to ExegesisChecklists store. Seeds from current state at lazy-init. Aborts all active streams on passage change.
- `src/main.js` — Added "Exegesis" tab + pane, lazy-init, full CSS (numbered step circles gold on completion, progress bar, textarea focus ring, AI output styled).

Previously completed:
Stage 6, Item 2 — Passage Guide:
- `src/components/study/passage-guide.js` — 5 parallel AI sections (Historical Context, Literary Structure, Cross-References, Theological Themes, Original Language Notes). Progressive streaming render. In-memory cache per passage. Seeds from current state at lazy-init. Stop All button. Collapsible `<details>` accordion per section.
- `src/main.js` — Added "Guide" tab + pane to right panel, lazy-init on first open, full CSS (section accordion, spinner, cursor blink, status badges, reduced-motion).
- **Architecture deviation:** STAGES.md specified "parallel Web Workers" but AI streaming is I/O-bound (network), not CPU-bound. Web Workers add complexity for zero benefit. Used 5 parallel `streamAiResponse()` calls on the main thread instead — identical parallelism, simpler code.

Previously completed in this session:
- Stage 6, Item 1 — Clippings system (IDB CRUD, tray panel, verse menu + selection bar wiring, sermon editor toolbar badge)

**Where we are, plainly:**
Full Bible reader with parallel columns, FTS5 search, AI panel (Gemini), commentary AI summarise, Cloudflare Worker deployed. Multi-verse selection wired to AI. Biblical Geography map (right-panel Map tab, passage-relevant markers). Bookmarks. TipTap sermon editor (6 custom nodes, IDB auto-save, citation manager, illustration library, preaching calendar with .ics export). Focus mode (F). Memorisation mode (M). Text highlights (4 colours, CSS Custom Highlight API + IDB, fallback for Safari). Print CSS. Service Worker (Workbox InjectManifest, 3-tier caching). PWA manifest + icons. 6 reading plans + 66-book progress heatmap (2 decimal %). Keyboard shortcuts modal (? key + sidebar button). Right-panel tab bar scrollable. IDB upgraded to version 5. **Stage 6:** Clippings system (verse → IDB → tray → TipTap ClippingBlock). Passage Guide ("Guide" tab, 5-section parallel AI streaming, in-memory cache). Exegetical Checklist ("Exegesis" tab, 8-step Fee/Stuart+Robinson methodology, AI per step, IDB auto-save, progress bar). Sermon export (TXT, PDF via print CSS, Markdown from JSON walker). Study session sharing (sidebar icon, creator from sermon, gzip+base64url URL-encoded sharing, QR code, participant view with self-contained CSS). Timeline + Entity graph visualization. Presentation mode (teleprompter, dual-screen). Cloud sync (GitHub Gist + Google Drive backup). Topic workspace (verse collections with reorder + export). Reading Journal (four-tab UI: Year view, All-Time progress, Monthly heatmap, Log with notes).

---

## WHAT TO DO NEXT — Stage 6

**Model routing reminder:**
- Architecture / IDB schema decisions → **Opus**
- New components following existing patterns → **Sonnet**
- CSS / styling → **Haiku**

### Stage 6 priorities (in order of impact for a pastor)

1. **Clippings system** ✅ DONE
   - `window.getSelection()` → floating toolbar appears over selected verse text
   - "Add to Sermon" button in toolbar → verse + reference lands in ClippingsTray IDB
   - Tray icon in sermon editor shows clipping count badge
   - Drag or click to insert as `ClippingBlock` node in TipTap
   - File: `src/components/bible/clippings.js` + update reading-pane.js

2. **Passage Guide** ✅ DONE (used parallel streamAiResponse instead of Web Workers — see architecture note above)

3. **Exegetical Checklist** ✅ DONE

4. **Sermon export** ✅ DONE (TXT, PDF, Markdown — no external dependencies)
   - Export buttons in sermon editor header (TXT, PDF, MD icons)
   - PDF via print CSS + `window.print()`
   - Markdown via JSON walker (_jsonToMarkdown)
   - TXT via plain text extraction
   - Files: `src/components/sermon/export.js` (NEW), `src/components/sermon/editor.js` (buttons + handlers)

5. **Study session sharing** ✅ DONE (URL-encoded gzip+base64url sharing, QR code, participant view, KV Worker wired)
   - `src/idb/study-packs.js` (NEW) — CRUD + 8-char alphanumeric IDs
   - `src/components/study-session/creator.js` (NEW) — Sermon picker, auto-populate, section editor, publish flow
   - `src/components/study-session/publisher.js` (NEW) — Gzip + base64url URL-encoded sharing, KV Worker fallback
   - `src/components/study-session/qr-display.js` (NEW) — Styled QR code, copy URL, graceful fallback
   - `src/components/study-session/participant.js` (NEW) — Self-contained mobile-responsive participant view
   - `src/components/layout/sidebar.js`, `src/main.js`, `vite.config.js` updated

6. **Timeline view** ✅ DONE
   - `scripts/build-narrative.js` (UPDATED) — adds `verse_refs` table mapping Theographic IDs → OSIS refs; 31,102 verses indexed
   - `src/db/narrative.js` (NEW) — query layer with OSIS→Theographic book code mapping
   - `src/components/study/timeline-panel.js` (NEW) — vis-timeline with Events/People/Places groups, year-shifted for BC dates, fallback list view
   - `src/main.js` — Timeline tab + lazy-init
   - `vite.config.js` — vis-timeline/standalone pre-bundled

7. **Entity graph** ✅ DONE
   - `src/db/narrative.js` (UPDATED) — added getPeopleCoOccurrences + getPersonPlaceLinks queries
   - `src/components/study/entity-graph.js` (NEW) — cytoscape graph; gold circles=people, sage diamonds=places, co-occurrence edges
   - `src/main.js` — Graph tab + lazy-init + CSS

8.5. **Offline HTML export** ✅ DONE
   - `src/components/sermon/export.js` (UPDATED) — exportSermonHtml(): self-contained HTML file, all styles inlined, DOMParser to transform TipTap classes to semantic CSS, <500KB, works without Berean
   - `src/components/sermon/editor.js` — added HTML export button (code icon) + handler

8.6. **Passage context banner** ✅ DONE
   - `src/db/narrative.js` (UPDATED) — getChapterPeriodLabel() + getChapterYearRange() + _periodForYear() lookup table (Antediluvian → Post-Apostolic, 15 periods)
   - `src/components/bible/reading-pane.js` — banner div + _updateContextBanner() called on every chapter load
   - `src/main.js` — CSS for gold tinted banner strip

8. **Presentation mode** ✅ DONE
   - `src/components/sermon/presentation.js` (NEW) — full-screen teleprompter overlay, rAF auto-scroll, speed control (+/-), pause (Space), dual-screen via BroadcastChannel (S key / ⊞ button), progress bar, auto-hiding controls
   - `src/components/sermon/editor.js` — added ⊞ button + launchPresentation() wiring
   - `src/main.js` — #pres-display hash detection at bootstrap for second-screen display window

8.12. **Reading Journal** ✅ DONE (chapter logging with four-tab UI, monthly heatmap, cloud sync)
   - `src/idb/schema.js` (UPDATED) — IDB v5 with ReadingJournal store (osisRef, book, chapter, readAt, year, yearMonth, note, sessionId) + 6 indexes for O(1) queries
   - `src/idb/reading-journal.js` (NEW) — logRead(), updateNote(), deleteRead(), getReadOsisRefsForYear(), getChapterReadCount(), getMonthlyReadCounts()
   - `src/components/study/reading-journal.js` (NEW) — Four-tab UI: Year (grid + OT/NT stats, year nav), All-Time (grid + cumulative %), Calendar (monthly heatmap, 5-level intensity), Log (editable notes per entry)
   - `src/components/bible/reading-pane.js` (UPDATED) — "Mark as read" button in header, calls logRead(), updates button state with read count check
   - `src/components/layout/sidebar.js` (UPDATED) — Reading Journal nav item
   - `src/main.js` (UPDATED) — journal-view container, lazy-init, view:change handler, full CSS for all 4 tab modes
   - `src/components/settings/cloud-sync.js` (UPDATED) — ReadingJournal added to SYNC_STORES, snapshot.version bumped to 4
   - **Architecture:** Deliberate logging (button click, not automatic). Year view navigation. Monthly heatmap (not daily). Auto-refresh on journal re-activation.

### Data still needed before some Stage 6 features work

| Database | Build command | Source needed |
|---|---|---|
| `narrative.sqlite3` | `node scripts/build-narrative.js` | Theographic dataset |
| `lxx.sqlite3` | `node scripts/build-lxx.js` | Rahlfs LXX text |
| `harmony.sqlite3` | `node scripts/build-harmony.js` | OpenText pericopes |
| MACULA Greek (Louw-Nida) | `node scripts/build-morphgnt.js` | macula-greek clone |

All databases need chunking before Cloudflare Pages deploy:
```
bash scripts/chunk-all-dbs.sh
```

---

## STAGE 6 COMPLETION SUMMARY (2026-04-05)

✅ **All 12 Stage 6 items complete and integrated:**
1. Clippings ✅ | 2. Passage Guide ✅ | 3. Exegesis Checklist ✅ | 4. Sermon Export ✅ | 5. Study Sessions ✅ | 6. Timeline ✅ | 7. Entity Graph ✅ | 8. Presentation ✅ | 8.5. Offline HTML ✅ | 8.6. Context Banner ✅ | 8.7–8.11. Cloud Sync + Topic Workspace ✅ | 8.12. Reading Journal ✅

**Ready for:**
- Deployment (GitHub → Cloudflare Pages + Worker)
- Stage 7 / Feature polish & edge cases
- Translation data builds (BSB, BSSA languages)

---

## TRANSLATION RESEARCH (2026-04-04)

- **BSB** — CC0 Public Domain since April 2023. Best NIV/ESV alternative. Add to Tier 1 offline.
- **NIV** — BYOT only (user imports own licensed text). No direct API path with AI features.
- **ESV** — Online API only. 500 verse / 5 000 query limit. No offline ever.
- **SA translations** — Require BSSA licence: copyright@biblesociety.co.za. Cite CrossWire precedent.
- After BSSA approval → email support@api.bible to whitelist translation IDs on our Worker key.
- **City Bible Foundation** (buy@citybibles.co.za) — fallback if BSSA declines for SA languages.
- **Biblica Open.Bible** (incl. TSN) — AI restriction. Treat as REFERENCE_RECALL for now.

---

## GETTING STARTED — FIRST SESSION CHECKLIST

Complete these steps before any code is written:

### Step 1 — Prerequisites (developer does these manually)
- [x] Install Node.js from nodejs.org (LTS version)
- [x] Install Claude Code from claude.ai/code
- [ ] Create a free Cloudflare account at cloudflare.com
- [ ] Register for a free API.Bible key at scripture.api.bible
- [ ] Register for a free Gemini API key at aistudio.google.com
- [ ] Create a free GitHub account (for Gist sync feature)

### Step 2 — Project setup (Claude Code does these)
- [x] Create project folder structure as defined in CLAUDE.md
- [x] Initialise `package.json` and install all npm dependencies
- [x] Configure `vite.config.js`
- [x] Build all SQLite databases via `scripts/`

### Step 3 — Deploy
- [ ] Push to GitHub → connect to Cloudflare Pages
- [ ] Set `_headers` file COEP/COOP headers for sql.js-httpvfs
- [ ] Deploy Cloudflare Worker (`wrangler publish`)
- [ ] Set KV namespace bindings in Cloudflare dashboard
