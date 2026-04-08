/* ============================================================
   bookmarks.js — Bookmark visual persistence (Stage 5)
   Loads bookmarks from IndexedDB when a chapter is rendered
   and marks verse containers with a CSS class for styling.
   Also handles the VERSE_BOOKMARK event to update live.
   ============================================================ */
import { bus, EVENTS } from '../../state/eventbus.js';
import { getAllBookmarks } from '../../idb/byok.js';

export function initBookmarks() {
  // When a chapter finishes loading, mark bookmarked verses
  bus.on(EVENTS.CHAPTER_LOADED, async ({ book, chapter }) => {
    await _applyBookmarksToChapter(book, chapter);
  });

  // When a bookmark is toggled live, update the DOM immediately
  bus.on(EVENTS.VERSE_BOOKMARK, ({ osisId, isBookmarked }) => {
    const el = document.getElementById(`v-${osisId}`);
    if (el) el.classList.toggle('verse-container--bookmarked', isBookmarked);
  });
}

async function _applyBookmarksToChapter(book, chapter) {
  const all = await getAllBookmarks();
  if (!all.length) return;

  // Build a set of OSIS IDs for this chapter's bookmarks
  const chapterPrefix = `${book}.${chapter}.`;
  const bookmarkedSet = new Set(
    all.filter(b => b.osisId.startsWith(chapterPrefix)).map(b => b.osisId)
  );

  if (!bookmarkedSet.size) return;

  bookmarkedSet.forEach(osisId => {
    const el = document.getElementById(`v-${osisId}`);
    if (el) el.classList.add('verse-container--bookmarked');
  });
}
