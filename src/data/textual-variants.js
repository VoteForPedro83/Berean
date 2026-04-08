/* ============================================================
   textual-variants.js — Static lookup of NT textual variants
   ============================================================
   Three categories:
     ABSENT_VERSES      — individual verses not found in the oldest manuscripts
     LATE_ADDITION_RANGES — passage ranges widely regarded as later additions
     DISPUTED_VERSES    — verses present in some early MSS but absent from others

   Sources: NA28/UBS5 apparatus, Bruce Metzger "A Textual Commentary on
   the Greek New Testament" (4th ed.), and the SBLGNT apparatus.

   These notes appear in both normal reading mode and interlinear mode.
   They are informational, not theological — the text of the verse is
   still displayed but visually distinguished.
   ============================================================ */

// ── Individual absent verses ──────────────────────────────────────────────────
// Verses that appear in the Received Text / KJV tradition but are
// absent from the earliest and most reliable Greek manuscripts.
// The verse number is "skipped" in critical editions (e.g. the ESV
// simply omits v. 4 from its numbering in John 5).

export const ABSENT_VERSES = new Set([
  // Matthew
  'MAT.17.21',  // "Howbeit this kind goeth not out but by prayer and fasting" — not in ℵ B
  'MAT.18.11',  // "For the Son of Man is come to save..." — not in ℵ B L Θ
  'MAT.23.14',  // "Woe to you, scribes and Pharisees...devour widows' houses" — not in earliest MSS

  // Mark
  'MRK.7.16',   // "If any man have ears to hear, let him hear" — not in ℵ B L Δ
  'MRK.9.44',   // "Where their worm dieth not..." — not in early MSS (repetition of 9:48)
  'MRK.9.46',   // Same as 9:44 — not in early MSS
  'MRK.11.26',  // "But if ye do not forgive..." — not in ℵ B L W
  'MRK.15.28',  // "And the scripture was fulfilled..." — not in ℵ A B C D

  // Luke
  'LUK.17.36',  // "Two men shall be in the field..." — not in most early MSS
  'LUK.23.17',  // "For of necessity he must release one..." — not in ℵ A B

  // John
  'JHN.5.4',    // The angel troubling the water — not in ℵ B C* D and others

  // Acts
  'ACT.8.37',   // Philip's baptismal question to the eunuch — not in early MSS
  'ACT.15.34',  // "Notwithstanding it pleased Silas to abide there still" — not in early MSS
  'ACT.24.7',   // Part of v.6 and addition — textually complex; not in ℵ A B H L P
  'ACT.28.29',  // "And when he had said these words..." — not in early MSS

  // Romans
  'ROM.16.24',  // Grace benediction repeated — not in ℵ A B C

  // 1 John
  '1JN.5.7b',   // Johannine Comma — "in heaven: the Father, the Word, and the Holy Ghost..."
                // Note: only the interpolated clause; v.7 itself is kept. Handled via RANGE below.
]);

// ── Late addition ranges ──────────────────────────────────────────────────────
// Entire passages considered later additions. A banner is shown before the
// first verse; every verse in the range is visually distinguished.

export const LATE_ADDITION_RANGES = [
  {
    id:    'MRK-long-ending',
    start: 'MRK.16.9',
    end:   'MRK.16.20',
    label: 'The Long Ending of Mark (16:9–20)',
    note:  'These verses do not appear in the two oldest manuscripts — Codex Sinaiticus (ℵ) and Codex Vaticanus (B) — and are absent from several early church fathers\' commentaries on Mark. A shorter ending also circulates in some manuscripts. Most modern critical editions include these verses but bracket them. The story may be authentic tradition, but these are not considered original to Mark.',
  },
  {
    id:    'JHN-pericope-adulterae',
    start: 'JHN.7.53',
    end:   'JHN.8.11',
    label: 'The Pericope Adulterae — Woman Caught in Adultery (7:53–8:11)',
    note:  'This passage is absent from the oldest Greek manuscripts (ℵ, B, and many others) and from the earliest translations. In some later manuscripts it appears after Luke 21:38 or at the end of John. Its vocabulary and style differ from the rest of John. The story may preserve an authentic tradition about Jesus but was not part of John\'s original text.',
  },
];

// Build a fast set of all OSIS IDs that fall inside a late-addition range
// (used during rendering to style individual verses without re-scanning ranges)
export const LATE_ADDITION_VERSES = buildLateAdditionSet();

function buildLateAdditionSet() {
  const set = new Set();

  // Mark 16:9-20
  for (let v = 9; v <= 20; v++) set.add(`MRK.16.${v}`);

  // John 7:53 and John 8:1-11
  set.add('JHN.7.53');
  for (let v = 1; v <= 11; v++) set.add(`JHN.8.${v}`);

  return set;
}

// ── Disputed verses ───────────────────────────────────────────────────────────
// Present in some early manuscripts but absent from others — genuinely debated.
// Displayed with a lighter note rather than the absent/late-addition treatment.

export const DISPUTED_VERSES = new Set([
  'LUK.22.43',  // "And there appeared an angel unto him from heaven, strengthening him"
  'LUK.22.44',  // "And being in an agony he prayed more earnestly: and his sweat was as it were great drops of blood"
  // Both are in ℵ* D but absent from ℵ² A B N T W and others. Some scribes may have
  // omitted them as theologically difficult. Most scholars consider them authentic.
]);

// ── Per-verse note text ───────────────────────────────────────────────────────
// Override the default note text for specific verses where more detail helps.

export const VARIANT_NOTES = {
  'JHN.5.4':
    'Not found in the oldest manuscripts. An early scribe appears to have added this verse to explain why the pool at Bethesda had healing properties (described in v.7). Absent from Papyrus 66, Papyrus 75, Codex Sinaiticus, and Codex Vaticanus.',

  'ACT.8.37':
    'Not found in early manuscripts. This verse — Philip\'s question and the eunuch\'s profession of faith — appears to be a baptismal formula added by a later scribe. Absent from Papyrus 45, Codex Sinaiticus, Codex Vaticanus, and Codex Alexandrinus.',

  'MAT.17.21':
    'Not found in the oldest manuscripts. This verse ("this kind goeth not out but by prayer and fasting") appears to have been borrowed from Mark 9:29 and inserted here by a later copyist.',

  'MAT.18.11':
    'Not found in the oldest manuscripts. This verse appears to have been borrowed from Luke 19:10 and inserted here.',

  'LUK.22.43':
    'The angel strengthening Jesus, and the bloody sweat (vv. 43–44), are absent from some important manuscripts but present in others, including very early ones. Most scholars consider them authentic but note the textual uncertainty.',

  'LUK.22.44':
    'See note on verse 43. The accounts of Jesus\' sweating "as it were great drops of blood" (haematidrosis) is textually disputed but may be original to Luke.',
};

// ── Helper: get the range a verse belongs to (if any) ────────────────────────
export function getRangeForVerse(osisId) {
  return LATE_ADDITION_RANGES.find(r => {
    const startParts = r.start.split('.');
    const endParts   = r.end.split('.');
    const vParts     = osisId.split('.');

    // Must be same book
    if (vParts[0] !== startParts[0]) return false;

    // Simple chapter:verse comparison (works for ranges within one or two chapters)
    const vNum   = parseInt(vParts[1]) * 1000   + parseInt(vParts[2]);
    const sNum   = parseInt(startParts[1]) * 1000 + parseInt(startParts[2]);
    const eNum   = parseInt(endParts[1]) * 1000   + parseInt(endParts[2]);
    return vNum >= sNum && vNum <= eNum;
  }) || null;
}
