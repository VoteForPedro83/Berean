# Berean — Keyboard Shortcuts

All shortcuts implemented via Mousetrap.js in `src/main.js → wireShortcuts()`.
The `?` key and sidebar keyboard icon open the in-app shortcuts reference modal.

---

## Implemented (Stage 1–5)

| Action | Shortcut | Where wired |
|---|---|---|
| Command palette | `Ctrl+K` / `Cmd+K` | `wireShortcuts()` |
| Toggle sidebar | `Ctrl+B` | `wireShortcuts()` |
| Next chapter | `Alt+→` | `wireShortcuts()` |
| Previous chapter | `Alt+←` | `wireShortcuts()` |
| Toggle interlinear | `Ctrl+I` | `wireShortcuts()` |
| Toggle parallel column | `Ctrl+P` | `wireShortcuts()` |
| Toggle light/dark theme | `Ctrl+Shift+M` | `wireShortcuts()` |
| Focus mode (fullscreen) | `F` | `wireShortcuts()` |
| Memorisation mode (blur verses) | `M` | `wireShortcuts()` |
| Show keyboard shortcuts | `?` | `wireShortcuts()` |
| Close modal / exit fullscreen | `Esc` | Native browser |

---

## Planned (Stage 6)

These are defined in `docs/STAGES.md` but not yet wired:

| Action | Planned shortcut | Stage |
|---|---|---|
| Send selection to clippings | `Ctrl+Shift+C` | 6 |
| Generate passage guide | `Ctrl+G` | 6 |
| Export sermon | `Ctrl+E` | 6 |
| Trigger AI on selection | `Ctrl+/` | 6 |
| Launch presentation mode | `Ctrl+Shift+P` | 6 |
| Bookmark verse | `Ctrl+D` | future |

---

## Mousetrap notes

- `mod` = Ctrl on Windows/Linux, Cmd on Mac
- Single letter shortcuts (`f`, `m`, `?`) are suppressed when focus is inside a text input or `contenteditable` — Mousetrap handles this automatically via the `stopCallback` default
- To override for a specific element: `Mousetrap.bind('f', handler)` will NOT fire when the user is typing in the sermon editor title field or TipTap editor
- If a new shortcut conflicts with browser defaults, use `e.preventDefault()` in the handler
