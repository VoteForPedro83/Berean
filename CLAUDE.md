# CLAUDE.md — Berean Bible Study Platform

## HOW TO USE THIS FILE

**At the start of every session:**
1. Read `repomix-snapshot.xml` for codebase structure (run `repomix` first if stale)
2. Read `BUILD_STATUS.md` for current stage and next task
3. Read the relevant `docs/` file for the area you're working in (see table below)
4. **Tell Peder which model to use** based on the task (see routing table below)
5. Update `BUILD_STATUS.md` at the end of every session

**Model routing — enforce this throughout every session, not just at the start:**

Whenever the task type shifts, stop and tell Peder to switch before continuing. Say exactly: "Switch to [model] for this — type `/model` and select [model]." Then wait for confirmation before proceeding.

| Task type | Model |
|---|---|
| Architecture decisions, IndexedDB schema design | Opus |
| New component following existing pattern | Sonnet |
| Debugging async JS, Workbox, race conditions | Sonnet |
| SQL query functions against known schema | Haiku |
| CSS/styling using design system tokens | Haiku |
| Node.js build scripts / data pipeline | Haiku |
| IndexedDB CRUD boilerplate | Haiku |

To start a full Haiku session: `claude --model claude-haiku-4-5-20251001`

**Reference docs — read when needed, not every session:**

| Working on... | Read this file |
|---|---|
| Database queries, SQL schemas, WAL mode, chunking | `docs/SCHEMAS.md` |
| AI providers, context strategy, BYOK, system prompt | `docs/AI.md` |
| Cloudflare Worker, API.Bible proxy, KV | `docs/WORKER.md` |
| TipTap editor, custom nodes, sermon export | `docs/TIPTAP.md` |
| IndexedDB stores and schema | `docs/INDEXEDDB.md` |
| Stage 4–6 feature checklists, SW architecture | `docs/STAGES.md` |
| Translation licences, SA languages, BSSA | `docs/TRANSLATIONS.md` |
| POPIA, legal, licence contacts | `docs/LEGAL.md` |
| Data pipeline, source downloads, build scripts | `docs/SOURCES.md` |
| Keyboard shortcuts | `docs/KEYBOARD.md` |
| WCAG accessibility patterns | `docs/ACCESSIBILITY.md` |

---

## PROJECT IDENTITY

**Name:** Berean — Free Bible study and sermon preparation platform for pastors
**Type:** Static HTML/CSS/JS SPA — no backend, no accounts, offline-capable
**Hosting:** Cloudflare Pages
**Licence:** Open-source, non-commercial, free forever

---

## ABSOLUTE CONSTRAINTS — NEVER VIOLATE

1. **No backend server** — everything runs in the browser
2. **No user accounts** — no login, no registration, no personal data on any server
3. **No paid dependencies** — every library must be free to use
4. **No proprietary data** — all datasets must be public domain or CC-licensed
5. **Offline-capable** — core features work without internet after first load
6. **Privacy-first** — user notes and API keys never leave the device

---

## DEVELOPER CONTEXT

Peder is **not a professional developer** — he builds with AI assistance:
- Always write complete, working files — never partial snippets
- Always explain what you built in plain English after each task
- Always state the next step clearly — never assume he knows what to do
- Warn when something could go wrong and explain how to check it
- Prefer simple, explicit code over clever abstractions

---

## TECHNOLOGY STACK

**Core (browser):** sql.js-httpvfs, split.js, @tiptap/core + starter-kit, leaflet, echarts, vis-timeline, cytoscape, sortablejs, @tanstack/virtual-core, citation-js, qr-code-styling, driver.js, idb, tippy.js, mousetrap, marked, dompurify, wordcloud, file-saver, @tiptap/markdown, @turbodocx/html-to-docx, workbox-*, vite-plugin-pwa

**Build tools:** vite, tailwindcss@4, @tailwindcss/vite

**Build-time only (Node.js):** better-sqlite3, bible-passage-reference-parser, cheerio

**Fonts (self-hosted in public/fonts/):**
- EB Garamond — English scripture text
- Gentium Plus — Greek interlinear ✅ IN USE (full polytonic Unicode)
- SILEOT.ttf / SILEOTSR.ttf — Hebrew interlinear ✅ IN USE (not EzraSIL-R.ttf)
- Inter — UI chrome
- Fira Code — Strong's numbers, morphology tags

⚠️ EB Garamond does NOT render polytonic Greek or Hebrew niqqud. Greek/Hebrew fonts must load first.

---

## PROJECT STRUCTURE

```
berean/
├── CLAUDE.md          ← This file (session startup — keep it lean)
├── BUILD_STATUS.md    ← Current stage + next task
├── repomix-snapshot.xml ← Codebase snapshot (run `repomix` to refresh)
├── docs/              ← Reference docs (read on demand — see table above)
├── index.html
├── vite.config.js
├── tailwind.config.js
├── src/
│   ├── main.js        ← App entry point
│   ├── router.js      ← URL hash router (#JHN.3.16)
│   ├── ai/            ← providers, stream, prompts, context, verify, fallback
│   ├── components/
│   │   ├── bible/     ← reading-pane, verse, interlinear, parallel
│   │   ├── layout/    ← sidebar, panels, command-palette, toast
│   │   ├── study/     ← commentaries, crossrefs, word-study, topical, maps, timeline, entity-graph
│   │   ├── sermon/    ← editor, passage-guide, checklist, clippings, citations, presentation
│   │   ├── study-session/ ← creator, publisher, qr-code, participant
│   │   └── settings/  ← byok-modal, preferences, onboarding
│   ├── db/            ← bible, lexicon, commentaries, crossrefs, topical, narrative, worker-pool
│   ├── idb/           ← schema, sermons, clippings, study-packs, byok
│   ├── state/         ← eventbus, study-mode, sermon-mode
│   └── styles/        ← theme.css, fonts.css, interlinear.css, print.css
├── public/
│   ├── db/            ← SQLite databases (built by scripts/)
│   ├── fonts/         ← Self-hosted fonts
│   └── _headers       ← Cloudflare Pages headers (CRITICAL for SQLite range requests)
├── scripts/           ← Node.js build scripts + source-data/
├── data/              ← books.js, verse-of-day.json, typology.json, translations/
└── worker/
    └── cloudflare-worker.js
```

---

## DESIGN SYSTEM

### CSS Custom Properties (src/styles/theme.css)
```css
:root {
  --color-surface-base: #121212;
  --color-surface-elevated: #1E1E1E;
  --color-surface-raised: #2D2D2D;
  --color-surface-modal: #363636;
  --color-ink-primary: #E8E6E1;
  --color-ink-secondary: #A39E93;
  --color-ink-muted: #6B675F;
  --color-ink-scripture: #F4F1EA;
  --color-accent-gold: #D4AF37;
  --color-accent-sage: #768A78;
  --color-accent-burgundy: #8C1127;
  --color-greek-tint: #E2EBFA;
  --color-hebrew-tint: #F3EBE1;
  --color-border-subtle: #3E3E3E;
  --font-scripture-size: 1.125rem;
  --font-scripture-lh: 1.625;
  --font-interlinear-src: 1.25rem;
  --font-interlinear-meta: 0.75rem;
  --font-ui-label: 0.875rem;
  --space-panel: 1rem;
  --space-verse-gap: 0.75rem;
  --space-word-gap: 0.375rem;
}
.light-mode {
  --color-surface-base: #FAF9F6;
  --color-surface-elevated: #F4F2EC;
  --color-surface-raised: #EAE7E0;
  --color-ink-primary: #1A1A1A;
  --color-ink-scripture: #0A0A0A;
  --color-border-subtle: #D5D1C8;
}
```

### Gold Accent Rules
Gold (`#D4AF37`) ONLY for: active nav items, clickable verse numbers, Strong's links, primary CTA buttons, active panel headers. **Never for body text or decorative fills.**

### Component Rules
- Corner radius: `0.375rem` (6px) components; `0.5rem` (8px) panels/cards
- Animations: 100–250ms, `transform`/`opacity` only — **never animate width or height**
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`
- Always wrap in `@media (prefers-reduced-motion: reduce) { transition-duration: 0ms !important; }`

---

## SESSION MANAGEMENT

At the end of every session, update `BUILD_STATUS.md` with:
1. Which stage is in progress
2. Last task completed (be specific)
3. Next task to start
4. Any blockers
5. Any decisions that deviate from the docs (with reason)

Never leave a session without a working, testable state.
