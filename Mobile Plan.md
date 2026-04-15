# Mobile Plan — Make Berean Workable on a Phone

## Context

Berean is architecturally PWA-ready (manifest, service worker, chunked SQLite, correct viewport meta) but functionally desktop-first. On a 375–480 px screen the split.js two-pane layout collapses below its 580 px combined `minSize`, the 11-tab study bar overflows, sidebar icons are 22 px (below the 44 px WCAG tap target), interactions depend on hover (Tippy Strong's popups) and keyboard-only shortcuts (Ctrl+B sidebar toggle, Mousetrap bindings), and the TipTap sermon toolbar overflows. Core reading is unusable.

Goal: a pastor can open Berean on an iPhone/Android, read a chapter, switch translations, search, tap a verse for commentary/cross-refs, and view their sermon notes. Heavy visualisations (Timeline, Entity Graph, Map, Wordcloud) degrade gracefully but aren't blockers.

This plan is phased so each phase ships something usable; stop after any phase if it's enough.

---

## Phase 1 — Reading works on a phone (biggest unlock)

**Goal:** on ≤ 768 px, the app shows one pane at a time with a clear way to switch; tap targets meet WCAG; no layout overflow.

1. **Responsive layout breakpoint** — `src/components/layout/panels.js:14-18`
   - Detect `matchMedia('(max-width: 768px)')`. On mobile, skip `Split()` initialisation; use a single-pane stacked mode with a mode toggle (`Read | Study | Sermon`) in a sticky top bar. Keep split.js for ≥ 769 px.
   - Add `window.matchMedia(...).addEventListener('change', ...)` to re-init on rotation/resize.

2. **Sidebar → mobile drawer** — `src/components/layout/sidebar.js:7-11,52-71`
   - On mobile, collapse sidebar behind a hamburger button in the top bar. Slide-in drawer with backdrop; tap backdrop or nav item to close. Bump icon hit area to 44 × 44 px.
   - Reuse the existing `Ctrl+B` toggle path — just wire it to a click handler on the hamburger.

3. **Tab bar scrollable on mobile** — `src/main.js:240-266`
   - The current `grid-template-columns:repeat(6,1fr)` produces illegible 30 px tabs on a phone. On `max-width:640px`, switch to `display:flex; overflow-x:auto; scroll-snap-type:x mandatory` with 80 px min-width per tab. Keep desktop grid unchanged.

4. **Tap targets + safe-area** — global CSS in `src/main.js` theme block
   - Minimum 44 × 44 px for sidebar icons, tab buttons, verse menu, toast close.
   - Add `env(safe-area-inset-bottom)` to toast container and any fixed-bottom UI (command palette, selection bar).
   - `viewport-fit=cover` in `index.html` meta viewport.

5. **Command palette + modals mobile-fit** — `src/main.js:286-299`, `byok-modal.js`
   - `max-width: min(100vw - 1rem, 640px)`, full-height on `max-width:480px`, no horizontal overflow in settings sections.

**Verification:** Chrome DevTools device toolbar at iPhone 12 (390 × 844) and Pixel 5 (393 × 851): load a chapter, open commentary tab, open sidebar drawer, switch panes, open settings. No horizontal scroll, no clipped controls.

---

## Phase 2 — Touch interactions replace hover/keyboard-only UX

1. **Strong's / Tippy popovers** — `src/components/bible/interlinear.js`
   - Add `trigger: 'mouseenter focus click'` (Tippy supports multi-trigger) and `touch: ['hold', 500]` so tap holds open the popover. Tap-elsewhere dismisses.

2. **Verse selection bar on touch** — `src/components/bible/reading-pane.js`
   - `window.getSelection()` is fragile on iOS. Add fallback: long-press a verse (500 ms `touchstart`/`touchend` gesture) → select that verse → show selection bar. Reuse existing bar logic.

3. **Mousetrap guard** — `src/main.js:209-220`
   - When `document.activeElement` is `contentEditable` or an `input`/`textarea`, bypass global shortcuts (Mousetrap already respects this but double-check `F`, `M`, `?` bindings don't intercept mobile keyboard).

4. **Swipe gestures (nice-to-have)**
   - Swipe left/right on reading pane → next/previous chapter. Plain `touchstart`/`touchend` delta check, ignore if vertical > horizontal.

**Verification:** On real iOS Safari + Android Chrome: tap Strong's number opens lexicon, long-press verse opens selection bar, typing into sermon editor doesn't trigger `F`/`M`.

---

## Phase 3 — Heavy components: degrade gracefully

On mobile, these panels are not blockers but must not crash or consume excessive memory.

1. **TipTap sermon toolbar** — `src/components/sermon/editor.js:79-100`
   - On `max-width:640px`, collapse secondary buttons into an overflow `⋯` menu. Keep Bold / Italic / Heading / List visible. Export buttons (TXT/PDF/MD/HTML/⊞) move into a single Export dropdown.

2. **Maps / Timeline / Entity Graph / Wordcloud**
   - Lazy-load already done. On mobile, show a "Best on a larger screen — tap to load anyway" placeholder with a button. Prevents Leaflet/Cytoscape from allocating on first tab-view.
   - Map pan/pinch already works; just make container full-width.

3. **Parallel Bible view** — `src/components/bible/parallel.js`
   - On mobile, stack columns vertically (one translation per row) instead of side-by-side.

**Verification:** Open each heavy panel on a phone; confirm graceful placeholder + opt-in load, no memory pressure warning in Safari Web Inspector.

---

## Phase 4 — Polish

1. **Font scaling** — respect iOS Dynamic Type via `font-size: 100%` on `<html>` and rem-based sizing (already mostly done).
2. **Print CSS** already exists; confirm mobile export flow (PDF via `window.print()` → Safari "Save to Files").
3. **Install prompt** — add a one-time hint toast: "Add to Home Screen for offline reading" on first visit on iOS/Android.
4. **Connection-aware DB chunk loading** — on `navigator.connection.saveData === true` or `effectiveType === '2g'`, defer optional DBs (narrative, commentaries, LXX) until user visits that tab.

---

## Files to modify (summary)

- `src/components/layout/panels.js` — responsive split init
- `src/components/layout/sidebar.js` — drawer + hamburger
- `src/main.js` — top bar, tab bar mobile CSS, safe-area tokens, install hint, connection-aware loads
- `src/components/bible/interlinear.js` — Tippy touch triggers
- `src/components/bible/reading-pane.js` — long-press selection, swipe chapters
- `src/components/bible/parallel.js` — stacked mode on mobile
- `src/components/sermon/editor.js` — collapsing toolbar + export dropdown
- `src/components/study/{maps,timeline,entity-graph,wordcloud}-panel.js` — mobile placeholder + opt-in load
- `index.html` — `viewport-fit=cover`

No schema changes, no new deps.

---

## Verification end-to-end

1. `npm run dev` and open tunnel / LAN URL on a real phone (iOS Safari + Android Chrome).
2. Walkthrough as a pastor:
   - Open → chapter loads → tap a verse → commentary appears → swipe to next chapter.
   - Hamburger → Sermons → open an existing sermon → edit a paragraph → toolbar fits.
   - Hamburger → Reading Journal → tap "Mark as read".
   - Settings → add an API key (keyboard doesn't cover input field).
   - Rotate to landscape → split-pane layout re-enables at ≥ 769 px.
3. Chrome DevTools → Lighthouse Mobile → PWA score should remain installable; no "tap targets too small" audit failures.
4. Real-device memory check: open Timeline + Entity Graph + Map in one session, confirm Safari doesn't reload the page.

---

## Out of scope

- Native iOS/Android apps (stay PWA-only, per project constraints).
- Redesigning desktop layout.
- New features — this is purely responsive retrofit.
