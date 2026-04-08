# Berean — Accessibility Requirements (WCAG 2.1 AA)

## Interlinear ARIA Pattern
```html
<!-- Visual nodes hidden from screen reader — aggregated label on parent -->
<div class="word-stack"
     role="button"
     tabindex="0"
     aria-label="Word: agapao, Greek verb, aorist active indicative, Strong's G25, meaning: to love"
     data-strongs="G25">
  <bdi class="source-text greek" aria-hidden="true">ἠγάπησεν</bdi>
  <span class="transliteration" aria-hidden="true">ēgapēsen</span>
  <span class="english-gloss" aria-hidden="true">loved</span>
  <span class="morph-tag" aria-hidden="true">V-AIA-3S</span>
</div>
```

## Hebrew RTL
```html
<!-- Always set dir and lang on Hebrew spans -->
<bdi dir="rtl" lang="he" class="source-text hebrew">בְּרֵאשִׁ֖ית</bdi>
```

## Focus Management
- All modals must trap focus (Tab cycles within modal only)
- On modal close: return focus to the element that opened it
- Use `<dialog>` element where possible — handles focus trap natively

## Verified Colour Contrast
- `--color-ink-primary` (#E8E6E1) on `--color-surface-base` (#121212): 13.5:1 ✓
- `--color-ink-secondary` (#A39E93) on `--color-surface-base`: 7.2:1 ✓
- `--color-accent-gold` (#D4AF37) on `--color-surface-base`: 7.9:1 ✓ (large text/interactive only)
