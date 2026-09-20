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
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function deny(status, message, origin) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : null;

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
      // No CORS headers on this response, so a browser couldn't read it anyway.
      return deny(403, 'Origin not allowed.', null);
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
