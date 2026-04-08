# Berean — AI Integration Reference

## Provider Configurations (src/ai/providers.js)

```javascript
export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    endpoint: (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`,
    models: { free: 'gemini-2.5-flash', default: 'gemini-2.5-flash' },
    headers: (key) => ({ 'Content-Type': 'application/json', 'x-goog-api-key': key }),
    corsNative: true,
    maxContextTokens: 1_000_000,
    parseChunk: (chunk) => chunk.candidates?.[0]?.content?.parts?.[0]?.text || '',
  },
  anthropic: {
    name: 'Anthropic Claude',
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    models: { default: 'claude-3-5-haiku-20241022' },
    headers: (key) => ({
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    corsNative: true,
    maxContextTokens: 200_000,
    parseChunk: (chunk) => chunk.delta?.text || '',
  },
  openai: {
    name: 'OpenAI',
    endpoint: () => '/api/openai/v1/chat/completions', // Routes through Cloudflare Worker
    models: { default: 'gpt-4o-mini' },
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    corsNative: false, // BLOCKED — must use Cloudflare Worker proxy
    maxContextTokens: 128_000,
    parseChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
  },
  groq: {
    name: 'Groq',
    endpoint: () => 'https://api.groq.com/openai/v1/chat/completions',
    models: { default: 'llama-3.3-70b-versatile' },
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    corsNative: true,
    maxContextTokens: 800, // HARD LIMIT — single verse queries only. 1000 TPM free tier.
    parseChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
  },
  mistral: {
    name: 'Mistral',
    endpoint: () => 'https://api.mistral.ai/v1/chat/completions',
    models: { default: 'mistral-small-latest' },
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    corsNative: true,
    maxContextTokens: 32_000,
    parseChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
  },
  cohere: {
    name: 'Cohere',
    endpoint: () => 'https://api.cohere.ai/v1/chat',
    models: { default: 'command-r-plus' },
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    corsNative: true,
    maxContextTokens: 128_000,
    parseChunk: (chunk) => chunk.text || '',
  },
};
```

---

## Translation Licence Flags (src/db/bible.js + src/ai/context.js)

```javascript
export const TRANSLATION_LICENCES = {
  // Tier 1 — Offline, fully AI-permitted
  WEB:    { aiPermitted: true,  offline: true,  label: 'World English Bible' },
  KJV:    { aiPermitted: true,  offline: true,  label: 'King James Version' },
  ULT:    { aiPermitted: true,  offline: true,  label: 'unfoldingWord Literal Text',      db: 'translations_cc' },
  UST:    { aiPermitted: true,  offline: true,  label: 'unfoldingWord Simplified Text',   db: 'translations_cc' },
  ZUL_TW: { aiPermitted: true,  offline: true,  label: 'IsiZulu (Toleo Wazi)',            db: 'translations_cc' },
  XHO_TW: { aiPermitted: true,  offline: true,  label: 'IsiXhosa (Toleo Wazi)',           db: 'translations_cc' },
  NSO_TW: { aiPermitted: true,  offline: true,  label: 'Sesotho sa Leboa (Toleo Wazi)',   db: 'translations_cc' },
  SSO_TW: { aiPermitted: true,  offline: true,  label: 'Sesotho (Toleo Wazi)',            db: 'translations_cc' },
  SWA_TW: { aiPermitted: true,  offline: true,  label: 'siSwati (Toleo Wazi)',            db: 'translations_cc' },
  TSO_TW: { aiPermitted: true,  offline: true,  label: 'Xitsonga (Toleo Wazi)',           db: 'translations_cc' },
  // Tier 2 — API only, NOT sent to AI as text
  ESV:   { aiPermitted: false, offline: false, label: 'English Standard Version' },
  NASB:  { aiPermitted: false, offline: false, label: 'New American Standard Bible' },
  CSB:   { aiPermitted: false, offline: false, label: 'Christian Standard Bible' },
  AFR53: { aiPermitted: false, offline: false, label: 'Afrikaans 1933/53' },
  AFR83: { aiPermitted: false, offline: false, label: 'Afrikaans 1983' },
  AFR20: { aiPermitted: false, offline: false, label: 'Die Bybel 2020' },
  ZUL59: { aiPermitted: false, offline: false, label: 'IsiZulu 1959' },
  XHO96: { aiPermitted: false, offline: false, label: 'IsiXhosa 1996' },
  TWS70: { aiPermitted: false, offline: false, label: 'Setswana 1970' },
  // NIV EXCLUDED ENTIRELY — Biblica prohibits NIV in any app with AI features
};
```

---

## AI Context Strategy (src/ai/context.js)

**LEGAL RULE: Zero copyrighted text ever transmitted to any AI provider.**

```javascript
const RECALL_THRESHOLD_NT = 3; // AI recall reliable for ≤3 NT verses
const RECALL_THRESHOLD_OT = 1; // OT recalled less consistently — only 1 verse safe

export function selectStrategy(passage, translation) {
  if (translation.aiPermitted) return 'FULL_TEXT';
  const threshold = passage.isOT ? RECALL_THRESHOLD_OT : RECALL_THRESHOLD_NT;
  if (passage.verseCount <= threshold) return 'REFERENCE_RECALL';
  return 'WEB_FALLBACK';
}

// REFERENCE_RECALL: "John 3:16 (ESV)" + silent WEB anchor text
// WEB_FALLBACK: substitutes public domain WEB text silently
// FULL_TEXT: sends actual text (Tier 1 translations only)
```

### Recall Verification (src/ai/verify.js)
- Ask AI to quote the verse, compare against API.Bible cache text in browser
- Jaccard similarity ≥ 0.72 = match; < 0.72 = auto-promote to WEB_FALLBACK
- All comparison in local JS — copyrighted text never leaves browser

---

## BYOK Key Storage (src/idb/byok.js)

```javascript
async function saveApiKey(provider, rawKey, userPin) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(userPin), 'PBKDF2', false, ['deriveKey']);
  const cryptoKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoder.encode(rawKey));
  await db.put('ByokKeys', { provider, ciphertext, salt, iv, cryptoKey });
}
```

---

## Required UI Disclaimers

Every AI response panel MUST show:
```html
<footer class="ai-disclaimer">
  AI-generated research assistance — verify all claims against scripture.
</footer>
<footer class="ai-analysis-basis" data-strategy="">
  <!-- FULL_TEXT: "Analysis based on [translation name] text." -->
  <!-- REFERENCE_RECALL: "Analysis based on [translation name] (AI knowledge)." -->
  <!-- WEB_FALLBACK: "Analysis based on World English Bible text." -->
</footer>
```

BYOK modal MUST show:
> "By entering an API key, you confirm that you are responsible for your own usage of that AI service and compliance with its terms. This application does not transmit copyrighted Bible translation text to AI providers."

---

## System Prompt (prepend to every AI call)

```
You are an expert, interdenominational biblical research assistant designed to aid pastors in serious exegetical study.

Operational Directives:
- Always cite specific scripture references for every theological or historical claim.
- Maintain strict neutrality. Clearly distinguish between what the text states and how it has been interpreted.
- If a query involves denominational disagreement, outline major historical views without endorsing one.
- Respond in the same language the user employs (English or Afrikaans).
- Refuse to generate political commentary or personalised pastoral counselling.
- Base all analysis on the provided context. Treat the pastor's notes as the primary interpretive lens.
- Every AI response panel must show: "AI-generated research assistance — verify all claims against scripture."

CRITICAL — Translation recall guard:
When a passage is provided by reference only (e.g. "John 3:16 (ESV)"), do NOT quote the verse
verbatim as if certain of exact wording. Paraphrase or describe the meaning.
If a World English Bible anchor text is provided in brackets, use it only to confirm the passage —
never present WEB wording as the requested translation's wording.
```

---

## Fallback Cascade (src/ai/fallback.js)
On HTTP 429, 401, 402 from any BYOK provider:
1. Show toast: "Provider rate limit exceeded — switching to Gemini"
2. Re-route identical prompt to free Gemini endpoint
3. Log fallback event to console only (never to server)
