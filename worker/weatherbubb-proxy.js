/**
 * WeatherBubb CORS proxy -- Cloudflare Worker
 *
 * WeatherBubb is a static site, so it can only call APIs that send CORS
 * headers. Yahoo Finance, ZenQuotes and Google News don't, which is why
 * those bubbles previously went through free public CORS relays. Every
 * one of those relays eventually died (auth walls, timeouts, dead
 * domains), so this replaces them with an endpoint we control.
 *
 * SECURITY NOTES -- this is a public URL, so it's deliberately narrow:
 *
 *   1. Target allowlist. It will only ever fetch the exact hosts below.
 *      This is the important one: it means the worker has essentially no
 *      value to anyone who finds the URL, because every host it can reach
 *      is a public API they could already hit directly. It can't be
 *      turned into a general-purpose open proxy.
 *   2. Origin allowlist. Requests must come from a WeatherBubb origin.
 *      (Spoofable outside a browser, so it's a courtesy control, not a
 *      boundary -- #1 is what actually contains the blast radius.)
 *   3. GET only. No POST/PUT/DELETE reach upstream.
 *   4. No credentials forwarded. Cookies and Authorization headers from
 *      the caller are dropped rather than passed upstream.
 *   5. Response size cap and an upstream timeout.
 *   6. Edge caching, which also keeps usage far under the free tier's
 *      100k requests/day (five stock bubbles refreshing the same ticker
 *      collapse into one upstream call per cache window).
 *
 * There are no API keys or secrets in this file -- none of these APIs
 * require one. Nothing here is sensitive.
 */

const ALLOWED_TARGET_HOSTS = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'zenquotes.io',
  'news.google.com',
  // Reddit stopped sending CORS headers on its .json endpoints, so a
  // browser can't read them directly however well-formed the request is.
  'www.reddit.com',
  'old.reddit.com',
]);

const ALLOWED_ORIGINS = new Set([
  'https://weatherbubb.com',
  'https://www.weatherbubb.com',
  'https://3thand.github.io',
]);

const CACHE_SECONDS = 60;
const UPSTREAM_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Every response carries CORS headers -- including refusals.
//
// Refusals used to be sent without them, on the reasoning that a browser
// couldn't read a rejection anyway. That backfired: a refusal with no CORS
// headers is indistinguishable in the browser from the worker being down,
// a DNS failure, or a firewall drop. They all surface as the same bare
// "Failed to fetch" with no status and no message, which made a simple
// origin mismatch cost a full debugging round trip.
//
// Reflecting the caller's origin on a refusal gives away nothing: the
// response is a rejection, it carries no upstream data, it needs no
// credentials, and the request was refused regardless. The target
// allowlist below is what actually contains the blast radius.
function deny(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : null;

    // Health check, reachable from a plain browser tab (which sends no
    // Origin header). Confirms *this* code is what's deployed and reports
    // the origin it sees, so "is the worker even running my script?" is a
    // question you answer by opening a URL rather than by deploying again.
    if (new URL(request.url).pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        worker: 'weatherbubb-proxy',
        originSeen: origin || '(none sent)',
        originAllowed: Boolean(allowedOrigin),
        allowedOrigins: [...ALLOWED_ORIGINS],
        allowedTargets: [...ALLOWED_TARGET_HOSTS],
      }, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowedOrigin ? 204 : 403,
        headers: allowedOrigin ? corsHeaders(allowedOrigin) : {},
      });
    }

    if (request.method !== 'GET') {
      return deny(405, 'Only GET is supported.', allowedOrigin);
    }

    if (!allowedOrigin) {
      // Name the origin actually seen. Without it, diagnosing this from a
      // client debug log means guessing at what the browser sent.
      return deny(403, `Origin not allowed: ${origin || '(none sent)'}`, origin);
    }

    const rawTarget = new URL(request.url).searchParams.get('url');
    if (!rawTarget) {
      return deny(400, 'Missing ?url= parameter.', allowedOrigin);
    }

    let targetUrl;
    try {
      targetUrl = new URL(rawTarget);
    } catch {
      return deny(400, 'Malformed target URL.', allowedOrigin);
    }

    if (targetUrl.protocol !== 'https:') {
      return deny(400, 'Only https targets are allowed.', allowedOrigin);
    }

    if (!ALLOWED_TARGET_HOSTS.has(targetUrl.hostname)) {
      return deny(403, `Target host not allowed: ${targetUrl.hostname}`, allowedOrigin);
    }

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        method: 'GET',
        // Deliberately minimal, and note what is NOT forwarded: no cookies,
        // no Authorization, nothing identifying the original caller.
        headers: {
          'Accept': '*/*',
          'User-Agent': 'weatherbubb-proxy (+https://weatherbubb.com)',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        // The only Cloudflare-specific line in this file. Every other
        // runtime ignores an unrecognised RequestInit property, so this
        // file runs unmodified on Deno Deploy too -- see README. Losing
        // it costs the edge cache, nothing else.
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
      });
    } catch (err) {
      const timedOut = err && err.name === 'TimeoutError';
      return deny(timedOut ? 504 : 502, timedOut ? 'Upstream timed out.' : 'Upstream request failed.', allowedOrigin);
    }

    const declaredLength = Number(upstream.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      return deny(413, 'Upstream response too large.', allowedOrigin);
    }

    const body = await upstream.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      return deny(413, 'Upstream response too large.', allowedOrigin);
    }

    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
        ...corsHeaders(allowedOrigin),
      },
    });
  },
};
