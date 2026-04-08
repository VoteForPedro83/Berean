/* ============================================================
   verify.js — REFERENCE_RECALL preflight verification

   WHAT THIS DOES
   ══════════════
   When the pastor uses a Tier 2 translation (ESV, NASB, AFR83,
   etc.) and the passage is short enough for REFERENCE_RECALL,
   we pass "Romans 8:28 (ESV)" to the AI — no text transmitted.

   But the AI might misremember the verse. This module catches
   that before the full analysis runs:

     1. Ask AI: "Quote Romans 8:28 exactly as it reads in the ESV."
     2. Compare AI's answer against the real text API.Bible gave us
        (already on screen — we just can't SEND it to AI).
     3. If match (≥72% Jaccard word overlap): proceed with analysis.
     4. If mismatch: caller falls back to WEB_FALLBACK automatically.

   The actual verse text never leaves the browser — comparison is
   pure local JavaScript. We only transmit a single short prompt.

   HOW TO CALL (from UI components in Stage 4+)
   ═════════════════════════════════════════════
     import { verifyRecall } from '../ai/verify.js';
     import { selectStrategy } from '../ai/context.js';

     const strategy = selectStrategy(passage, translation);

     if (strategy === 'REFERENCE_RECALL') {
       const { verified, score, recalledText } = await verifyRecall(
         passage,          // must include passage.textActual (API.Bible text)
         translation,      // { label: 'English Standard Version', ... }
         activeProvider,   // e.g. 'gemini'
         apiKey,           // pastor's own API key
       );

       if (!verified) {
         // Silently promote to WEB_FALLBACK — pastor never sees this
         passage = { ...passage, forceWEBFallback: true };
       }
     }

   ============================================================ */

import { PROVIDERS } from './providers.js';

/** Minimum Jaccard word-overlap score to consider the recall correct */
const VERIFY_THRESHOLD = 0.72;

/**
 * Ask the AI to quote a verse, then compare its answer against the
 * real verse text that API.Bible already returned to the browser.
 *
 * @param {object} passage        — must include `textActual` (the real
 *                                  API.Bible text, already on screen)
 *                                  and `humanRef` (e.g. "Romans 8:28")
 * @param {object} translation    — { label: string } e.g. "English Standard Version"
 * @param {string} providerKey    — key into PROVIDERS map (e.g. 'gemini')
 * @param {string} apiKey         — pastor's own API key
 * @returns {Promise<{
 *   verified:     boolean,   — true if recall is accurate enough
 *   score:        number,    — Jaccard similarity 0.0–1.0
 *   recalledText: string,    — what the AI thought the verse said
 *   reason:       string,    — 'match' | 'mismatch' | 'no-baseline' | 'api-error'
 * }>}
 */
export async function verifyRecall(passage, translation, providerKey, apiKey) {
  // If we don't have the actual text to compare against, skip verification.
  // This can happen if API.Bible hasn't loaded yet or the verse isn't cached.
  if (!passage?.textActual?.trim()) {
    return { verified: true, score: 1.0, recalledText: '', reason: 'no-baseline' };
  }

  const prompt =
    `Quote ${passage.humanRef} exactly as it reads in the ${translation.label}. ` +
    `Respond with the verse text only — no reference, no commentary, no quotation marks.`;

  let recalledText;
  try {
    recalledText = await callAiOnce(prompt, providerKey, apiKey);
  } catch (err) {
    // Network/API error — don't block the pastor. Log and proceed.
    console.warn('[verify] Recall preflight failed, proceeding without check:', err.message);
    return { verified: true, score: 0, recalledText: '', reason: 'api-error' };
  }

  const score = jaccardSimilarity(passage.textActual, recalledText);
  const verified = score >= VERIFY_THRESHOLD;

  if (!verified) {
    console.warn(
      `[verify] Recall mismatch for ${passage.humanRef} (${translation.label}). ` +
      `Score: ${(score * 100).toFixed(0)}% — falling back to WEB_FALLBACK.`
    );
  }

  return {
    verified,
    score,
    recalledText,
    reason: verified ? 'match' : 'mismatch',
  };
}

// ── String similarity ─────────────────────────────────────────────────────────

/**
 * Jaccard similarity on word sets (case-insensitive, punctuation stripped).
 * Returns 0.0 (no overlap) to 1.0 (identical word sets).
 *
 * Jaccard is better than Levenshtein here because Bible translations differ
 * in word order and minor function words but share most content words.
 * A 72% Jaccard threshold catches wrong verses while tolerating minor
 * punctuation/capitalisation differences between printings.
 */
function jaccardSimilarity(a, b) {
  const words = s =>
    new Set(
      s.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
    );

  const setA = words(a);
  const setB = words(b);

  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union        = new Set([...setA, ...setB]).size;

  return union === 0 ? 1 : intersection / union;
}

// ── One-shot AI call (non-streaming) ─────────────────────────────────────────

/**
 * Make a single non-streaming call to an AI provider and return the text.
 * This is a lightweight alternative to stream.js — used only for the
 * short recall verification prompt.
 */
async function callAiOnce(prompt, providerKey, apiKey) {
  const config = PROVIDERS[providerKey];
  if (!config) throw new Error(`Unknown provider: "${providerKey}"`);

  const endpoint = config.endpoint(config.models.default);
  const headers  = config.headers(apiKey);
  const body     = buildBody(prompt, providerKey, config);

  const res = await fetch(endpoint, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }

  const json = await res.json();
  return extractText(json, providerKey);
}

/**
 * Build a non-streaming request body for each provider.
 * The main providers.js formatPayload functions force stream:true —
 * we override that here for the short verification call.
 */
function buildBody(prompt, providerKey, config) {
  const message = { role: 'user', content: prompt };

  switch (providerKey) {
    case 'gemini':
      return {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0 },
      };

    case 'anthropic':
      return {
        model:      config.models.default,
        max_tokens: 150,
        messages:   [message],
        // No stream:true — returns a single JSON response
      };

    case 'openai':
    case 'groq':
    case 'mistral':
      return {
        model:    config.models.default,
        messages: [message],
        max_tokens: 150,
        stream:   false,
        temperature: 0,
      };

    case 'cohere':
      return {
        model:   config.models.default,
        message: prompt,
        // No preamble, no history — bare recall query
      };

    default:
      return {
        model:    config.models?.default,
        messages: [message],
        max_tokens: 150,
        stream:   false,
      };
  }
}

/**
 * Extract the plain text reply from a non-streaming provider response.
 */
function extractText(json, providerKey) {
  switch (providerKey) {
    case 'gemini':
      return json?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    case 'anthropic':
      return json?.content?.[0]?.text || '';

    case 'openai':
    case 'groq':
    case 'mistral':
      return json?.choices?.[0]?.message?.content || '';

    case 'cohere':
      return json?.text || '';

    default:
      return '';
  }
}
