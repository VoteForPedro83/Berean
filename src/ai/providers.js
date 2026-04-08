/* ============================================================
   providers.js — AI provider configurations
   All AI calls are BYOK (Bring Your Own Key) — made client-side
   using the pastor's own API key. The developer never touches
   any AI API. Liability sits with the end user.
   ============================================================ */

export const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    endpoint: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    models: { free: 'gemini-2.5-flash', default: 'gemini-2.5-flash' },
    headers: (key) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    }),
    corsNative: true,
    maxContextTokens: 1_000_000,
    formatPayload: (messages, system) => ({
      system_instruction: system ? { parts: [{ text: system }] } : undefined,
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature: 0.7 },
    }),
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
      'anthropic-dangerous-direct-browser-access': 'true', // Required for CORS
    }),
    corsNative: true,
    maxContextTokens: 200_000,
    formatPayload: (messages, system) => ({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system: system || undefined,
      messages,
      stream: true,
    }),
    parseChunk: (chunk) => chunk.delta?.text || '',
  },

  openai: {
    name: 'OpenAI',
    endpoint: () => '/api/openai/v1/chat/completions', // Cloudflare Worker proxy
    models: { default: 'gpt-4o-mini' },
    headers: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    }),
    corsNative: false, // BLOCKED by OpenAI CORS — must use Cloudflare Worker proxy
    maxContextTokens: 128_000,
    formatPayload: (messages, system) => ({
      model: 'gpt-4o-mini',
      stream: true,
      messages: system
        ? [{ role: 'system', content: system }, ...messages]
        : messages,
    }),
    parseChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
  },

  groq: {
    name: 'Groq',
    endpoint: () => 'https://api.groq.com/openai/v1/chat/completions',
    models: { default: 'llama-3.3-70b-versatile' },
    headers: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    }),
    corsNative: true,
    maxContextTokens: 800, // HARD LIMIT — single verse queries only (1000 TPM free tier)
    formatPayload: (messages, system) => ({
      model: 'llama-3.3-70b-versatile',
      stream: true,
      messages: system
        ? [{ role: 'system', content: system }, ...messages]
        : messages,
    }),
    parseChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
  },

  mistral: {
    name: 'Mistral',
    endpoint: () => 'https://api.mistral.ai/v1/chat/completions',
    models: { default: 'mistral-small-latest' },
    headers: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    }),
    corsNative: true,
    maxContextTokens: 32_000,
    formatPayload: (messages, system) => ({
      model: 'mistral-small-latest',
      stream: true,
      messages: system
        ? [{ role: 'system', content: system }, ...messages]
        : messages,
    }),
    parseChunk: (chunk) => chunk.choices?.[0]?.delta?.content || '',
  },

  cohere: {
    name: 'Cohere',
    endpoint: () => 'https://api.cohere.ai/v1/chat',
    models: { default: 'command-r-plus' },
    headers: (key) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    }),
    corsNative: true,
    maxContextTokens: 128_000,
    formatPayload: (messages, system) => ({
      model: 'command-r-plus',
      stream: true,
      preamble: system || undefined,
      message: messages[messages.length - 1]?.content || '',
      chat_history: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: m.content,
      })),
    }),
    parseChunk: (chunk) => chunk.text || '',
  },
};

/**
 * Preferred fallback provider when a BYOK provider fails.
 * Gemini has a free-tier API key available at aistudio.google.com — a key
 * is still required; there is no keyless/anonymous access.
 */
export const FREE_FALLBACK_PROVIDER = 'gemini';
export const FREE_FALLBACK_MODEL    = 'gemini-2.5-flash';
