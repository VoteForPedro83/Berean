/* ============================================================
   cloudflare-worker.js — Berean Cloudflare Worker

   Endpoints:
     GET  /api/bible/*           → API.Bible proxy + KV cache (30-day TTL)
     POST /api/openai/*          → OpenAI CORS proxy (adds Authorization header)
     GET  /api/study/:id         → Fetch study pack from KV (public)
     POST /api/study/:id         → Create study pack (requires Bearer token)
     PATCH /api/study/:id        → Update study pack (requires Bearer token)
     DELETE /api/study/:id       → Delete study pack (requires Bearer token)
     POST /api/analytics/view/:id     → Increment view counter (anonymous)
     POST /api/analytics/complete/:id → Increment completion counter (opt-in)
     GET  /s/:id                 → SPA shell + Open Graph injection
     GET  /*                     → Pass through to Cloudflare Pages

   KV Bindings (configure in Cloudflare dashboard):
     STUDY_KV        — Study packs + analytics counters
     API_BIBLE_KEY   — API.Bible API key (secret)
     PREACHER_SECRET — Bearer token for authenticated endpoints

   Deploy:
     wrangler deploy worker/cloudflare-worker.js
   ============================================================ */

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    try {
      // ── API.Bible proxy ───────────────────────────────────────────────────────
      if (path.startsWith('/api/bible/')) {
        return handleApiBible(request, env, url);
      }

      // ── OpenAI CORS proxy (OpenAI blocks direct browser calls) ────────────────
      if (path.startsWith('/api/openai/')) {
        return handleOpenAiProxy(request, env, url);
      }

      // ── Study analytics (anonymous — no personal data) ────────────────────────
      if (path.startsWith('/api/analytics/')) {
        return handleAnalytics(request, env, path);
      }

      // ── Study pack CRUD ───────────────────────────────────────────────────────
      if (path.startsWith('/api/study/')) {
        return handleStudy(request, env, path);
      }

      // ── Study participant SPA route (/s/:id) — Open Graph injection ───────────
      if (path.startsWith('/s/')) {
        return handleStudyRoute(request, env, path);
      }

      // ── All other requests → pass through to Pages ────────────────────────────
      return fetch(request);

    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

// ── API.Bible proxy ───────────────────────────────────────────────────────────

async function handleApiBible(request, env, url) {
  // Only allow GET
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = env.API_BIBLE_KEY;
  if (!apiKey) return jsonResponse({ error: 'API.Bible key not configured' }, 503);

  // Build cache key from the full path + query string
  const cacheKey = `apibible:${url.pathname}${url.search}`;

  // Check KV cache first (30-day TTL)
  const cached = await env.STUDY_KV.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        ...corsHeaders(),
      },
    });
  }

  // Strip /api/bible prefix → forward to api.scripture.api.bible
  const apiBiblePath = url.pathname.replace('/api/bible', '');
  const apiBibleUrl  = `https://rest.api.bible${apiBiblePath}${url.search}`;

  const upstream = await fetch(apiBibleUrl, {
    headers: {
      'api-key': apiKey,
      'Accept':  'application/json',
    },
  });

  if (!upstream.ok) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: corsHeaders(),
    });
  }

  const body = await upstream.text();

  // Cache in KV for 30 days (API.Bible ToS requirement)
  await env.STUDY_KV.put(cacheKey, body, { expirationTtl: 60 * 60 * 24 * 30 });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      ...corsHeaders(),
    },
  });
}

// ── OpenAI CORS proxy ─────────────────────────────────────────────────────────

async function handleOpenAiProxy(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
  if (request.method !== 'POST')    return jsonResponse({ error: 'Method not allowed' }, 405);

  // The client sends its own API key in the Authorization header.
  // Worker just forwards it — never logs or stores it.
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authorization header required' }, 401);
  }

  const openAiPath = url.pathname.replace('/api/openai', '');
  const openAiUrl  = `https://api.openai.com${openAiPath}`;

  const body = await request.arrayBuffer();

  const upstream = await fetch(openAiUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': authHeader,
    },
    body,
  });

  return new Response(upstream.body, {
    status:  upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      ...corsHeaders(),
    },
  });
}

// ── Study analytics ───────────────────────────────────────────────────────────

async function handleAnalytics(request, env, path) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // /api/analytics/view/:id  or  /api/analytics/complete/:id
  const parts = path.split('/').filter(Boolean);   // ['api','analytics','view','abc']
  const type  = parts[2];  // 'view' or 'complete'
  const id    = parts[3];

  if (!id || !['view','complete'].includes(type)) {
    return jsonResponse({ error: 'Invalid analytics path' }, 400);
  }

  // POPIA compliant — no personal data. Only atomic counters.
  const key = `analytics:${type}:${id}`;
  const current = parseInt(await env.STUDY_KV.get(key) || '0', 10);
  await env.STUDY_KV.put(key, String(current + 1));

  return jsonResponse({ ok: true, count: current + 1 });
}

// ── Study pack CRUD ───────────────────────────────────────────────────────────

async function handleStudy(request, env, path) {
  const id = path.replace('/api/study/', '').split('/')[0];
  if (!id) return jsonResponse({ error: 'Study ID required' }, 400);

  const kvKey = `study:${id}`;

  switch (request.method) {
    case 'GET': {
      // Public read — no auth
      const data = await env.STUDY_KV.get(kvKey);
      if (!data) return jsonResponse({ error: 'Study not found' }, 404);
      return new Response(data, { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }

    case 'POST': {
      if (!isAuthorised(request, env)) return jsonResponse({ error: 'Unauthorised' }, 401);
      const body = await request.text();
      // Validate it's valid JSON before storing
      try { JSON.parse(body); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
      await env.STUDY_KV.put(kvKey, body);
      return jsonResponse({ ok: true, id });
    }

    case 'PATCH': {
      if (!isAuthorised(request, env)) return jsonResponse({ error: 'Unauthorised' }, 401);
      const existing = await env.STUDY_KV.get(kvKey);
      if (!existing) return jsonResponse({ error: 'Study not found' }, 404);
      const body = await request.text();
      try { JSON.parse(body); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }
      await env.STUDY_KV.put(kvKey, body);
      return jsonResponse({ ok: true, id });
    }

    case 'DELETE': {
      if (!isAuthorised(request, env)) return jsonResponse({ error: 'Unauthorised' }, 401);
      await env.STUDY_KV.delete(kvKey);
      // Purge analytics counters
      await env.STUDY_KV.delete(`analytics:view:${id}`);
      await env.STUDY_KV.delete(`analytics:complete:${id}`);
      return jsonResponse({ ok: true });
    }

    case 'OPTIONS':
      return new Response(null, { headers: corsHeaders() });

    default:
      return jsonResponse({ error: 'Method not allowed' }, 405);
  }
}

// ── Study participant route (/s/:id) ──────────────────────────────────────────

async function handleStudyRoute(request, env, path) {
  const id = path.replace('/s/', '').split('/')[0];

  // Fetch study metadata for Open Graph tags
  let title    = 'Bible Study';
  let passage  = '';
  let desc     = 'Join this Bible study on Berean.';

  if (id) {
    const data = await env.STUDY_KV.get(`study:${id}`);
    if (data) {
      try {
        const study = JSON.parse(data);
        title   = study.title   || title;
        passage = study.passage || '';
        desc    = study.description || (passage ? `Study on ${passage}` : desc);
      } catch { /* ignore parse errors */ }
    }
  }

  // Fetch the app shell from Cloudflare Pages
  const pageRes = await fetch(new URL('/', request.url).toString());
  const pageHtml = await pageRes.text();

  // Inject Open Graph meta tags using HTMLRewriter
  const ogTags = `
    <meta property="og:title"       content="${escAttr(title)}">
    <meta property="og:description" content="${escAttr(desc)}">
    <meta property="og:type"        content="website">
    <meta property="og:url"         content="${escAttr(request.url)}">
    <meta name="twitter:card"       content="summary">
    <meta name="twitter:title"      content="${escAttr(title)}">
    <meta name="twitter:description" content="${escAttr(desc)}">`;

  const modified = pageHtml.replace('</head>', `${ogTags}\n</head>`);

  return new Response(modified, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Constant-time Bearer token comparison (prevents timing attacks).
 */
function isAuthorised(request, env) {
  const secret = env.PREACHER_SECRET;
  if (!secret) return false;

  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;

  const token = auth.slice(7);

  // Timing-safe comparison using crypto.subtle
  const enc = new TextEncoder();
  const a   = enc.encode(token);
  const b   = enc.encode(secret);

  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function escAttr(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
