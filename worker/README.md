# WeatherBubb CORS proxy (Cloudflare Worker)

Stock, quote and news bubbles need APIs that don't send CORS headers, so a
static site can't call them directly. This worker is the relay that makes
them work. It replaces the free public CORS proxies the app used to depend
on, all of which eventually failed (auth walls, permanent timeouts, dead
domains).

Free tier covers 100,000 requests/day. With the 60-second edge cache in
`weatherbubb-proxy.js`, normal use is nowhere near that.

## Deploy it (about 10 minutes, no command line needed)

1. Sign up at **https://dash.cloudflare.com/sign-up** (free — you do *not*
   need to move your domain to Cloudflare for this).
2. In the dashboard sidebar: **Compute (Workers) → Workers & Pages →
   Create → Start with Hello World → Deploy**. Name it something like
   `weatherbubb-proxy`. (Deploy the placeholder first; you replace the code
   in the next step.)
3. Open the worker → **Edit code**. Delete the placeholder, paste the
   entire contents of `weatherbubb-proxy.js`, then **Deploy**.
4. Your URL will look like:
   `https://weatherbubb-proxy.<your-subdomain>.workers.dev`
5. Sanity check it by opening **`<your worker URL>/health`** in a browser
   tab. You should get a JSON blob with `"worker": "weatherbubb-proxy"`
   plus the origin it saw and both allowlists. That confirms *this* code
   is the code actually deployed — if you instead see `Hello World!`, the
   placeholder from step 2 is still live and the paste in step 3 didn't
   take.
6. Opening the worker's **root** URL in a plain tab gives
   `{"error":"Origin not allowed: (none sent)"}`. **That's also correct**
   — a plain tab sends no Origin header. It works from the site itself.
7. Send that URL over and it gets wired into the app (one line —
   `CUSTOM_PROXY_URL` at the top of the script in `index.html`).

## If the bubbles still don't load

Open the in-app debug panel. Every relay refusal now reports its own
reason, e.g.:

    [Quote] worker: failed after 5ms -- HTTP 403 -- {"error":"Origin not allowed: https://example.com"}

and the startup line reports the origin the browser is actually sending:

    [Env] origin: https://3thand.github.io | page: /weatherbubb/ | relay: https://...workers.dev

If the origin in that line isn't in `ALLOWED_ORIGINS`, add it and
redeploy — that's the whole fix.

A bare `Failed to fetch` with no status means the response carried no CORS
headers at all, which this worker never does. That points at something
other than this code answering: the Hello World placeholder, a worker
that threw before returning (check the Cloudflare dashboard's Logs tab),
or the request never arriving.

## What it will and won't do

It will only ever fetch these hosts:

- `query1.finance.yahoo.com`, `query2.finance.yahoo.com` — stock quotes
- `zenquotes.io` — quote of the day
- `news.google.com` — news RSS

Anything else gets a 403. That allowlist is the main safeguard: every host
it can reach is a public API that anyone could already call directly, so
the worker isn't worth abusing even if someone finds the URL. It also only
accepts GET, only accepts requests from a WeatherBubb origin, forwards no
cookies or auth headers upstream, caps response size at 2 MB, and times out
after 10 seconds.

Refusals are returned *with* CORS headers so the browser can read them.
That's deliberate and costs nothing: the request is still refused and no
upstream call is made, but the caller learns which rule it tripped instead
of getting an unexplained network error. `/health` is read-only and makes
no upstream call either, even if you hand it a `?url=`.

There are no API keys or secrets in the worker — none of these APIs need
one, so there's nothing sensitive to leak.

## Adding another API later

Add the hostname to `ALLOWED_TARGET_HOSTS` in `weatherbubb-proxy.js` and
redeploy. Keep that list as short as the app actually needs — it's the
control doing the real work here.
