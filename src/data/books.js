/* ============================================================
   books.js — 66 canonical books metadata
   OSIS IDs, display names, chapter counts, testament
   ============================================================ */

export const BOOKS = [
  // ── Old Testament ──────────────────────────────────────
  { osis: 'GEN', name: 'Genesis',         abbr: 'Gen',   chapters: 50, testament: 'OT' },
  { osis: 'EXO', name: 'Exodus',          abbr: 'Exo',   chapters: 40, testament: 'OT' },
  { osis: 'LEV', name: 'Leviticus',       abbr: 'Lev',   chapters: 27, testament: 'OT' },
  { osis: 'NUM', name: 'Numbers',         abbr: 'Num',   chapters: 36, testament: 'OT' },
  { osis: 'DEU', name: 'Deuteronomy',     abbr: 'Deu',   chapters: 34, testament: 'OT' },
  { osis: 'JOS', name: 'Joshua',          abbr: 'Jos',   chapters: 24, testament: 'OT' },
  { osis: 'JDG', name: 'Judges',          abbr: 'Jdg',   chapters: 21, testament: 'OT' },
  { osis: 'RUT', name: 'Ruth',            abbr: 'Rut',   chapters:  4, testament: 'OT' },
  { osis: '1SA', name: '1 Samuel',        abbr: '1Sa',   chapters: 31, testament: 'OT' },
  { osis: '2SA', name: '2 Samuel',        abbr: '2Sa',   chapters: 24, testament: 'OT' },
  { osis: '1KI', name: '1 Kings',         abbr: '1Ki',   chapters: 22, testament: 'OT' },
  { osis: '2KI', name: '2 Kings',         abbr: '2Ki',   chapters: 25, testament: 'OT' },
  { osis: '1CH', name: '1 Chronicles',    abbr: '1Ch',   chapters: 29, testament: 'OT' },
  { osis: '2CH', name: '2 Chronicles',    abbr: '2Ch',   chapters: 36, testament: 'OT' },
  { osis: 'EZR', name: 'Ezra',            abbr: 'Ezr',   chapters: 10, testament: 'OT' },
  { osis: 'NEH', name: 'Nehemiah',        abbr: 'Neh',   chapters: 13, testament: 'OT' },
  { osis: 'EST', name: 'Esther',          abbr: 'Est',   chapters: 10, testament: 'OT' },
  { osis: 'JOB', name: 'Job',             abbr: 'Job',   chapters: 42, testament: 'OT' },
  { osis: 'PSA', name: 'Psalms',          abbr: 'Psa',   chapters: 150, testament: 'OT' },
  { osis: 'PRO', name: 'Proverbs',        abbr: 'Pro',   chapters: 31, testament: 'OT' },
  { osis: 'ECC', name: 'Ecclesiastes',    abbr: 'Ecc',   chapters: 12, testament: 'OT' },
  { osis: 'SNG', name: 'Song of Solomon', abbr: 'Sng',   chapters:  8, testament: 'OT' },
  { osis: 'ISA', name: 'Isaiah',          abbr: 'Isa',   chapters: 66, testament: 'OT' },
  { osis: 'JER', name: 'Jeremiah',        abbr: 'Jer',   chapters: 52, testament: 'OT' },
  { osis: 'LAM', name: 'Lamentations',    abbr: 'Lam',   chapters:  5, testament: 'OT' },
  { osis: 'EZK', name: 'Ezekiel',         abbr: 'Ezk',   chapters: 48, testament: 'OT' },
  { osis: 'DAN', name: 'Daniel',          abbr: 'Dan',   chapters: 12, testament: 'OT' },
  { osis: 'HOS', name: 'Hosea',           abbr: 'Hos',   chapters: 14, testament: 'OT' },
  { osis: 'JOL', name: 'Joel',            abbr: 'Jol',   chapters:  3, testament: 'OT' },
  { osis: 'AMO', name: 'Amos',            abbr: 'Amo',   chapters:  9, testament: 'OT' },
  { osis: 'OBA', name: 'Obadiah',         abbr: 'Oba',   chapters:  1, testament: 'OT' },
  { osis: 'JON', name: 'Jonah',           abbr: 'Jon',   chapters:  4, testament: 'OT' },
  { osis: 'MIC', name: 'Micah',           abbr: 'Mic',   chapters:  7, testament: 'OT' },
  { osis: 'NAH', name: 'Nahum',           abbr: 'Nah',   chapters:  3, testament: 'OT' },
  { osis: 'HAB', name: 'Habakkuk',        abbr: 'Hab',   chapters:  3, testament: 'OT' },
  { osis: 'ZEP', name: 'Zephaniah',       abbr: 'Zep',   chapters:  3, testament: 'OT' },
  { osis: 'HAG', name: 'Haggai',          abbr: 'Hag',   chapters:  2, testament: 'OT' },
  { osis: 'ZEC', name: 'Zechariah',       abbr: 'Zec',   chapters: 14, testament: 'OT' },
  { osis: 'MAL', name: 'Malachi',         abbr: 'Mal',   chapters:  4, testament: 'OT' },
  // ── New Testament ──────────────────────────────────────
  { osis: 'MAT', name: 'Matthew',         abbr: 'Mat',   chapters: 28, testament: 'NT' },
  { osis: 'MRK', name: 'Mark',            abbr: 'Mrk',   chapters: 16, testament: 'NT' },
  { osis: 'LUK', name: 'Luke',            abbr: 'Luk',   chapters: 24, testament: 'NT' },
  { osis: 'JHN', name: 'John',            abbr: 'Jhn',   chapters: 21, testament: 'NT' },
  { osis: 'ACT', name: 'Acts',            abbr: 'Act',   chapters: 28, testament: 'NT' },
  { osis: 'ROM', name: 'Romans',          abbr: 'Rom',   chapters: 16, testament: 'NT' },
  { osis: '1CO', name: '1 Corinthians',   abbr: '1Co',   chapters: 16, testament: 'NT' },
  { osis: '2CO', name: '2 Corinthians',   abbr: '2Co',   chapters: 13, testament: 'NT' },
  { osis: 'GAL', name: 'Galatians',       abbr: 'Gal',   chapters:  6, testament: 'NT' },
  { osis: 'EPH', name: 'Ephesians',       abbr: 'Eph',   chapters:  6, testament: 'NT' },
  { osis: 'PHP', name: 'Philippians',     abbr: 'Php',   chapters:  4, testament: 'NT' },
  { osis: 'COL', name: 'Colossians',      abbr: 'Col',   chapters:  4, testament: 'NT' },
  { osis: '1TH', name: '1 Thessalonians', abbr: '1Th',   chapters:  5, testament: 'NT' },
  { osis: '2TH', name: '2 Thessalonians', abbr: '2Th',   chapters:  3, testament: 'NT' },
  { osis: '1TI', name: '1 Timothy',       abbr: '1Ti',   chapters:  6, testament: 'NT' },
  { osis: '2TI', name: '2 Timothy',       abbr: '2Ti',   chapters:  4, testament: 'NT' },
  { osis: 'TIT', name: 'Titus',           abbr: 'Tit',   chapters:  3, testament: 'NT' },
  { osis: 'PHM', name: 'Philemon',        abbr: 'Phm',   chapters:  1, testament: 'NT' },
  { osis: 'HEB', name: 'Hebrews',         abbr: 'Heb',   chapters: 13, testament: 'NT' },
  { osis: 'JAS', name: 'James',           abbr: 'Jas',   chapters:  5, testament: 'NT' },
  { osis: '1PE', name: '1 Peter',         abbr: '1Pe',   chapters:  5, testament: 'NT' },
  { osis: '2PE', name: '2 Peter',         abbr: '2Pe',   chapters:  3, testament: 'NT' },
  { osis: '1JN', name: '1 John',          abbr: '1Jn',   chapters:  5, testament: 'NT' },
  { osis: '2JN', name: '2 John',          abbr: '2Jn',   chapters:  1, testament: 'NT' },
  { osis: '3JN', name: '3 John',          abbr: '3Jn',   chapters:  1, testament: 'NT' },
  { osis: 'JUD', name: 'Jude',            abbr: 'Jud',   chapters:  1, testament: 'NT' },
  { osis: 'REV', name: 'Revelation',      abbr: 'Rev',   chapters: 22, testament: 'NT' },
];

/** Fast lookup map: OSIS → book metadata */
export const BOOK_MAP = new Map(BOOKS.map(b => [b.osis, b]));

/** Get book metadata by OSIS ID. */
export function getBook(osis) {
  return BOOK_MAP.get(osis) ?? null;
}

/** Get all books for one testament. */
export function getTestament(t) {
  return BOOKS.filter(b => b.testament === t);
}
