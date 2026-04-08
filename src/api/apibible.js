/* ============================================================
   apibible.js — API.Bible proxy client
   Fetches online translations via the Cloudflare Worker proxy.
   Worker caches responses in KV (30-day TTL per WORKER.md).

   SETUP REQUIRED: set window.__bereanConfig.workerUrl to your
   deployed Cloudflare Worker URL before online translations work.
   ============================================================ */

// API.Bible Bible IDs for online translations.
// These are the canonical IDs from scripture.api.bible (free plan).
const BIBLE_IDS = {
  KJV:    'de4e12af7f28f599-02',  // King James (Authorised) Version
  ASV:    '06125adad2d5898a-01',  // American Standard Version 1901
  GENEVA: 'c315fa9f71d4af3a-01',  // Geneva Bible 1587
  LSV:    '01b29f4b342acc35-01',  // Literal Standard Version
  TSN:    '69e6826f010ee12a-01',  // Biblica® Open Tswana Living NT (NT only) — CC BY-SA 4.0
};

/**
 * Fetch a chapter's verses from API.Bible via the Cloudflare Worker.
 * Returns [{osisId, verse, text}] or [] if unavailable.
 *
 * @param {string} book           OSIS book code (e.g. 'JHN')
 * @param {number} chapter
 * @param {string} translationKey Translation ID key (e.g. 'ESV')
 */
export async function fetchApiChapter(book, chapter, translationKey) {
  const workerUrl = window.__bereanConfig?.workerUrl;
  if (!workerUrl) return [];   // Worker not configured

  const bibleId = BIBLE_IDS[translationKey];
  if (!bibleId) return [];

  // API.Bible chapter ID format: 'JHN.3'
  const chapterId = `${book}.${chapter}`;

  try {
    const url = `${workerUrl}/api/bible/v1/bibles/${bibleId}/chapters/${chapterId}/verses`
      + `?include-verse-numbers=true&include-titles=false&content-type=text`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const verseList = json?.data ?? [];

    // Fetch verse text in batches using the passages endpoint
    // API.Bible returns verse metadata here; we need to fetch text separately
    // or use a single passage call for the whole chapter.
    if (!verseList.length) return [];

    // Use the chapter passage endpoint for full text (more efficient)
    const passageUrl = `${workerUrl}/api/bible/v1/bibles/${bibleId}/chapters/${chapterId}`
      + `?include-verse-numbers=true&include-titles=false&content-type=text`;

    const passageRes = await fetch(passageUrl, { signal: AbortSignal.timeout(10000) });
    if (!passageRes.ok) throw new Error(`HTTP ${passageRes.status}`);

    const passageJson = await passageRes.json();
    const content = passageJson?.data?.content ?? '';

    // Parse the plain-text chapter into individual verses.
    // API.Bible text format: "[1] verse text [2] verse text ..."
    return parseApiText(content, book, chapter);

  } catch (err) {
    console.warn(`[apibible.js] Failed to fetch ${translationKey} ${book}.${chapter}:`, err.message);
    return [];
  }
}

/**
 * Parse API.Bible plain-text chapter content into verse objects.
 * Format from API.Bible text mode: verse numbers appear as superscripts
 * or as "[N]" markers depending on content-type.
 *
 * This parser handles the "[N]" marker format from content-type=text.
 */
function parseApiText(content, book, chapter) {
  if (!content) return [];

  const verses = [];
  // Split on verse number markers like "[1]", "[2]", etc.
  const parts = content.split(/\[(\d+)\]/).filter(Boolean);

  let i = 0;
  while (i < parts.length) {
    const num = parseInt(parts[i], 10);
    if (!isNaN(num) && i + 1 < parts.length) {
      const text = parts[i + 1].trim().replace(/\s+/g, ' ');
      if (text) {
        verses.push({
          osisId: `${book}.${chapter}.${num}`,
          verse:  num,
          text,
        });
      }
      i += 2;
    } else {
      i++;
    }
  }

  return verses;
}
