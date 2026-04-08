/* ============================================================
   fallback.js — Provider fallback cascade
   On 429/401/402 from any BYOK provider: re-route to free Gemini.
   Events are logged to console only — never to any server.
   ============================================================ */

import { toast } from '../components/layout/toast.js';
import { PROVIDERS, FREE_FALLBACK_PROVIDER } from './providers.js';

/**
 * Determine whether an HTTP status code should trigger a fallback.
 * 429 = rate limit, 401 = bad key, 402 = payment required
 */
export function shouldFallback(httpStatus) {
  return httpStatus === 429 || httpStatus === 401 || httpStatus === 402;
}

/**
 * Log a fallback event and show a toast to the user.
 * @param {string} fromProvider  — The provider that failed
 * @param {number} httpStatus    — The HTTP status that triggered the fallback
 */
export function notifyFallback(fromProvider, httpStatus) {
  const name = PROVIDERS[fromProvider]?.name || fromProvider;

  const reason = httpStatus === 429
    ? 'rate limit reached'
    : httpStatus === 401
    ? 'invalid API key'
    : 'payment required';

  const message = `${name} ${reason} — switching to free Gemini`;

  toast(message, 'warning');
  console.info(`[fallback.js] Provider fallback: ${fromProvider} (${httpStatus}) → ${FREE_FALLBACK_PROVIDER}`);
}

/**
 * Get the fallback provider ID.
 * Always Gemini (free tier — key required, get one free at aistudio.google.com).
 */
export function getFallbackProvider() {
  return FREE_FALLBACK_PROVIDER;
}
