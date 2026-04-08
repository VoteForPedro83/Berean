/* ============================================================
   prompts.js — AI prompt templates
   All prompts use only licensed content as described in
   context.js (FULL_TEXT / REFERENCE_RECALL / WEB_FALLBACK).
   ============================================================ */

import { buildAiContext, SYSTEM_PROMPT } from './context.js';

// ── Hallucination prevention ──────────────────────────────────────────────────

/**
 * Returns a guard clause to inject into prompts when using REFERENCE_RECALL.
 *
 * Why this matters: the AI knows translation wording from training data, but
 * may confuse similar verses or slightly misremember phrasing. The guard
 * instructs the AI to ANALYSE the translation conceptually rather than quote
 * it, so even an imperfect recall produces valid analysis rather than
 * wrong verse text displayed to the pastor.
 *
 * @param {string} strategy        — 'FULL_TEXT' | 'REFERENCE_RECALL' | 'WEB_FALLBACK'
 * @param {string} translationLabel — Human-readable translation name, e.g. "English Standard Version"
 * @returns {string}
 */
function recallGuard(strategy, translationLabel) {
  if (strategy !== 'REFERENCE_RECALL') return '';
  return `
⚠️ RECALL GUARD — the exact ${translationLabel} text was not provided. You are working from your training knowledge of this translation.
- Do NOT reproduce or quote ${translationLabel} wording verbatim.
- Describe what the ${translationLabel} conveys using phrases like "the ${translationLabel} renders this as…" or "in the ${translationLabel}, the emphasis is on…".
- Use the World English Bible anchor text (if provided above) only to confirm you have the correct passage — do not present WEB wording as ${translationLabel} wording.
- If you are uncertain about the ${translationLabel}'s exact phrasing at any point, say so explicitly rather than guessing.
`.trim();
}

/**
 * Build a passage analysis prompt.
 * Used by: Commentary summariser, Passage Guide
 */
export function passageAnalysisPrompt(passage, translation, notes, commentaryExcerpts) {
  const { userMessage, strategy, basisLabel } = buildAiContext(passage, translation, notes, commentaryExcerpts);
  const guard = recallGuard(strategy, translation?.label || '');

  return {
    system: SYSTEM_PROMPT,
    user: `Please provide a structured exegetical analysis of this passage for sermon preparation.

${userMessage}
${guard ? `\n${guard}\n` : ''}
Provide the following sections:
1. **Observations** — What does the text explicitly say? (avoid interpretation here)
2. **Interpretation** — What does it mean? Address the original context, key terms, and theological themes.
3. **Application** — How should this passage shape the life of a congregation today?
4. **Key words to study** — List any Greek/Hebrew terms worth deeper study, with their Strong's numbers if known.

${basisLabel}`,
  };
}

/**
 * Build a grammar explanation prompt for a single word.
 * Sends ONLY morphological data — zero translation text.
 * Used by: Word study panel second tab in Tippy popup
 */
export function grammarExplanationPrompt(word) {
  // Only morphological metadata is sent — no copyrighted text at all
  const parts = [
    word.strongs   && `Strong's: ${word.strongs}`,
    word.lemma     && `Lemma: ${word.lemma}`,
    word.morphology && `Morphological code: ${word.morphology}`,
    word.language  && `Language: ${word.language}`,
    word.english_gloss && `Gloss: ${word.english_gloss}`,
  ].filter(Boolean).join('\n');

  return {
    system: SYSTEM_PROMPT,
    user: `Explain the grammar and theological significance of this biblical word for a pastor preparing a sermon.

${parts}

Please cover:
1. What the morphological code means in plain English (e.g. "aorist passive indicative 3rd person singular")
2. Why this grammatical form matters for understanding the passage
3. Any significant theological or interpretive implications of this specific form
4. 2-3 other New Testament or Old Testament passages where this same form appears and is theologically significant

Keep the explanation accessible to a pastor, not a Greek/Hebrew scholar.`,
  };
}

/**
 * Build a cross-reference suggestion prompt.
 * Uses only OSIS IDs and Strong's numbers — zero translation text.
 * Used by: Cross-reference panel AI suggestions button
 */
export function crossRefSuggestionPrompt(passage) {
  return {
    system: SYSTEM_PROMPT,
    user: `Suggest the 5 most theologically significant cross-references for this passage:

Passage: ${passage.humanRef}
Strong's numbers present: ${(passage.words || []).map(w => w.strongs).filter(Boolean).join(', ')}

For each cross-reference:
- Give the exact OSIS ID (e.g. ROM.8.28, JHN.3.16)
- Explain the theological connection in 1-2 sentences
- Note whether it is a direct quotation, allusion, or thematic parallel

Only suggest cross-references you are highly confident exist. Do not hallucinate verse references.`,
  };
}

/**
 * Build a commentary summary prompt.
 * Commentary text is public domain — always permitted.
 * Used by: Commentary accordion "Summarise" button
 */
export function commentarySummaryPrompt(passage, translation, commentaryText, commentarySource) {
  const { userMessage, strategy, basisLabel } = buildAiContext(passage, translation, '', [
    `${commentarySource}:\n${commentaryText}`,
  ]);
  const guard = recallGuard(strategy, translation?.label || '');

  return {
    system: SYSTEM_PROMPT,
    user: `Summarise the following commentary on ${passage.humanRef} for a busy pastor, highlighting the most practically useful insights for preaching.

${userMessage}
${guard ? `\n${guard}\n` : ''}
Provide:
1. The commentary's main interpretive point (2-3 sentences)
2. Any historical/cultural background it highlights
3. The most useful homiletical insight for preaching

${basisLabel}`,
  };
}

/**
 * Build a word study prompt.
 * Uses Strong's and morphological data — zero translation text.
 * Used by: Word Study Workspace
 */
export function wordStudyPrompt(strongsId, lemma, language, louwNidaDomains) {
  const domainText = louwNidaDomains?.length
    ? `Louw-Nida semantic domains: ${louwNidaDomains.map(d => `${d.domain_number} (${d.domain_name})`).join(', ')}`
    : '';

  return {
    system: SYSTEM_PROMPT,
    user: `Provide a thorough word study for this biblical term, suitable for sermon preparation.

Strong's: ${strongsId}
Lemma: ${lemma}
Language: ${language}
${domainText}

Cover:
1. **Basic meaning** — core semantic range with 2-3 example usages
2. **Theological significance** — how this word functions in biblical theology
3. **Key occurrences** — 3-5 most theologically important passages where this word appears
4. **Usage in context** — how the meaning shifts across different biblical authors or contexts
5. **Preaching insight** — one practical observation for sermon preparation`,
  };
}

/**
 * Build an AI translation/paraphrase prompt.
 * Only uses aiPermitted translation text — never copyrighted text.
 * Used by: AI paraphrase panel (Stage 4)
 */
export function paraphrasePrompt(passage, translation, mode = 'plain') {
  const { userMessage, strategy, basisLabel } = buildAiContext(passage, translation);
  const guard = recallGuard(strategy, translation?.label || '');

  const modeInstructions = {
    plain:     'Rewrite in plain, clear modern English that a congregation member with no theological training can understand.',
    afrikaans: 'Translate into simple, contemporary Afrikaans as spoken in South African Reformed churches.',
    expository:'Expand the text into an expository paraphrase that makes the theological meaning explicit.',
    devotional:'Rewrite as a warm, devotional paraphrase suitable for personal Bible reading.',
  };

  // Paraphrase mode is incompatible with REFERENCE_RECALL — we cannot paraphrase a
  // translation we haven't transmitted. Promote to WEB_FALLBACK note for the pastor.
  const paraphraseNote = strategy === 'REFERENCE_RECALL'
    ? '\nNote: Because the exact translation text was not available, this paraphrase is based on the World English Bible rendering of this passage.\n'
    : '';

  return {
    system: SYSTEM_PROMPT,
    user: `${modeInstructions[mode] || modeInstructions.plain}

${userMessage}
${guard ? `\n${guard}\n` : ''}${paraphraseNote}
Important: Present this as a paraphrase or translation aid only, not as a replacement for Scripture.
Label it clearly as "AI Paraphrase" in your response.

${basisLabel}`,
  };
}
