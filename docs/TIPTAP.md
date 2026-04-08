# Berean — TipTap Editor Reference

Editor lives in `src/components/sermon/editor.js`. All custom nodes must be registered before `new Editor({...})` is called.

---

## Custom Nodes

| Node | Group | Key Attributes | Renders As | File |
|---|---|---|---|---|
| `ScriptureBlock` | block | `ref` (OSIS), `trans` (translation ID) | `<blockquote data-type="scripture">` with gold left border | `nodes/scripture-block.js` |
| `PointHeading` | block | `level` (`'main'` or `'sub'`) | `<h3>` (main) or `<h4>` (sub) | `nodes/point-heading.js` |
| `ApplicationBlock` | block | — | `<div data-type="application">` with CSS `::before` arrow | `nodes/application-block.js` |
| `IllustrationBlock` | block | `source`, `sourceUrl` | `<aside data-type="illustration">` with tinted background | `nodes/illustration-block.js` |
| `ClippingBlock` | block | `source`, `attribution`, `osisId`, `isAI` | `<blockquote data-type="clipping">` with locked attribution | `nodes/clipping-block.js` |
| `CitationNote` | inline | `citationId`, `label` | `<sup data-type="citation">` with `[N]` label | `nodes/citation-note.js` |

---

## Toolbar Commands

Toolbar button → `data-cmd` attribute → dispatched via `_runToolbarCommand()`:

| cmd | Action |
|---|---|
| `bold` | Toggle bold |
| `italic` | Toggle italic |
| `strike` | Toggle strikethrough |
| `heading` + `data-level` | Toggle heading h2/h3 |
| `bulletList` | Toggle bullet list |
| `orderedList` | Toggle ordered list |
| `scriptureBlock` | Insert ScriptureBlock |
| `pointMain` | Insert PointHeading (main) |
| `pointSub` | Insert PointHeading (sub) |
| `applicationBlock` | Insert ApplicationBlock |
| `illustrationBlock` | Insert IllustrationBlock (empty) |
| `openCitations` | Open citations side panel |
| `openLibrary` | Open illustration library side panel |

---

## Side Panels (Stage 5)

Both panels slide in from the right within the editor view (`#se-editor-view`). Only one open at a time.

### Citations Panel (`src/components/sermon/citations-panel.js`)

- `openCitationsPanel(editor)` — creates and mounts the panel
- Lists all `CitationRegistry` IDB records sorted by creation date
- **Add citation** form: type (book/commentary/article/website), author, title, year, publisher, URL, notes
- **Insert** — calls `editor.chain().focus().insertContent({ type: 'citationNote', attrs: { citationId, label: '[N]' } }).run()`
- **Delete** — removes from IDB
- Formats citations in Chicago style via `_formatChicago(c)` (manual, no external lib)

### Illustration Library (`src/components/sermon/illustrations-panel.js`)

- `openIllustrationsPanel(editor)` — creates and mounts the panel
- Lists `IllustrationLibrary` IDB records, sorted by creation date
- **Search** — filters by keyword across title/body/topic (250ms debounce)
- **Add illustration** form: title, type (story/analogy/statistic/quote/historical), topic tag, body, source
- **Insert** — calls `editor.chain().focus().insertContent({ type: 'illustrationBlock', ... }).run()`

---

## Preaching Calendar (`src/components/sermon/preaching-calendar.js`)

Accessible via the **"Calendar"** tab in the sermon list view (next to "Sermons").

- `initPreachingCalendar(containerEl)` — renders the calendar into the container
- Monthly CSS Grid (7 columns). Sundays highlighted.
- Click `+ Assign sermon` → picker dialog lists all sermons → click to assign
- Assigned sermon title appears in the Sunday cell
- `Export .ics` → downloads iCalendar file for Google/Apple Calendar/Outlook
- IDB store: `PreachingCalendar` keyed by `YYYY-MM-DD`

---

## Auto-save

```
editor.onUpdate → _scheduleContentSave()
  → clearTimeout + setTimeout(3000)
  → updateSermon(id, { content: editor.getJSON(), wordCount })
  → _setStatus('saved')
```

Status indicator: `Saved` / `Unsaved` / `Saving...` / `Save failed`

---

## Sermon Export Stack (Stage 6 — not yet implemented)

| Format | Library | Approach |
|---|---|---|
| Markdown | `@tiptap/markdown` | `editor.storage.markdown.getMarkdown()` |
| DOCX | `@turbodocx/html-to-docx` | `editor.getHTML()` → TurboDocx → Blob download |
| PDF | Browser native print | Hidden `<iframe>` + `@media print` CSS + `window.print()` |

Total lazy-load budget: ~2.5 MB. pandoc-wasm rejected (16.1 MB / 58 MB in memory).

---

## InputRule — Auto-format Verse References (planned, Stage 6)

```javascript
// Detects: "John 3:16 " or "1 Cor 13:4-7 " as the pastor types (trailing space triggers)
const VERSE_REGEX = /^([1-3]?\s?[A-Za-z]+)\s(\d{1,3}):(\d{1,3}(?:-\d{1,3})?)\s$/;
// On match: query bible_base SQLite → insert ScriptureBlock with fetched verse text
```

---

## Markdown Serialization (planned, Stage 6)

- `ScriptureBlock`, `ApplicationBlock`, `ClippingBlock` → `> [!type]\n> ` + `helpers.renderChildren()`
- `PointHeading` → `'#'.repeat(level) + ' ' + content`
- `CitationNote` → `[^${node.attrs.citationId}]`
- `IllustrationBlock` → `> [!illustration] Source\n> content`
