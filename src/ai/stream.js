/* ============================================================
   stream.js — Universal streaming AI fetch with AbortController
   Handles SSE (Server-Sent Events) streaming from all providers.
   ============================================================ */

import { PROVIDERS, FREE_FALLBACK_PROVIDER, FREE_FALLBACK_MODEL } from './providers.js';
import { getApiKey, hasApiKey } from '../idb/byok.js';
import { toast } from '../components/layout/toast.js';

/**
 * Ordered list of providers to try when falling back.
 * All require a stored API key — Gemini's free tier is free to sign up for
 * but still needs a key (get one at aistudio.google.com).
 */
const FALLBACK_CASCADE = ['gemini', 'groq', 'mistral'];

/**
 * Stream a response from the active AI provider.
 *
 * @param {string}   prompt          — User message text
 * @param {string}   systemPrompt    — System prompt (prepended to every call)
 * @param {object}   options
 * @param {string}   options.provider — Provider id (e.g. 'gemini')
 * @param {string}   options.pin      — User's decryption PIN for BYOK key
 * @param {function} options.onChunk  — Called with each streamed text chunk
 * @param {function} options.onDone   — Called with the full response text when complete
 * @param {function} options.onError  — Called with an Error object on failure
 * @returns {AbortController}         — Call .abort() to cancel the stream
 */
export function streamAiResponse(prompt, systemPrompt, {
  provider: providerId = 'gemini',
  onChunk  = () => {},
  onDone   = () => {},
  onError  = () => {},
} = {}) {
  const controller = new AbortController();

  _doStream(prompt, systemPrompt, providerId, controller, onChunk, onDone, onError, new Set());

  return controller;
}

async function _doStream(prompt, systemPrompt, providerId, controller, onChunk, onDone, onError, _tried) {
  _tried.add(providerId);

  try {
    const config = PROVIDERS[providerId];
    if (!config) throw new Error(`Unknown provider: ${providerId}`);

    // Get the decrypted API key from IndexedDB.
    // All providers (including Gemini) require a key — Gemini's free tier
    // is free to sign up for but is not keyless.
    const apiKey = await getApiKey(providerId);
    if (!apiKey) {
      throw new Error(
        `No API key for ${config.name}. ` +
        `Add a free key in Settings → AI API Keys.`
      );
    }

    const messages = [{ role: 'user', content: prompt }];
    const payload  = config.formatPayload(messages, systemPrompt);
    const model    = config.models.default || config.models.free;
    const endpoint = config.endpoint(model);
    const headers  = config.headers(apiKey);

    const response = await fetch(endpoint, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    if (!response.ok) {
      const status = response.status;
      // Rate limit or auth failure — cascade to next available provider
      if (status === 429 || status === 401 || status === 402) {
        const next = await _nextFallback(_tried);
        if (next) {
          const reason = status === 429 ? 'rate limit' : status === 401 ? 'invalid key' : 'payment required';
          toast(`${config.name} ${reason} — trying ${PROVIDERS[next].name}`, 'warning');
          await _doStream(prompt, systemPrompt, next, controller, onChunk, onDone, onError, _tried);
          return;
        }
        throw new Error(`All AI providers exhausted (${status}). Check your API keys in Settings.`);
      }
      throw new Error(`${config.name} returned ${status}`);
    }

    // Read the SSE stream
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let   full    = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json    = JSON.parse(data);
          const text    = config.parseChunk(json);
          if (text) {
            full += text;
            onChunk(text);
          }
        } catch {
          // Malformed SSE chunk — skip
        }
      }
    }

    onDone(full);

  } catch (err) {
    if (err.name === 'AbortError') return; // User cancelled — not an error
    console.error('[stream.js] AI stream error:', err);
    onError(err);
  }
}

/**
 * Return the next provider in the fallback cascade that hasn't been tried yet
 * and that the user has a stored key for.
 */
async function _nextFallback(tried) {
  for (const id of FALLBACK_CASCADE) {
    if (tried.has(id)) continue;
    if (await hasApiKey(id)) return id;
  }
  return null;
}
