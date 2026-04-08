/* ============================================================
   context.js — AI context payload builder

   LEGAL ARCHITECTURE
   ══════════════════
   Zero copyrighted Bible translation text is ever transmitted
   to any AI provider. This satisfies all known publisher API
   terms and copyright restrictions.

   THREE STRATEGIES:
   ─────────────────
   FULL_TEXT       — Public domain / CC text sent directly (WEB, KJV, ULT, UST)
   REFERENCE_RECALL — "Analyze John 3:16 (ESV)" — AI uses its own pre-trained
                     knowledge. No text transmitted. Works well for ≤3 verses.
   WEB_FALLBACK    — Long or obscure passage: silently substitute WEB text.
                     The pastor sees their chosen translation; WEB goes to AI.

   BYOK NOTE:
   ──────────
   All AI calls are made by the pastor's own browser using their own
   API key. The developer never proxies or touches AI calls.
   Liability for data transmitted sits with the end user.
   (Sony Corp. v. Universal City Studios — Betamax defence applies)
   ============================================================ */

// ── Translation licence map ───────────────────────────────────────────────────

/**
 * aiPermitted: true  → full text may be sent to AI
 * aiPermitted: false → use REFERENCE_RECALL or WEB_FALLBACK
 * offline: true      → available from local SQLite without internet
 */
export const TRANSLATION_LICENCES = {
  WEB:   { aiPermitted: true,  offline: true,  label: 'World English Bible' },
  KJV:   { aiPermitted: true,  offline: true,  label: 'King James Version (1769)' },
  ASV:   { aiPermitted: true,  offline: true,  label: 'American Standard Version' },
  SBLGNT:{ aiPermitted: true,  offline: true,  label: 'SBL Greek New Testament' },
  ULT:   { aiPermitted: true,  offline: true,  label: 'unfoldingWord Literal Text',    db: 'translations_cc' },
  UST:   { aiPermitted: true,  offline: true,  label: 'unfoldingWord Simplified Text', db: 'translations_cc' },
  // API.Bible online-only — never stored locally, never sent as text to AI
  ESV:   { aiPermitted: false, offline: false, label: 'English Standard Version' },
  NASB:  { aiPermitted: false, offline: false, label: 'New American Standard Bible' },
  NASB95:{ aiPermitted: false, offline: false, label: 'New American Standard Bible 1995' },
  CSB:   { aiPermitted: false, offline: false, label: 'Christian Standard Bible' },
  NET:   { aiPermitted: false, offline: false, label: 'New English Translation' },
  // NIV is EXCLUDED from Berean entirely — Biblica prohibits NIV in apps with AI features
  // South African / African language translations — API.Bible only, no AI text
  AFR53: { aiPermitted: false, offline: false, label: 'Afrikaans 1933/53' },
  AFR83: { aiPermitted: false, offline: false, label: 'Afrikaans 1983' },
  AFR20: { aiPermitted: false, offline: false, label: 'Die Bybel 2020' },
  ZUL59: { aiPermitted: false, offline: false, label: 'IBhayibheli Elingcwele (Zulu 1959)' },
  ZUL20: { aiPermitted: false, offline: false, label: 'IBhayibheli (Zulu 2020)' },
  XHO75: { aiPermitted: false, offline: false, label: 'IziBhalo Ezingcwele (Xhosa)' },
  SSO61: { aiPermitted: false, offline: false, label: 'Bibele (Sesotho)' },
  TSW70: { aiPermitted: false, offline: false, label: 'Bebele (Tswana)' },
};

/**
 * Short passage thresholds for REFERENCE_RECALL.
 * NT verses are extremely well-represented in AI training data.
 * OT verses are less consistent — use a tighter threshold.
 */
const RECALL_THRESHOLD_NT = 3;  // NT: up to 3 verses are usually safe
const RECALL_THRESHOLD_OT = 1;  // OT: only single, famous verses (Gen 1:1, Ps 23:1, etc.)

// ── System prompt ─────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an expert, interdenominational biblical research assistant designed to aid pastors in serious exegetical study.

Operational Directives:
- Always cite specific scripture references for every theological or historical claim.
- Maintain strict neutrality. Clearly distinguish between what the explicit text states and how it has been interpreted by different traditions.
- If a query involves significant denominational disagreement, outline the major historical views without endorsing one as absolute truth.
- Respond in the same language the user employs (English or Afrikaans).
- Refuse to generate political commentary or personalised pastoral counselling.
- Base all analysis on the provided context. Treat the pastor's notes as the primary interpretive lens.
- Every AI response must end with: "⚠️ AI-generated research assistance — verify all claims against scripture."
- When analysing a passage by reference only (no text provided), explicitly state which translation you are drawing on for your analysis.
- CRITICAL — Translation recall guard: When a passage is identified by reference and translation name only (e.g. "Romans 8:28 (ESV)"), you MUST NOT reproduce or quote that translation's wording verbatim. Instead, describe what the translation conveys conceptually, using phrases like "in the ESV rendering" or "the ESV emphasises". A World English Bible anchor text may be provided — use it only to verify the passage content; do not present WEB wording as the named translation's wording.`;

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build the full context payload for an AI call.
 *
 * @param {object} passage             — { humanRef, osisId, verseCount, textWeb, isNT, isOT, words }
 * @param {object} activeTranslation   — { id, label, aiPermitted, offline }
 * @param {string} notes               — Pastor's own notes (always permitted)
 * @param {Array}  commentaryExcerpts  — Public domain commentary snippets (always permitted)
 * @returns {{ userMessage: string, strategy: string, basisLabel: string }}
 */
export function buildAiContext(passage, activeTranslation, notes = '', commentaryExcerpts = []) {
  const translation = activeTranslation || TRANSLATION_LICENCES.WEB;
  const strategy    = selectStrategy(passage, translation);

  const passageRef  = buildPassageRef(passage, translation, strategy);
  const greekBlock  = buildGreekContext(passage);
  const hebrewBlock = buildHebrewContext(passage);

  const parts = [];

  // 1. Passage reference / text
  parts.push(`PASSAGE:\n${passageRef}`);

  // 2. Original language data (always permitted — morphological metadata, not translation text)
  if (greekBlock) parts.push(`GREEK MORPHOLOGICAL DATA:\n${greekBlock}`);
  if (hebrewBlock) parts.push(`HEBREW MORPHOLOGICAL DATA:\n${hebrewBlock}`);

  // 3. Commentary (public domain — always permitted)
  if (commentaryExcerpts.length) {
    parts.push(`COMMENTARY EXCERPTS (public domain):\n${commentaryExcerpts.join('\n\n')}`);
  }

  // 4. Pastor's notes (their own writing — always permitted)
  if (notes.trim()) {
    parts.push(`PASTOR'S NOTES:\n${notes}`);
  }

  // Build footnote explaining the analysis basis
  const basisLabel = buildBasisLabel(translation, strategy);

  const userMessage = parts.join('\n\n---\n\n');

  return { userMessage, strategy, basisLabel };
}

// ── Strategy selection ────────────────────────────────────────────────────────

/**
 * Exported so UI components and verify.js can check the strategy
 * before deciding whether to run a verifyRecall() preflight.
 */
export function selectStrategy(passage, translation) {
  // Public domain or CC-licensed text — send full text
  if (translation.aiPermitted) return 'FULL_TEXT';

  // Short/famous passage — AI recall is reliable
  // OT threshold is tighter because OT verses are less consistently recalled
  const verseCount  = passage.verseCount ?? 1;
  const threshold   = passage.isOT ? RECALL_THRESHOLD_OT : RECALL_THRESHOLD_NT;
  if (verseCount <= threshold) return 'REFERENCE_RECALL';

  // Long or obscure passage — silently substitute WEB
  return 'WEB_FALLBACK';
}

function buildPassageRef(passage, translation, strategy) {
  switch (strategy) {
    case 'FULL_TEXT':
      // Send actual verse text — fully licensed
      return passage.text || passage.textWeb || '';

    case 'REFERENCE_RECALL': {
      // "Analyze John 3:16 (ESV)" — AI uses pre-trained knowledge of the translation.
      // No text transmitted. The AI's recall of this translation is the AI company's
      // responsibility, not Berean's. Zero copyrighted text is sent.
      //
      // HALLUCINATION GUARD: The WEB text is appended as a silent verification anchor.
      // WEB is public domain and always permitted. The AI is instructed (via SYSTEM_PROMPT
      // and the inline note below) NOT to quote the named translation verbatim — only to
      // analyse what it conveys. The WEB anchor lets the AI cross-check that it has the
      // right passage without us transmitting the copyrighted text.
      const anchor = passage.textWeb
        ? `\n\n[Verification anchor — World English Bible (public domain), for passage identification only. Do NOT present this as the ${translation.label} wording:]\n"${passage.textWeb}"`
        : '';
      return `${passage.humanRef} (${translation.label})${anchor}`;
    }

    case 'WEB_FALLBACK':
      // Long/obscure passage — use public domain WEB text instead.
      // The pastor sees their chosen translation; AI receives WEB.
      return `${passage.humanRef} — text from World English Bible:\n"${passage.textWeb || ''}"`;

    default:
      return passage.humanRef || '';
  }
}

function buildBasisLabel(translation, strategy) {
  switch (strategy) {
    case 'FULL_TEXT':
      return `Analysis based on ${translation.label} text.`;
    case 'REFERENCE_RECALL':
      return `Analysis based on ${translation.label} (AI knowledge — no text transmitted).`;
    case 'WEB_FALLBACK':
      return 'Analysis based on World English Bible text.';
    default:
      return '';
  }
}

// ── Original language context ─────────────────────────────────────────────────

/**
 * Build Greek morphological context from NT word data.
 * Source: morphgnt.sqlite3 (CC BY-SA) — always AI-permitted.
 * Sends: lemmas, Strong's numbers, morphological tags. NEVER translation text.
 */
function buildGreekContext(passage) {
  if (!passage?.isNT || !passage?.words?.length) return null;

  const lines = passage.words
    .filter(w => w.language === 'greek' && w.strongs)
    .map(w => {
      const parts = [w.surface_text || ''].filter(Boolean);
      if (w.lemma)      parts.push(`lemma:${w.lemma}`);
      if (w.strongs)    parts.push(`strongs:${w.strongs}`);
      if (w.morphology) parts.push(`morph:${w.morphology}`);
      if (w.english_gloss) parts.push(`gloss:${w.english_gloss}`);
      return parts.join(' ');
    });

  if (!lines.length) return null;
  return lines.join('\n');
}

/**
 * Build Hebrew morphological context from OT word data.
 * Source: ETCBC/WLC data (CC BY-NC 4.0) — always AI-permitted for inference.
 * CITATION: DOI 10.17026/dans-z6y-skyh
 * Sends: lemmas, Strong's numbers, morphological tags. NEVER translation text.
 */
function buildHebrewContext(passage) {
  if (!passage?.isOT || !passage?.words?.length) return null;

  const lines = passage.words
    .filter(w => w.language === 'hebrew' && w.strongs)
    .map(w => {
      const parts = [w.surface_text || ''].filter(Boolean);
      if (w.lemma)      parts.push(`lemma:${w.lemma}`);
      if (w.strongs)    parts.push(`strongs:${w.strongs}`);
      if (w.morphology) parts.push(`morph:${w.morphology}`);
      return parts.join(' ');
    });

  if (!lines.length) return null;
  return lines.join('\n') + '\n(Hebrew data: ETCBC/BHSA — DOI 10.17026/dans-z6y-skyh)';
}
